#!/usr/bin/env node

const { CompilationValidator } = require('./compilation-validator');
const { ComprehensiveBuildValidator } = require('./comprehensive-build-validator');
const { FunctionalityValidator } = require('./functionality-validator');
const { InterfaceCompletenessChecker } = require('./interface-completeness-checker');
const { ImportUsageValidator } = require('./import-usage-validator');
const fs = require('fs');
const path = require('path');

class BuildStabilitySuite {
  constructor() {
    this.resultsDir = path.join(__dirname, '../test-results');
    
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  async runFullSuite() {
    console.log('🚀 Build Stability Regression Test Suite');
    console.log('========================================\n');

    const suiteResults = {
      timestamp: new Date().toISOString(),
      suite: 'build-stability-regression',
      version: '1.0.0',
      results: {}
    };

    console.log('📊 Running comprehensive build stability validation...\n');

    // Test 1: Compilation Validation
    console.log('1️⃣  Running compilation validation...');
    try {
      const compilationValidator = new CompilationValidator();
      const compilationResult = compilationValidator.compareWithBaseline('regression-test');
      suiteResults.results.compilation = {
        success: true,
        message: 'Compilation validation completed'
      };
    } catch (error) {
      suiteResults.results.compilation = {
        success: false,
        message: `Compilation validation failed: ${error.message}`
      };
    }

    // Test 2: Comprehensive Build Validation
    console.log('\n2️⃣  Running comprehensive build validation...');
    try {
      const buildValidator = new ComprehensiveBuildValidator();
      const buildResult = await buildValidator.runFullValidation();
      const buildSuccess = Object.values(buildResult.phases).every(phase => phase.success);
      
      suiteResults.results.comprehensiveBuild = {
        success: buildSuccess,
        phases: Object.keys(buildResult.phases).length,
        message: buildSuccess ? 'All build phases passed' : 'Some build phases failed'
      };
    } catch (error) {
      suiteResults.results.comprehensiveBuild = {
        success: false,
        message: `Comprehensive build validation failed: ${error.message}`
      };
    }

    // Test 3: Functionality Preservation
    console.log('\n3️⃣  Running functionality preservation validation...');
    try {
      const functionalityValidator = new FunctionalityValidator();
      const functionalityResult = await functionalityValidator.validateFunctionality();
      const functionalitySuccess = Object.values(functionalityResult.validations).every(validation => validation.success);
      
      suiteResults.results.functionalityPreservation = {
        success: functionalitySuccess,
        validations: Object.keys(functionalityResult.validations).length,
        message: functionalitySuccess ? 'All functionality preserved' : 'Some functionality issues detected'
      };
    } catch (error) {
      suiteResults.results.functionalityPreservation = {
        success: false,
        message: `Functionality preservation validation failed: ${error.message}`
      };
    }

    // Test 4: Interface Completeness
    console.log('\n4️⃣  Running interface completeness validation...');
    try {
      const interfaceChecker = new InterfaceCompletenessChecker();
      const interfaceResult = await interfaceChecker.checkInterfaceCompleteness();
      const interfaceSuccess = Object.values(interfaceResult.checks).every(check => check.success);
      
      suiteResults.results.interfaceCompleteness = {
        success: interfaceSuccess,
        checks: Object.keys(interfaceResult.checks).length,
        message: interfaceSuccess ? 'All interfaces complete' : 'Interface completeness issues found'
      };
    } catch (error) {
      suiteResults.results.interfaceCompleteness = {
        success: false,
        message: `Interface completeness validation failed: ${error.message}`
      };
    }

    // Test 5: Import Usage Validation
    console.log('\n5️⃣  Running import usage validation...');
    try {
      const importValidator = new ImportUsageValidator();
      const importResult = await importValidator.validateImportUsage();
      const importSuccess = Object.values(importResult.validations).every(validation => validation.success);
      
      suiteResults.results.importUsage = {
        success: importSuccess,
        validations: Object.keys(importResult.validations).length,
        message: importSuccess ? 'All imports clean' : 'Import usage issues found'
      };
    } catch (error) {
      suiteResults.results.importUsage = {
        success: false,
        message: `Import usage validation failed: ${error.message}`
      };
    }

    // Generate final suite report
    await this.generateSuiteReport(suiteResults);

    return suiteResults;
  }

  async generateSuiteReport(suiteResults) {
    console.log('\n📋 Build Stability Suite Report');
    console.log('===============================');

    const allTestsSuccessful = Object.values(suiteResults.results).every(result => result.success);
    const totalTests = Object.keys(suiteResults.results).length;
    const passedTests = Object.values(suiteResults.results).filter(result => result.success).length;

    console.log(`\n🎯 Overall Suite Status: ${allTestsSuccessful ? '✅ PASSED' : '⚠️  ISSUES DETECTED'}`);
    console.log(`📊 Test Results: ${passedTests}/${totalTests} tests passed`);
    console.log(`📅 Suite Execution Time: ${suiteResults.timestamp}`);

    console.log('\n📊 Individual Test Results:');
    for (const [testName, testResult] of Object.entries(suiteResults.results)) {
      const status = testResult.success ? '✅' : '⚠️ ';
      console.log(`   ${status} ${testName}: ${testResult.message}`);
    }

    // Provide recommendations based on results
    console.log('\n💡 Recommendations:');
    
    if (!suiteResults.results.compilation?.success) {
      console.log('   🔧 Address TypeScript compilation errors to improve build stability');
    }
    
    if (!suiteResults.results.interfaceCompleteness?.success) {
      console.log('   📝 Complete missing interface properties to prevent runtime errors');
    }
    
    if (!suiteResults.results.importUsage?.success) {
      console.log('   📦 Clean up unused imports to improve build performance');
    }
    
    if (!suiteResults.results.functionalityPreservation?.success) {
      console.log('   ⚠️  Review functionality preservation issues to prevent regressions');
    }

    // Save comprehensive suite report
    const reportFile = path.join(this.resultsDir, `build-stability-suite-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(suiteResults, null, 2));
    console.log(`\n💾 Comprehensive suite report saved to: ${reportFile}`);

    // Create summary for CI/CD integration
    const summaryFile = path.join(this.resultsDir, 'latest-suite-summary.json');
    const summary = {
      timestamp: suiteResults.timestamp,
      overallSuccess: allTestsSuccessful,
      passedTests,
      totalTests,
      criticalIssues: Object.entries(suiteResults.results)
        .filter(([, result]) => !result.success)
        .map(([testName]) => testName)
    };
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

    return allTestsSuccessful;
  }
}

// CLI interface
async function main() {
  const suite = new BuildStabilitySuite();
  
  try {
    const results = await suite.runFullSuite();
    const success = Object.values(results.results).every(result => result.success);
    
    console.log(`\n🏁 Suite completed with ${success ? 'SUCCESS' : 'ISSUES'}`);
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Build stability suite failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { BuildStabilitySuite };