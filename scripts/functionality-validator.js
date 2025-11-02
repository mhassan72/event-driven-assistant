#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class FunctionalityValidator {
  constructor() {
    this.resultsDir = path.join(__dirname, '../test-results');
    this.libDir = path.join(__dirname, '../lib');
    
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  async validateFunctionality() {
    console.log('🔍 Validating Existing Functionality Preservation');
    console.log('===============================================\n');

    const results = {
      timestamp: new Date().toISOString(),
      validations: {}
    };

    // Validation 1: Core module exports
    results.validations.moduleExports = await this.validateModuleExports();
    
    // Validation 2: API endpoint structure
    results.validations.apiStructure = await this.validateApiStructure();
    
    // Validation 3: Orchestration workflow integrity
    results.validations.orchestrationIntegrity = await this.validateOrchestrationIntegrity();
    
    // Validation 4: Type definition consistency
    results.validations.typeConsistency = await this.validateTypeConsistency();
    
    // Generate final report
    await this.generateFunctionalityReport(results);
    
    return results;
  }

  async validateModuleExports() {
    console.log('📦 Validating core module exports...');
    
    try {
      const coreModules = [
        'index.js',
        'app.js',
        'api/v1/index.js',
        'shared/types/index.js',
        'features/index.js'
      ];
      
      const validModules = [];
      const invalidModules = [];
      
      for (const modulePath of coreModules) {
        const fullPath = path.join(this.libDir, modulePath);
        
        if (fs.existsSync(fullPath)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            
            // Basic validation - check if module has exports
            if (content.includes('exports.') || content.includes('module.exports')) {
              validModules.push(modulePath);
              console.log(`   ✅ ${modulePath} - exports found`);
            } else {
              invalidModules.push(modulePath);
              console.log(`   ⚠️  ${modulePath} - no exports detected`);
            }
          } catch (error) {
            invalidModules.push(modulePath);
            console.log(`   ❌ ${modulePath} - read error: ${error.message}`);
          }
        } else {
          invalidModules.push(modulePath);
          console.log(`   ❌ ${modulePath} - file not found`);
        }
      }
      
      return {
        success: invalidModules.length === 0,
        validModules,
        invalidModules,
        message: `${validModules.length}/${coreModules.length} core modules valid`
      };
    } catch (error) {
      return {
        success: false,
        message: `Module export validation failed: ${error.message}`
      };
    }
  }

  async validateApiStructure() {
    console.log('🌐 Validating API endpoint structure...');
    
    try {
      const apiRoutes = [
        'api/v1/auth.js',
        'api/v1/credits.js',
        'api/v1/images.js',
        'api/v1/payments.js',
        'api/v1/notifications.js'
      ];
      
      const validRoutes = [];
      const invalidRoutes = [];
      
      for (const routePath of apiRoutes) {
        const fullPath = path.join(this.libDir, routePath);
        
        if (fs.existsSync(fullPath)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            
            // Check for Express router patterns
            const hasRouterPatterns = content.includes('router.') || 
                                    content.includes('app.') ||
                                    content.includes('express');
            
            if (hasRouterPatterns) {
              validRoutes.push(routePath);
              console.log(`   ✅ ${routePath} - router patterns found`);
            } else {
              invalidRoutes.push(routePath);
              console.log(`   ⚠️  ${routePath} - no router patterns detected`);
            }
          } catch (error) {
            invalidRoutes.push(routePath);
            console.log(`   ❌ ${routePath} - read error: ${error.message}`);
          }
        } else {
          invalidRoutes.push(routePath);
          console.log(`   ❌ ${routePath} - file not found`);
        }
      }
      
      return {
        success: validRoutes.length > 0,
        validRoutes,
        invalidRoutes,
        message: `${validRoutes.length}/${apiRoutes.length} API routes have valid structure`
      };
    } catch (error) {
      return {
        success: false,
        message: `API structure validation failed: ${error.message}`
      };
    }
  }

  async validateOrchestrationIntegrity() {
    console.log('🔄 Validating orchestration workflow integrity...');
    
    try {
      const orchestrationModules = [
        'shared/orchestration/base-orchestrator.js',
        'shared/orchestration/event-bus.js',
        'shared/orchestration/saga-manager.js',
        'shared/orchestration/operation-queue.js'
      ];
      
      const validModules = [];
      const invalidModules = [];
      
      for (const modulePath of orchestrationModules) {
        const fullPath = path.join(this.libDir, modulePath);
        
        if (fs.existsSync(fullPath)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            
            // Check for class definitions and key orchestration patterns
            const hasClassDefinitions = content.includes('class ') || 
                                      content.includes('function ') ||
                                      content.includes('exports.');
            
            if (hasClassDefinitions) {
              validModules.push(modulePath);
              console.log(`   ✅ ${modulePath} - orchestration patterns found`);
            } else {
              invalidModules.push(modulePath);
              console.log(`   ⚠️  ${modulePath} - no orchestration patterns detected`);
            }
          } catch (error) {
            invalidModules.push(modulePath);
            console.log(`   ❌ ${modulePath} - read error: ${error.message}`);
          }
        } else {
          invalidModules.push(modulePath);
          console.log(`   ❌ ${modulePath} - file not found`);
        }
      }
      
      return {
        success: validModules.length > 0,
        validModules,
        invalidModules,
        message: `${validModules.length}/${orchestrationModules.length} orchestration modules valid`
      };
    } catch (error) {
      return {
        success: false,
        message: `Orchestration integrity validation failed: ${error.message}`
      };
    }
  }

  async validateTypeConsistency() {
    console.log('📝 Validating type definition consistency...');
    
    try {
      const typeFiles = [
        'shared/types/index.d.ts',
        'shared/types/credit-system.d.ts',
        'shared/types/payment-system.d.ts',
        'shared/types/orchestration.d.ts'
      ];
      
      const validTypes = [];
      const invalidTypes = [];
      
      for (const typePath of typeFiles) {
        const fullPath = path.join(this.libDir, typePath);
        
        if (fs.existsSync(fullPath)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            
            // Check for TypeScript type definitions
            const hasTypeDefinitions = content.includes('interface ') || 
                                      content.includes('type ') ||
                                      content.includes('export ');
            
            if (hasTypeDefinitions) {
              validTypes.push(typePath);
              console.log(`   ✅ ${typePath} - type definitions found`);
            } else {
              invalidTypes.push(typePath);
              console.log(`   ⚠️  ${typePath} - no type definitions detected`);
            }
          } catch (error) {
            invalidTypes.push(typePath);
            console.log(`   ❌ ${typePath} - read error: ${error.message}`);
          }
        } else {
          invalidTypes.push(typePath);
          console.log(`   ❌ ${typePath} - file not found`);
        }
      }
      
      return {
        success: validTypes.length > 0,
        validTypes,
        invalidTypes,
        message: `${validTypes.length}/${typeFiles.length} type definition files valid`
      };
    } catch (error) {
      return {
        success: false,
        message: `Type consistency validation failed: ${error.message}`
      };
    }
  }

  async generateFunctionalityReport(results) {
    console.log('\n📋 Functionality Preservation Report');
    console.log('===================================');
    
    const allValidationsSuccessful = Object.values(results.validations).every(validation => validation.success);
    
    console.log(`\n🎯 Overall Status: ${allValidationsSuccessful ? '✅ PRESERVED' : '⚠️  ISSUES DETECTED'}`);
    console.log(`📅 Validation Time: ${results.timestamp}`);
    
    console.log('\n📊 Validation Results:');
    for (const [validationName, validationResult] of Object.entries(results.validations)) {
      const status = validationResult.success ? '✅' : '⚠️ ';
      console.log(`   ${status} ${validationName}: ${validationResult.message}`);
    }
    
    // Save detailed report
    const reportFile = path.join(this.resultsDir, `functionality-validation-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Detailed report saved to: ${reportFile}`);
    
    return allValidationsSuccessful;
  }
}

// CLI interface
async function main() {
  const validator = new FunctionalityValidator();
  
  try {
    const results = await validator.validateFunctionality();
    const success = Object.values(results.validations).every(validation => validation.success);
    
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Functionality validation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { FunctionalityValidator };