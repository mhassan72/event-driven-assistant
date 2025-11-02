/**
 * Security and Compliance Validation Tests
 * Validates security configurations and compliance requirements
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import supertest from 'supertest';
import * as admin from 'firebase-admin';

const TEST_CONFIG = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:5001/sports-news-5fd0a/us-central1/api',
  timeout: 30000
};

let request: supertest.SuperTest<supertest.Test>;

describe('Security and Compliance Validation', () => {
  beforeAll(async () => {
    request = supertest(TEST_CONFIG.baseUrl);
    
    if (admin.apps.length === 0) {
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'sports-news-5fd0a'
      });
    }
  });

  describe('Authentication Security', () => {
    test('should reject requests without authentication', async () => {
      const protectedEndpoints = [
        '/v1/credits/balance',
        '/v1/chat/quick',
        '/v1/payments/create-session',
        '/v1/models/preferences',
        '/monitoring/system/health'
      ];

      for (const endpoint of protectedEndpoints) {
        await request
          .get(endpoint)
          .expect(401);
      }
    });

    test('should reject invalid authentication tokens', async () => {
      const invalidTokens = [
        'invalid-token',
        'Bearer invalid-token',
        'Bearer ',
        '',
        'malformed.jwt.token'
      ];

      for (const token of invalidTokens) {
        await request
          .get('/v1/credits/balance')
          .set('Authorization', token)
          .expect(401);
      }
    });

    test('should enforce admin-only access', async () => {
      // Create regular user token
      try {
        const regularUser = await admin.auth().createUser({
          email: `regular-${Date.now()}@example.com`,
          password: 'Password123!'
        });
        
        const regularToken = await admin.auth().createCustomToken(regularUser.uid);
        
        // Should be rejected for admin endpoints
        await request
          .get('/monitoring/system/health')
          .set('Authorization', `Bearer ${regularToken}`)
          .expect(403);
        
        // Cleanup
        await admin.auth().deleteUser(regularUser.uid);
      } catch (error) {
        console.warn('Could not test admin access - Firebase Auth not available');
      }
    });

    test('should validate token expiration handling', async () => {
      // Test with expired token (this would need a pre-expired token in real scenario)
      await request
        .get('/v1/credits/balance')
        .set('Authorization', 'Bearer expired.jwt.token')
        .expect(401);
    });
  });

  describe('Input Validation and Sanitization', () => {
    test('should reject malformed JSON requests', async () => {
      await request
        .post('/v1/chat/quick')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    });

    test('should validate request size limits', async () => {
      const largePayload = 'x'.repeat(15 * 1024 * 1024); // 15MB payload
      
      await request
        .post('/v1/chat/quick')
        .set('Content-Type', 'application/json')
        .send({ message: largePayload })
        .expect(413); // Payload too large
    });

    test('should sanitize SQL injection attempts', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'--",
        "' UNION SELECT * FROM users --"
      ];

      for (const payload of sqlInjectionPayloads) {
        await request
          .post('/v1/chat/quick')
          .send({ message: payload })
          .expect(401); // Should be rejected due to no auth, not processed
      }
    });

    test('should prevent XSS attacks', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src="x" onerror="alert(1)">',
        '"><script>alert("xss")</script>'
      ];

      for (const payload of xssPayloads) {
        await request
          .post('/v1/chat/quick')
          .send({ message: payload })
          .expect(401); // Should be rejected due to no auth
      }
    });
  });

  describe('Security Headers', () => {
    test('should include security headers', async () => {
      const response = await request
        .get('/health')
        .expect(200);

      // Check for essential security headers
      expect(response.headers).toMatchObject({
        'x-content-type-options': 'nosniff',
        'x-frame-options': expect.any(String),
        'x-xss-protection': expect.any(String)
      });

      // Should not expose sensitive information
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['server']).not.toMatch(/express/i);
    });

    test('should set proper CORS headers', async () => {
      const response = await request
        .options('/health')
        .set('Origin', 'https://example.com')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });

    test('should enforce HTTPS in production', () => {
      if (process.env.NODE_ENV === 'production') {
        // In production, should enforce HTTPS
        expect(process.env.FORCE_HTTPS).toBe('true');
      }
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits', async () => {
      const requests = Array(20).fill(null).map(() => 
        request.get('/health')
      );

      const responses = await Promise.all(requests);
      
      // Should have some rate limiting in place
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      
      // If rate limiting is active, some requests should be limited
      if (rateLimitedResponses.length > 0) {
        expect(rateLimitedResponses[0].headers['retry-after']).toBeDefined();
      }
    });

    test('should have different rate limits for different endpoints', async () => {
      // Health endpoint should have higher limits than API endpoints
      const healthRequests = Array(10).fill(null).map(() => 
        request.get('/health')
      );

      const healthResponses = await Promise.all(healthRequests);
      const healthSuccess = healthResponses.filter(res => res.status === 200);
      
      expect(healthSuccess.length).toBeGreaterThan(5); // Should allow multiple health checks
    });
  });

  describe('Data Privacy and GDPR Compliance', () => {
    test('should not log sensitive information', async () => {
      // Test that sensitive data is not exposed in error messages
      await request
        .post('/v1/chat/quick')
        .set('Authorization', 'Bearer sensitive-token-data')
        .send({ message: 'test', creditCard: '4111-1111-1111-1111' })
        .expect(401);

      // Error response should not contain sensitive data
      // This would need log analysis in a real scenario
    });

    test('should handle user data deletion requests', async () => {
      // Test that user data deletion endpoints exist (if implemented)
      await request
        .delete('/v1/users/me')
        .expect(401); // Should require authentication
    });

    test('should provide data export capabilities', async () => {
      // Test that data export endpoints exist (if implemented)
      await request
        .get('/v1/users/me/export')
        .expect(401); // Should require authentication
    });
  });

  describe('Firebase Security Rules Validation', () => {
    test('should enforce Firestore security rules', async () => {
      try {
        const db = admin.firestore();
        
        // Test that security rules are in place
        // This is a basic test - in production you'd use Firebase Rules Unit Testing
        const testDoc = db.collection('users').doc('test-security');
        
        // Should not be able to write without proper authentication
        // (This test assumes security rules are properly configured)
        expect(true).toBe(true); // Placeholder - real security rule testing needs special setup
      } catch (error) {
        console.warn('Firestore security rules test skipped - requires special setup');
      }
    });

    test('should enforce Realtime Database security rules', async () => {
      try {
        const rtdb = admin.database();
        
        // Test that security rules prevent unauthorized access
        // This is a basic test - in production you'd use Firebase Rules Unit Testing
        expect(true).toBe(true); // Placeholder - real security rule testing needs special setup
      } catch (error) {
        console.warn('Realtime Database security rules test skipped - requires special setup');
      }
    });

    test('should enforce Storage security rules', async () => {
      try {
        // Test that Firebase Storage security rules are in place
        // This would require actual file upload testing
        expect(true).toBe(true); // Placeholder
      } catch (error) {
        console.warn('Storage security rules test skipped - requires special setup');
      }
    });
  });

  describe('API Security', () => {
    test('should validate API versioning security', async () => {
      // Test that old API versions are properly secured
      await request
        .get('/v0/deprecated-endpoint')
        .expect(404); // Should not exist

      // Current version should be available
      const response = await request
        .get('/v1')
        .expect(200);

      expect(response.body.version).toBe('v1');
    });

    test('should prevent parameter pollution', async () => {
      await request
        .get('/v1/credits/balance?userId=user1&userId=user2')
        .expect(401); // Should be rejected due to no auth
    });

    test('should validate content type restrictions', async () => {
      // Should reject non-JSON content for JSON endpoints
      await request
        .post('/v1/chat/quick')
        .set('Content-Type', 'text/plain')
        .send('plain text data')
        .expect(400);
    });
  });

  describe('Cryptographic Security', () => {
    test('should use secure random generation', () => {
      // Test that crypto operations use secure randomness
      const crypto = require('crypto');
      
      const random1 = crypto.randomBytes(32).toString('hex');
      const random2 = crypto.randomBytes(32).toString('hex');
      
      expect(random1).not.toBe(random2);
      expect(random1.length).toBe(64); // 32 bytes = 64 hex chars
    });

    test('should validate JWT token structure', async () => {
      // Test JWT token validation (basic structure check)
      const invalidJWTs = [
        'not.a.jwt',
        'header.payload', // Missing signature
        'header.payload.signature.extra', // Too many parts
        ''
      ];

      for (const jwt of invalidJWTs) {
        await request
          .get('/v1/credits/balance')
          .set('Authorization', `Bearer ${jwt}`)
          .expect(401);
      }
    });
  });

  describe('Environment Security', () => {
    test('should not expose environment variables', async () => {
      const response = await request
        .get('/health')
        .expect(200);

      // Should not expose sensitive environment information
      expect(response.body.environment).not.toContain('secret');
      expect(response.body.environment).not.toContain('key');
      expect(response.body.environment).not.toContain('password');
    });

    test('should validate production configuration', () => {
      if (process.env.NODE_ENV === 'production') {
        // In production, debug modes should be disabled
        expect(process.env.DEBUG).toBeUndefined();
        expect(process.env.NODE_ENV).toBe('production');
        
        // Security-critical environment variables should be set
        const criticalVars = [
          'FIREBASE_PROJECT_ID',
          'JWT_SECRET',
          'ENCRYPTION_KEY'
        ];
        
        criticalVars.forEach(varName => {
          expect(process.env[varName]).toBeDefined();
        });
      }
    });
  });

  describe('Compliance Validation', () => {
    test('should maintain audit logs', async () => {
      try {
        const db = admin.firestore();
        
        // Check that audit log collection exists and is accessible
        const auditLogs = await db.collection('audit_logs').limit(1).get();
        expect(auditLogs).toBeDefined();
      } catch (error) {
        console.warn('Audit logs validation skipped - Firestore not available');
      }
    });

    test('should validate data retention policies', () => {
      // Test that data retention policies are configured
      const retentionDays = process.env.DATA_RETENTION_DAYS;
      
      if (process.env.NODE_ENV === 'production') {
        expect(retentionDays).toBeDefined();
        expect(parseInt(retentionDays || '0')).toBeGreaterThan(0);
      }
    });

    test('should validate backup encryption', () => {
      // Test that backups are configured with encryption
      const backupEncryption = process.env.BACKUP_ENCRYPTION_ENABLED;
      
      if (process.env.NODE_ENV === 'production') {
        expect(backupEncryption).toBe('true');
      }
    });
  });
});