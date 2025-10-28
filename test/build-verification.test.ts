/**
 * Build Verification Test
 * Verifies that the Firebase Functions build is successful
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Firebase Functions Build Verification', () => {
  const requiredFiles = [
    'lib/index.js',
    'lib/app.js',
    'lib/api/v1/index.js',
    'lib/api/v1/monitoring.js',
    'lib/api/v1/credits.js',
    'lib/api/v1/payments.js',
    'lib/api/v1/chat.js',
    'lib/api/v1/models.js',
    'lib/api/v1/images.js',
    'lib/api/v1/users.js',
    'lib/api/v1/auth.js',
    'lib/api/v1/admin.js',
    'lib/api/middleware/auth.js',
    'lib/api/middleware/error-handling.js',
    'lib/api/middleware/observability.js',
    'lib/api/middleware/security.js',
    'lib/api/middleware/rate-limiting.js',
    'lib/shared/observability/logger.js',
    'lib/shared/observability/metrics.js',
    'lib/shared/config/environment-loader.js',
    'lib/functions/user-lifecycle.js',
    'lib/functions/credit-events.js',
    'lib/functions/payment-events.js',
    'lib/functions/orchestration-events.js',
    'lib/functions/agent-execution.js',
    'lib/functions/image-generation.js'
  ];

  test('should have all required compiled files', () => {
    console.log('🔍 Verifying Firebase Functions build...\n');
    
    const missingFiles: string[] = [];
    
    console.log('📁 Checking compiled files:');
    requiredFiles.forEach(file => {
      const fullPath = path.join(__dirname, '..', file);
      if (fs.existsSync(fullPath)) {
        console.log(`✅ ${file}`);
      } else {
        console.log(`❌ ${file} - MISSING`);
        missingFiles.push(file);
      }
    });

    expect(missingFiles).toHaveLength(0);
    
    if (missingFiles.length === 0) {
      console.log('\n🎉 Firebase Infrastructure Setup Complete!');
      console.log('\n📦 Components Successfully Built:');
      console.log('  • Firebase Functions Gen 2 entry point');
      console.log('  • Express.js application with middleware stack');
      console.log('  • API v1 routes (8 route modules)');
      console.log('  • Authentication and security middleware');
      console.log('  • Structured logging and metrics');
      console.log('  • Environment configuration management');
      console.log('  • Event-driven function handlers (6 modules)');
    }
  });

  test('should have proper TypeScript compilation', () => {
    // Check that TypeScript declaration files exist
    const declarationFiles = [
      'lib/index.d.ts',
      'lib/app.d.ts',
      'lib/api/v1/index.d.ts'
    ];

    declarationFiles.forEach(file => {
      const fullPath = path.join(__dirname, '..', file);
      expect(fs.existsSync(fullPath)).toBe(true);
    });
  });

  test('should have proper project structure', () => {
    const projectFiles = [
      'package.json',
      'tsconfig.json',
      'tsconfig.test.json',
      'jest.config.js',
      '.env.example'
    ];

    projectFiles.forEach(file => {
      const fullPath = path.join(__dirname, '..', file);
      expect(fs.existsSync(fullPath)).toBe(true);
    });
  });
});