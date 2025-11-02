#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ImportUsageValidator {
  constructor() {
    this.srcDir = path.join(__dirname, '../src');
    this.resultsDir = path.join(__dirname, '../test-results');
    
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  async validateImportUsage() {
    console.log('📦 Validating Import Usage');
    console.log('=========================\n');

    const results = {
      timestamp: new Date().toISOString(),
      validations: {}
    };

    // Validation 1: Unused imports
    results.validations.unusedImports = await this.checkUnusedImports();
    
    // Validation 2: Missing imports
    results.validations.missingImports = await this.checkMissingImports();
    
    // Validation 3: Import organization
    results.validations.importOrganization = await this.checkImportOrganization();
    
    // Generate report
    await this.generateImportReport(results);
    
    return results;
  }

  async checkUnusedImports() {
    console.log('🔍 Checking for unused imports...');
    
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
      
      const unusedImports = [];
      const lines = output.split('\n');
      
      for (const line of lines) {
        if (line.includes('is declared but its value is never read')) {
          const match = line.match(/src\/(.+\.ts)\(\d+,\d+\): error TS6133: '(.+)' is declared but its value is never read/);
          if (match) {
            unusedImports.push({
              file: match[1],
              import: match[2],
              line: line.trim()
            });
          }
        }
      }
      
      // Group by file for better reporting
      const fileGroups = {};
      for (const unused of unusedImports) {
        if (!fileGroups[unused.file]) {
          fileGroups[unused.file] = [];
        }
        fileGroups[unused.file].push(unused.import);
      }
      
      console.log(`   Found ${unusedImports.length} unused imports in ${Object.keys(fileGroups).length} files`);
      
      return {
        success: unusedImports.length === 0,
        totalCount: unusedImports.length,
        fileCount: Object.keys(fileGroups).length,
        fileGroups,
        details: unusedImports.slice(0, 20), // First 20 for brevity
        message: `${unusedImports.length} unused imports found in ${Object.keys(fileGroups).length} files`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to check unused imports: ${error.message}`
      };
    }
  }

  async checkMissingImports() {
    console.log('🔍 Checking for missing imports...');
    
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
      
      const missingImports = [];
      const lines = output.split('\n');
      
      for (const line of lines) {
        if (line.includes('Cannot find module') || 
            line.includes('Module not found') ||
            line.includes('has no exported member') ||
            line.includes('is not a module')) {
          missingImports.push(line.trim());
        }
      }
      
      console.log(`   Found ${missingImports.length} missing import errors`);
      
      return {
        success: missingImports.length === 0,
        errorCount: missingImports.length,
        errors: missingImports.slice(0, 15), // First 15 for brevity
        message: `${missingImports.length} missing import errors found`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to check missing imports: ${error.message}`
      };
    }
  }

  async checkImportOrganization() {
    console.log('📋 Checking import organization...');
    
    try {
      const sourceFiles = this.findSourceFiles(this.srcDir);
      const organizationIssues = [];
      
      for (const sourceFile of sourceFiles) {
        const content = fs.readFileSync(sourceFile, 'utf8');
        const issues = this.analyzeImportOrganization(content, sourceFile);
        organizationIssues.push(...issues);
      }
      
      console.log(`   Found ${organizationIssues.length} import organization issues`);
      
      return {
        success: organizationIssues.length === 0,
        issueCount: organizationIssues.length,
        issues: organizationIssues.slice(0, 10), // First 10 for brevity
        message: `${organizationIssues.length} import organization issues found`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to check import organization: ${error.message}`
      };
    }
  }

  findSourceFiles(dir) {
    const sourceFiles = [];
    
    const scanDirectory = (currentDir) => {
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && item !== 'node_modules' && item !== 'lib') {
          scanDirectory(fullPath);
        } else if (item.endsWith('.ts') && !item.endsWith('.test.ts') && !item.endsWith('.d.ts')) {
          sourceFiles.push(fullPath);
        }
      }
    };
    
    scanDirectory(dir);
    return sourceFiles;
  }

  analyzeImportOrganization(content, filePath) {
    const issues = [];
    const lines = content.split('\n');
    const imports = [];
    
    // Extract import statements
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('import ') && !line.startsWith('import type')) {
        imports.push({
          line: i + 1,
          content: line,
          isExternal: this.isExternalImport(line),
          isRelative: line.includes('./') || line.includes('../')
        });
      }
    }
    
    if (imports.length === 0) {
      return issues;
    }
    
    // Check for mixed import types (external vs internal)
    const externalImports = imports.filter(imp => imp.isExternal);
    const internalImports = imports.filter(imp => !imp.isExternal);
    
    if (externalImports.length > 0 && internalImports.length > 0) {
      // Check if they're properly separated
      const lastExternalLine = Math.max(...externalImports.map(imp => imp.line));
      const firstInternalLine = Math.min(...internalImports.map(imp => imp.line));
      
      if (lastExternalLine > firstInternalLine) {
        issues.push({
          file: path.relative(this.srcDir, filePath),
          type: 'mixed_import_order',
          message: 'External and internal imports are mixed'
        });
      }
    }
    
    // Check for duplicate imports
    const importSources = imports.map(imp => {
      const match = imp.content.match(/from ['"]([^'"]+)['"]/);
      return match ? match[1] : null;
    }).filter(Boolean);
    
    const duplicates = importSources.filter((source, index) => 
      importSources.indexOf(source) !== index
    );
    
    if (duplicates.length > 0) {
      issues.push({
        file: path.relative(this.srcDir, filePath),
        type: 'duplicate_imports',
        message: `Duplicate imports found: ${[...new Set(duplicates)].join(', ')}`
      });
    }
    
    return issues;
  }

  isExternalImport(importLine) {
    // Check if import is from node_modules (external package)
    const match = importLine.match(/from ['"]([^'"]+)['"]/);
    if (!match) return false;
    
    const source = match[1];
    return !source.startsWith('./') && !source.startsWith('../') && !source.startsWith('/');
  }

  async generateImportReport(results) {
    console.log('\n📋 Import Usage Validation Report');
    console.log('================================');
    
    const allValidationsSuccessful = Object.values(results.validations).every(validation => validation.success);
    
    console.log(`\n🎯 Overall Status: ${allValidationsSuccessful ? '✅ CLEAN' : '⚠️  ISSUES FOUND'}`);
    console.log(`📅 Validation Time: ${results.timestamp}`);
    
    console.log('\n📊 Validation Results:');
    for (const [validationName, validationResult] of Object.entries(results.validations)) {
      const status = validationResult.success ? '✅' : '⚠️ ';
      console.log(`   ${status} ${validationName}: ${validationResult.message}`);
    }
    
    // Show top files with unused imports
    if (results.validations.unusedImports && results.validations.unusedImports.fileGroups) {
      const topFiles = Object.entries(results.validations.unusedImports.fileGroups)
        .sort(([,a], [,b]) => b.length - a.length)
        .slice(0, 5);
      
      if (topFiles.length > 0) {
        console.log('\n🔝 Top files with unused imports:');
        for (const [file, imports] of topFiles) {
          console.log(`   📄 ${file}: ${imports.length} unused imports`);
        }
      }
    }
    
    // Save detailed report
    const reportFile = path.join(this.resultsDir, `import-usage-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Detailed report saved to: ${reportFile}`);
    
    return allValidationsSuccessful;
  }
}

// CLI interface
async function main() {
  const validator = new ImportUsageValidator();
  
  try {
    const results = await validator.validateImportUsage();
    const success = Object.values(results.validations).every(validation => validation.success);
    
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Import usage validation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { ImportUsageValidator };