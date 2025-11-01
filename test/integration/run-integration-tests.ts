/**
 * Integration Test Runner
 * Orchestrates execution of all integration and end-to-end tests
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import IntegrationTestHelper, { defaultIntegrationConfig } from './integration.config';

interface TestSuite {
  name: string;
  file: string;
  description: string;
  timeout: number;
  dependencies: string[];
}

interface TestResult {
  suite: string;
  passed: boolean;
  duration: number;
  error?: string;
  coverage?: number;
}

class IntegrationTestRunner {
  private testHelper: IntegrationTestHelper;
  private results: TestResult[] = [];

  constructor() {
    this.testHelper = new IntegrationTestHelper(defaultIntegrationConfig);
  }

  /**
   * Define all integration test suites
   */
  private getTestSuites(): TestSuite[] {
    return [
      {
        name: 'End-to-End User Journey',
        file: 'user-journey-e2e.test.ts',
        description: 'Complete user flows: signup → AI chat → credit usage → payment → continued usage',
        timeout: 180000, // 3 minutes
        dependencies: ['firebase-emulator', 'test-database']
      },
      {
        name: 'Performance and Load Testing',
        file: 'performance-load.test.ts',
        description: 'Concurrent operations, scalability, and performance under load',
        timeout: 240000, // 4 minutes
        dependencies: ['firebase-emulator', 'test-database', 'performance-monitoring']
      },
      {
        name: 'Security and Compliance',
        file: 'security-compliance.test.ts',
        description: 'Authentication, authorization, data privacy, and security validation',
        timeout: 120000, // 2 minutes
        dependencies: ['firebase-emulator', 'test-database', 'security-tools']
      }
    ];
  }

  /**
   * Setup test environment
   */
  private async setupEnvironment(): Promise<void> {
    console.log('🔧 Setting up integration test environment...');
    
    await this.testHelper.setupTestEnvironment();
    
    // Verify required dependencies
    await this.verifyDependencies();
    
    console.log('✅ Integration test environment ready');
  }

  /**
   * Verify test dependencies
   */
  private async verifyDependencies(): Promise<void> {
    console.log('🔍 Verifying test dependencies...');
    
    const requiredFiles = [
      '../../src/app.ts',
      '../../src/features/credit-system/services/index.ts',
      '../../src/features/payment-processing/services/index.ts',
      '../../src/features/ai-assistant/services/index.ts'
    ];

    for (const file of requiredFiles) {
      try {
        await fs.access(path.join(__dirname, file));
        console.log(`✅ Dependency verified: ${file}`);
      } catch (error) {
        throw new Error(`Missing required dependency: ${file}`);
      }
    }
  }

  /**
   * Run a single test suite
   */
  private async runTestSuite(suite: TestSuite): Promise<TestResult> {
    console.log(`\n🧪 Running test suite: ${suite.name}`);
    console.log(`📝 Description: ${suite.description}`);
    console.log(`⏱️  Timeout: ${suite.timeout / 1000}s`);
    
    const startTime = Date.now();
    
    try {
      // Run the test using Jest
      const testResult = await this.executeJestTest(suite);
      
      const duration = Date.now() - startTime;
      
      const result: TestResult = {
        suite: suite.name,
        passed: testResult.success,
        duration,
        coverage: testResult.coverage
      };

      if (testResult.success) {
        console.log(`✅ Test suite passed: ${suite.name} (${duration}ms)`);
      } else {
        console.log(`❌ Test suite failed: ${suite.name} (${duration}ms)`);
        result.error = testResult.error;
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.log(`💥 Test suite crashed: ${suite.name} (${duration}ms)`);
      console.error(error);
      
      return {
        suite: suite.name,
        passed: false,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute Jest test
   */
  private async executeJestTest(suite: TestSuite): Promise<{ success: boolean; error?: string; coverage?: number }> {
    return new Promise((resolve) => {
      const testFile = path.join(__dirname, suite.file);
      
      const jestProcess = spawn('npx', [
        'jest',
        testFile,
        '--testTimeout', suite.timeout.toString(),
        '--verbose',
        '--coverage',
        '--coverageReporters=json-summary',
        '--forceExit'
      ], {
        stdio: 'pipe',
        cwd: path.join(__dirname, '../..')
      });

      let stdout = '';
      let stderr = '';

      jestProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        process.stdout.write(data);
      });

      jestProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });

      jestProcess.on('close', async (code) => {
        const success = code === 0;
        
        // Try to read coverage information
        let coverage: number | undefined;
        try {
          const coverageFile = path.join(__dirname, '../../coverage/coverage-summary.json');
          const coverageData = JSON.parse(await fs.readFile(coverageFile, 'utf8'));
          coverage = coverageData.total.lines.pct;
        } catch (error) {
          // Coverage file not found or invalid
        }

        resolve({
          success,
          error: success ? undefined : stderr || stdout,
          coverage
        });
      });

      jestProcess.on('error', (error) => {
        resolve({
          success: false,
          error: error.message
        });
      });
    });
  }

  /**
   * Generate test report
   */
  private generateReport(): void {
    console.log('\n📊 Integration Test Report');
    console.log('=' .repeat(50));
    
    const totalSuites = this.results.length;
    const passedSuites = this.results.filter(r => r.passed).length;
    const failedSuites = totalSuites - passedSuites;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    const averageCoverage = this.results
      .filter(r => r.coverage !== undefined)
      .reduce((sum, r, _, arr) => sum + (r.coverage! / arr.length), 0);

    console.log(`\n📈 Summary:`);
    console.log(`  Total Suites: ${totalSuites}`);
    console.log(`  Passed: ${passedSuites} ✅`);
    console.log(`  Failed: ${failedSuites} ${failedSuites > 0 ? '❌' : ''}`);
    console.log(`  Success Rate: ${((passedSuites / totalSuites) * 100).toFixed(1)}%`);
    console.log(`  Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`  Average Coverage: ${averageCoverage.toFixed(1)}%`);

    console.log(`\n📋 Detailed Results:`);
    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      const duration = (result.duration / 1000).toFixed(2);
      const coverage = result.coverage ? ` (${result.coverage.toFixed(1)}% coverage)` : '';
      
      console.log(`  ${status} ${result.suite}: ${duration}s${coverage}`);
      
      if (!result.passed && result.error) {
        console.log(`    Error: ${result.error.split('\n')[0]}`);
      }
    });

    // Performance metrics
    const performanceMetrics = this.testHelper.getPerformanceMetrics();
    if (performanceMetrics) {
      console.log(`\n⚡ Performance Metrics:`);
      console.log(`  Metrics collected at: ${performanceMetrics.timestamp}`);
      console.log(`  Total metrics: ${Object.keys(performanceMetrics.metrics).length}`);
    }

    console.log('\n' + '='.repeat(50));
    
    if (failedSuites > 0) {
      console.log(`❌ Integration tests failed: ${failedSuites} suite(s) failed`);
      process.exit(1);
    } else {
      console.log(`🎉 All integration tests passed successfully!`);
      process.exit(0);
    }
  }

  /**
   * Cleanup test environment
   */
  private async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up test environment...');
    
    await this.testHelper.cleanupTestEnvironment();
    
    console.log('✅ Cleanup completed');
  }

  /**
   * Run all integration tests
   */
  async runAll(): Promise<void> {
    console.log('🚀 Starting Integration Test Suite');
    console.log('=' .repeat(50));
    
    try {
      // Setup
      await this.setupEnvironment();
      
      // Get test suites
      const testSuites = this.getTestSuites();
      
      console.log(`\n📋 Test Suites to Execute: ${testSuites.length}`);
      testSuites.forEach((suite, index) => {
        console.log(`  ${index + 1}. ${suite.name}`);
        console.log(`     ${suite.description}`);
      });
      
      // Run tests sequentially to avoid resource conflicts
      for (const suite of testSuites) {
        const result = await this.runTestSuite(suite);
        this.results.push(result);
        
        // Short pause between test suites
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Generate report
      this.generateReport();
      
    } catch (error) {
      console.error('\n💥 Integration test runner failed:', error);
      process.exit(1);
    } finally {
      // Cleanup
      await this.cleanup();
    }
  }

  /**
   * Run specific test suite
   */
  async runSuite(suiteName: string): Promise<void> {
    console.log(`🚀 Running specific test suite: ${suiteName}`);
    
    try {
      await this.setupEnvironment();
      
      const testSuites = this.getTestSuites();
      const suite = testSuites.find(s => s.name.toLowerCase().includes(suiteName.toLowerCase()));
      
      if (!suite) {
        throw new Error(`Test suite not found: ${suiteName}`);
      }
      
      const result = await this.runTestSuite(suite);
      this.results.push(result);
      
      this.generateReport();
      
    } catch (error) {
      console.error('\n💥 Test suite execution failed:', error);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }
}

// CLI interface
if (require.main === module) {
  const runner = new IntegrationTestRunner();
  const args = process.argv.slice(2);
  
  if (args.length > 0) {
    // Run specific suite
    runner.runSuite(args[0]);
  } else {
    // Run all suites
    runner.runAll();
  }
}

export default IntegrationTestRunner;