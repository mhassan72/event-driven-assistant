#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface CompilationResult {
  category: string;
  errorCount: number;
  errors: string[];
  timestamp: Date;
}

class IncrementalCompilationTester {
  private resultsDir = path.join(__dirname, '../test-results');
  private baselineFile = path.join(this.resultsDir, 'baseline-errors.json');
  
  constructor() {
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  async runCompilationTest(category: string): Promise<CompilationResult> {
    console.log(`\n🔍 Running compilation test for: ${category}`);
    
    try {
      // Run TypeScript compilation and capture output
      execSync('npm run build', { 
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      return {
        category,
        errorCount: 0,
        errors: [],
        timestamp: new Date()
      };
    } catch (error: any) {
      const errorOutput = error.stdout || error.stderr || error.message;
      const errors = this.parseCompilationErrors(errorOutput);
      
      return {
        category,
        errorCount: errors.length,
        errors,
        timestamp: new Date()
      };
    }
  }

  private parseCompilationErrors(output: string): string[] {
    const lines = output.split('\n');
    const errors: string[] = [];
    
    for (const line of lines) {
      if (line.includes(' - error TS')) {
        errors.push(line.trim());
      }
    }
    
    return errors;
  }

  async saveBaseline(): Promise<void> {
    const baseline = await this.runCompilationTest('baseline');
    fs.writeFileSync(this.baselineFile, JSON.stringify(baseline, null, 2));
    console.log(`📊 Baseline saved: ${baseline.errorCount} errors`);
  }

  async compareWithBaseline(category: string): Promise<void> {
    if (!fs.existsSync(this.baselineFile)) {
      console.log('⚠️  No baseline found, creating one...');
      await this.saveBaseline();
      return;
    }

    const baseline: CompilationResult = JSON.parse(fs.readFileSync(this.baselineFile, 'utf8'));
    const current = await this.runCompilationTest(category);
    
    const improvement = baseline.errorCount - current.errorCount;
    
    console.log(`\n📈 Compilation Progress Report:`);
    console.log(`   Baseline errors: ${baseline.errorCount}`);
    console.log(`   Current errors:  ${current.errorCount}`);
    console.log(`   Improvement:     ${improvement} errors fixed`);
    
    if (improvement > 0) {
      console.log(`✅ Progress made! ${improvement} errors resolved.`);
    } else if (improvement < 0) {
      console.log(`❌ Regression detected! ${Math.abs(improvement)} new errors introduced.`);
    } else {
      console.log(`➡️  No change in error count.`);
    }

    // Save current results
    const resultFile = path.join(this.resultsDir, `${category}-${Date.now()}.json`);
    fs.writeFileSync(resultFile, JSON.stringify(current, null, 2));
  }

  async testAllCategories(): Promise<void> {
    const categories = [
      'type-casting-fixes',
      'interface-updates', 
      'import-cleanup',
      'orchestration-fixes',
      'final-validation'
    ];

    for (const category of categories) {
      await this.compareWithBaseline(category);
      
      // Brief pause between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async generateReport(): Promise<void> {
    const files = fs.readdirSync(this.resultsDir)
      .filter(f => f.endsWith('.json') && f !== 'baseline-errors.json')
      .sort();

    if (files.length === 0) {
      console.log('No test results found.');
      return;
    }

    console.log('\n📋 Compilation Test Summary:');
    console.log('================================');

    for (const file of files) {
      const result: CompilationResult = JSON.parse(
        fs.readFileSync(path.join(this.resultsDir, file), 'utf8')
      );
      
      console.log(`${result.category}: ${result.errorCount} errors (${result.timestamp.toISOString()})`);
    }
  }
}

// CLI interface
async function main() {
  const tester = new IncrementalCompilationTester();
  const command = process.argv[2];

  switch (command) {
    case 'baseline':
      await tester.saveBaseline();
      break;
    case 'test':
      const category = process.argv[3] || 'current';
      await tester.compareWithBaseline(category);
      break;
    case 'all':
      await tester.testAllCategories();
      break;
    case 'report':
      await tester.generateReport();
      break;
    default:
      console.log('Usage: ts-node incremental-compilation-test.ts [baseline|test|all|report] [category]');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { IncrementalCompilationTester };