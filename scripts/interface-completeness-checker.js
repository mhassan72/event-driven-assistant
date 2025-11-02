#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class InterfaceCompletenessChecker {
  constructor() {
    this.srcDir = path.join(__dirname, '../src');
    this.resultsDir = path.join(__dirname, '../test-results');
    
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  async checkInterfaceCompleteness() {
    console.log('🔍 Checking Interface Completeness');
    console.log('=================================\n');

    const results = {
      timestamp: new Date().toISOString(),
      checks: {}
    };

    // Check 1: Missing property errors
    results.checks.missingProperties = await this.checkMissingProperties();
    
    // Check 2: Interface definition coverage
    results.checks.interfaceCoverage = await this.checkInterfaceCoverage();
    
    // Check 3: Type assertion issues
    results.checks.typeAssertions = await this.checkTypeAssertions();
    
    // Generate report
    await this.generateCompletenessReport(results);
    
    return results;
  }

  async checkMissingProperties() {
    console.log('🔍 Checking for missing property errors...');
    
    try {
      let output = '';
      try {
        execSync('npm run build 2>&1', { 
          cwd: path.join(__dirname, '..'),
          encoding: 'utf8'
        });
      } catch (error) {
        output = error.stdout || error.stderr || error.message;
      }
      
      const missingPropertyErrors = [];
      const lines = output.split('\n');
      
      for (const line of lines) {
        if (line.includes('Property') && 
            (line.includes('does not exist on type') || 
             line.includes('is missing in type'))) {
          missingPropertyErrors.push(line.trim());
        }
      }
      
      console.log(`   Found ${missingPropertyErrors.length} missing property errors`);
      
      return {
        success: missingPropertyErrors.length === 0,
        errorCount: missingPropertyErrors.length,
        errors: missingPropertyErrors.slice(0, 10), // First 10 for brevity
        message: `${missingPropertyErrors.length} missing property errors found`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to check missing properties: ${error.message}`
      };
    }
  }

  async checkInterfaceCoverage() {
    console.log('📋 Checking interface definition coverage...');
    
    try {
      const typeFiles = this.findTypeFiles(this.srcDir);
      const interfaceStats = {
        totalFiles: typeFiles.length,
        filesWithInterfaces: 0,
        totalInterfaces: 0,
        incompleteInterfaces: []
      };
      
      for (const typeFile of typeFiles) {
        const content = fs.readFileSync(typeFile, 'utf8');
        const interfaces = this.extractInterfaces(content);
        
        if (interfaces.length > 0) {
          interfaceStats.filesWithInterfaces++;
          interfaceStats.totalInterfaces += interfaces.length;
          
          // Check for potentially incomplete interfaces
          for (const interfaceDef of interfaces) {
            if (this.isInterfaceIncomplete(interfaceDef)) {
              interfaceStats.incompleteInterfaces.push({
                file: path.relative(this.srcDir, typeFile),
                interface: interfaceDef.name
              });
            }
          }
        }
      }
      
      console.log(`   Found ${interfaceStats.totalInterfaces} interfaces in ${interfaceStats.filesWithInterfaces} files`);
      console.log(`   ${interfaceStats.incompleteInterfaces.length} potentially incomplete interfaces`);
      
      return {
        success: interfaceStats.incompleteInterfaces.length === 0,
        stats: interfaceStats,
        message: `${interfaceStats.totalInterfaces} interfaces found, ${interfaceStats.incompleteInterfaces.length} potentially incomplete`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to check interface coverage: ${error.message}`
      };
    }
  }

  async checkTypeAssertions() {
    console.log('🎯 Checking type assertion issues...');
    
    try {
      let output = '';
      try {
        execSync('npm run build 2>&1', { 
          cwd: path.join(__dirname, '..'),
          encoding: 'utf8'
        });
      } catch (error) {
        output = error.stdout || error.stderr || error.message;
      }
      
      const typeAssertionErrors = [];
      const lines = output.split('\n');
      
      for (const line of lines) {
        if (line.includes('Type assertion') || 
            line.includes('Type \'') && line.includes('\' is not assignable to type') ||
            line.includes('Argument of type') && line.includes('is not assignable')) {
          typeAssertionErrors.push(line.trim());
        }
      }
      
      console.log(`   Found ${typeAssertionErrors.length} type assertion errors`);
      
      return {
        success: typeAssertionErrors.length === 0,
        errorCount: typeAssertionErrors.length,
        errors: typeAssertionErrors.slice(0, 10), // First 10 for brevity
        message: `${typeAssertionErrors.length} type assertion errors found`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to check type assertions: ${error.message}`
      };
    }
  }

  findTypeFiles(dir) {
    const typeFiles = [];
    
    const scanDirectory = (currentDir) => {
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && item !== 'node_modules' && item !== 'lib') {
          scanDirectory(fullPath);
        } else if (item.endsWith('.ts') && !item.endsWith('.test.ts')) {
          typeFiles.push(fullPath);
        }
      }
    };
    
    scanDirectory(dir);
    return typeFiles;
  }

  extractInterfaces(content) {
    const interfaces = [];
    const interfaceRegex = /interface\s+(\w+)\s*{([^}]*)}/g;
    let match;
    
    while ((match = interfaceRegex.exec(content)) !== null) {
      interfaces.push({
        name: match[1],
        body: match[2].trim()
      });
    }
    
    return interfaces;
  }

  isInterfaceIncomplete(interfaceDef) {
    // Simple heuristics to detect potentially incomplete interfaces
    const body = interfaceDef.body;
    
    // Very short interfaces might be incomplete
    if (body.length < 20) {
      return true;
    }
    
    // Interfaces with only optional properties might be incomplete
    const lines = body.split('\n').filter(line => line.trim());
    const optionalLines = lines.filter(line => line.includes('?:'));
    
    if (lines.length > 0 && optionalLines.length === lines.length) {
      return true;
    }
    
    return false;
  }

  async generateCompletenessReport(results) {
    console.log('\n📋 Interface Completeness Report');
    console.log('===============================');
    
    const allChecksSuccessful = Object.values(results.checks).every(check => check.success);
    
    console.log(`\n🎯 Overall Status: ${allChecksSuccessful ? '✅ COMPLETE' : '⚠️  ISSUES FOUND'}`);
    console.log(`📅 Check Time: ${results.timestamp}`);
    
    console.log('\n📊 Check Results:');
    for (const [checkName, checkResult] of Object.entries(results.checks)) {
      const status = checkResult.success ? '✅' : '⚠️ ';
      console.log(`   ${status} ${checkName}: ${checkResult.message}`);
    }
    
    // Save detailed report
    const reportFile = path.join(this.resultsDir, `interface-completeness-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Detailed report saved to: ${reportFile}`);
    
    return allChecksSuccessful;
  }
}

// CLI interface
async function main() {
  const checker = new InterfaceCompletenessChecker();
  
  try {
    const results = await checker.checkInterfaceCompleteness();
    const success = Object.values(results.checks).every(check => check.success);
    
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Interface completeness check failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { InterfaceCompletenessChecker };