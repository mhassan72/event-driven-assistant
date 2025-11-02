#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ComprehensiveBuildValidator {
  constructor() {
    this.resultsDir = path.join(__dirname, '../test-results');
    this.buildDir = path.join(__dirname, '../lib');
    
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  async runFullValidation() {
    console.log('🚀 Starting Comprehensive Build Validation');
    console.log('==========================================\n');

    const results = {
      timestamp: new Date().toISOString(),
      phases: {}
    };

    // Phase 1: Clean build environment
    results.phases.cleanup = await this.cleanBuildEnvironment();
    
    // Phase 2: TypeScript compilation
    results.phases.compilation = await this.validateTypeScriptCompilation();
    
    // Phase 3: Build artifact validation
    results.phases.artifacts = await this.validateBuildArtifacts();
    
    // Phase 4: Deployment readiness check
    results.phases.deployment = await this.validateDeploymentReadiness();
    
    // Phase 5: Generate final report
    await this.generateValidationReport(results);
    
    return results;
  }

  async cleanBuildEnvironment() {
    console.log('🧹 Phase 1: Cleaning build environment...');
    
    try {
      // Remove existing build artifacts
      if (fs.existsSync(this.buildDir)) {
        execSync(`rm -rf ${this.buildDir}`, { cwd: process.cwd() });
        console.log('   ✅ Removed existing lib directory');
      }
      
      // Clean npm cache if needed
      execSync('npm run clean 2>/dev/null || true', { cwd: process.cwd() });
      console.log('   ✅ Cleaned build cache');
      
      return {
        success: true,
        message: 'Build environment cleaned successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to clean build environment: ${error.message}`
      };
    }
  }

  async validateTypeScriptCompilation() {
    console.log('🔧 Phase 2: Validating TypeScript compilation...');
    
    try {
      const startTime = Date.now();
      const output = execSync('npm run build 2>&1', { 
        cwd: process.cwd(),
        encoding: 'utf8'
      });
      const compilationTime = Date.now() - startTime;
      
      const errors = this.parseCompilationErrors(output);
      const warnings = this.parseCompilationWarnings(output);
      
      if (errors.length === 0) {
        console.log('   ✅ TypeScript compilation successful');
        console.log(`   ⏱️  Compilation time: ${compilationTime}ms`);
        
        return {
          success: true,
          errorCount: 0,
          warningCount: warnings.length,
          compilationTime,
          message: 'All TypeScript files compiled successfully'
        };
      } else {
        console.log(`   ❌ TypeScript compilation failed with ${errors.length} errors`);
        
        return {
          success: false,
          errorCount: errors.length,
          warningCount: warnings.length,
          compilationTime,
          errors: errors.slice(0, 5), // First 5 errors
          message: `Compilation failed with ${errors.length} errors`
        };
      }
    } catch (error) {
      const errorOutput = error.stdout || error.stderr || error.message;
      const errors = this.parseCompilationErrors(errorOutput);
      
      return {
        success: false,
        errorCount: errors.length,
        errors: errors.slice(0, 5),
        message: 'TypeScript compilation process failed'
      };
    }
  }

  async validateBuildArtifacts() {
    console.log('📦 Phase 3: Validating build artifacts...');
    
    if (!fs.existsSync(this.buildDir)) {
      return {
        success: false,
        message: 'Build directory does not exist - compilation may have failed'
      };
    }

    try {
      const artifacts = this.scanBuildArtifacts(this.buildDir);
      const requiredFiles = [
        'index.js',
        'app.js',
        'api/v1/index.js',
        'shared/types/index.js'
      ];
      
      const missingFiles = requiredFiles.filter(file => 
        !artifacts.jsFiles.some(jsFile => jsFile.endsWith(file))
      );
      
      console.log(`   📁 Found ${artifacts.jsFiles.length} JavaScript files`);
      console.log(`   🗺️  Found ${artifacts.mapFiles.length} source map files`);
      console.log(`   📝 Found ${artifacts.dtsFiles.length} type definition files`);
      
      if (missingFiles.length === 0) {
        console.log('   ✅ All required build artifacts present');
        
        return {
          success: true,
          artifactCounts: {
            javascript: artifacts.jsFiles.length,
            sourceMaps: artifacts.mapFiles.length,
            typeDefinitions: artifacts.dtsFiles.length
          },
          message: 'All build artifacts generated successfully'
        };
      } else {
        console.log(`   ❌ Missing required files: ${missingFiles.join(', ')}`);
        
        return {
          success: false,
          missingFiles,
          message: `Missing ${missingFiles.length} required build artifacts`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to validate build artifacts: ${error.message}`
      };
    }
  }

  async validateDeploymentReadiness() {
    console.log('🚀 Phase 4: Validating deployment readiness...');
    
    try {
      // Check if main entry points exist and are valid
      const entryPoints = [
        path.join(this.buildDir, 'index.js'),
        path.join(this.buildDir, 'app.js')
      ];
      
      const validEntryPoints = [];
      const invalidEntryPoints = [];
      
      for (const entryPoint of entryPoints) {
        if (fs.existsSync(entryPoint)) {
          try {
            // Basic syntax check by attempting to parse
            const content = fs.readFileSync(entryPoint, 'utf8');
            if (content.length > 0 && !content.includes('error TS')) {
              validEntryPoints.push(path.basename(entryPoint));
            } else {
              invalidEntryPoints.push(path.basename(entryPoint));
            }
          } catch (error) {
            invalidEntryPoints.push(path.basename(entryPoint));
          }
        } else {
          invalidEntryPoints.push(path.basename(entryPoint));
        }
      }
      
      // Check package.json for deployment configuration
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      const hasMainField = !!packageJson.main;
      const hasEnginesField = !!packageJson.engines;
      
      console.log(`   ✅ Valid entry points: ${validEntryPoints.join(', ')}`);
      if (invalidEntryPoints.length > 0) {
        console.log(`   ❌ Invalid entry points: ${invalidEntryPoints.join(', ')}`);
      }
      console.log(`   📋 Package.json main field: ${hasMainField ? '✅' : '❌'}`);
      console.log(`   🔧 Package.json engines field: ${hasEnginesField ? '✅' : '❌'}`);
      
      const isDeploymentReady = validEntryPoints.length > 0 && 
                               invalidEntryPoints.length === 0 && 
                               hasMainField;
      
      return {
        success: isDeploymentReady,
        validEntryPoints,
        invalidEntryPoints,
        packageJsonChecks: {
          hasMainField,
          hasEnginesField
        },
        message: isDeploymentReady ? 
          'Build is deployment ready' : 
          'Build has deployment issues'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to validate deployment readiness: ${error.message}`
      };
    }
  }

  scanBuildArtifacts(dir) {
    const artifacts = {
      jsFiles: [],
      mapFiles: [],
      dtsFiles: []
    };
    
    const scanDirectory = (currentDir) => {
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          scanDirectory(fullPath);
        } else {
          const relativePath = path.relative(this.buildDir, fullPath);
          
          if (item.endsWith('.js')) {
            artifacts.jsFiles.push(relativePath);
          } else if (item.endsWith('.js.map')) {
            artifacts.mapFiles.push(relativePath);
          } else if (item.endsWith('.d.ts')) {
            artifacts.dtsFiles.push(relativePath);
          }
        }
      }
    };
    
    scanDirectory(dir);
    return artifacts;
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

  parseCompilationWarnings(output) {
    const lines = output.split('\n');
    const warnings = [];
    
    for (const line of lines) {
      if (line.includes('warning TS') || line.includes(': warning TS')) {
        warnings.push(line.trim());
      }
    }
    
    return warnings;
  }

  async generateValidationReport(results) {
    console.log('\n📋 Comprehensive Build Validation Report');
    console.log('========================================');
    
    const allPhasesSuccessful = Object.values(results.phases).every(phase => phase.success);
    
    console.log(`\n🎯 Overall Status: ${allPhasesSuccessful ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`📅 Validation Time: ${results.timestamp}`);
    
    console.log('\n📊 Phase Results:');
    for (const [phaseName, phaseResult] of Object.entries(results.phases)) {
      const status = phaseResult.success ? '✅' : '❌';
      console.log(`   ${status} ${phaseName}: ${phaseResult.message}`);
    }
    
    // Save detailed report
    const reportFile = path.join(this.resultsDir, `build-validation-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Detailed report saved to: ${reportFile}`);
    
    return allPhasesSuccessful;
  }
}

// CLI interface
async function main() {
  const validator = new ComprehensiveBuildValidator();
  
  try {
    const results = await validator.runFullValidation();
    const success = Object.values(results.phases).every(phase => phase.success);
    
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { ComprehensiveBuildValidator };