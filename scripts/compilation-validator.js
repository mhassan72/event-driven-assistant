#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class CompilationValidator {
  constructor() {
    this.resultsDir = path.join(__dirname, '../test-results');
    this.baselineFile = path.join(this.resultsDir, 'baseline-errors.json');
    
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  runCompilationTest(category) {
    console.log(`\n🔍 Running compilation test for: ${category}`);
    
    try {
      const output = execSync('npm run build 2>&1', { 
        cwd: process.cwd(),
        encoding: 'utf8'
      });
      
      // Check if output contains errors even if command succeeded
      const errors = this.parseCompilationErrors(output);
      
      return {
        category,
        errorCount: errors.length,
        errors: errors.slice(0, 10), // Keep first 10 errors for brevity
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      const errorOutput = error.stdout || error.stderr || error.message;
      const errors = this.parseCompilationErrors(errorOutput);
      
      return {
        category,
        errorCount: errors.length,
        errors: errors.slice(0, 10), // Keep first 10 errors for brevity
        timestamp: new Date().toISOString()
      };
    }
  }

  parseCompilationErrors(output) {
    const lines = output.split('\n');
    const errors = [];
    
    for (const line of lines) {
      if (line.includes('error TS') || line.includes(': error TS')) {
        errors.push(line.trim());
      }
    }
    
    return errors;
  }

  saveBaseline() {
    const baseline = this.runCompilationTest('baseline');
    fs.writeFileSync(this.baselineFile, JSON.stringify(baseline, null, 2));
    console.log(`📊 Baseline saved: ${baseline.errorCount} errors`);
    return baseline;
  }

  compareWithBaseline(category) {
    let baseline;
    
    if (!fs.existsSync(this.baselineFile)) {
      console.log('⚠️  No baseline found, creating one...');
      baseline = this.saveBaseline();
    } else {
      baseline = JSON.parse(fs.readFileSync(this.baselineFile, 'utf8'));
    }

    const current = this.runCompilationTest(category);
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
    
    return current;
  }

  generateReport() {
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
      const result = JSON.parse(
        fs.readFileSync(path.join(this.resultsDir, file), 'utf8')
      );
      
      console.log(`${result.category}: ${result.errorCount} errors (${result.timestamp})`);
    }
  }
}

// CLI interface
function main() {
  const validator = new CompilationValidator();
  const command = process.argv[2];

  switch (command) {
    case 'baseline':
      validator.saveBaseline();
      break;
    case 'test':
      const category = process.argv[3] || 'current';
      validator.compareWithBaseline(category);
      break;
    case 'report':
      validator.generateReport();
      break;
    default:
      console.log('Usage: node compilation-validator.js [baseline|test|report] [category]');
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { CompilationValidator };