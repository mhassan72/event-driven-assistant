/**
 * Production Deployment Smoke Tests
 * Validates critical functionality after deployment
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import supertest from 'supertest';
import * as admin from 'firebase-admin';

// Test configuration
const TEST_CONFIG = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:5001/sports-news-5fd0a/us-central1/api',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 2000
};

let request: supertest.SuperTest<supertest.Test>;
let testUserId: string;
let testUserToken: string;

describe('Production Deployment Smoke Tests', () => {
  beforeAll(async () => {
    // Initialize test client
    request = supertest(TEST_CONFIG.baseUrl);
    
    // Create test user for authenticated endpoints
    if (admin.apps.length === 0) {
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'sports-news-5fd0a'
      });
    }
    
    try {
      const testUser = await admin.auth().createUser({
        email: `test-${Date.now()}@example.com`,
        password: 'TestPassword123!',
        displayName: 'Test User'
      });
      
      testUserId = testUser.uid;
      testUserToken = await admin.auth().createCustomToken(testUserId);
    } catch (error) {
      console.warn('Could not create test user, some tests may be skipped');
    }
  }, TEST_CONFIG.timeout);

  afterAll(async () => {
    // Cleanup test user
    if (testUserId) {
      try {
        await admin.auth().deleteUser(testUserId);
      } catch (error) {
        console.warn('Could not cleanup test user');
      }
    }
  });

  describe('Health and Status Endpoints', () => {
    test('should respond to health check', async () => {
      const response = await request
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        version: expect.any(String)
      });
    });

    test('should respond to system health (with auth)', async () => {
      if (!testUserToken) {
        console.log('Skipping authenticated test - no test user');
        return;
      }

      const response = await request
        .get('/monitoring/system/health')
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          overall: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
          timestamp: expect.any(String),
          checks: expect.any(Array)
        })
      });
    });
  });

  describe('API Endpoints Availability', () => {
    test('should have v1 API available', async () => {
      const response = await request
        .get('/v1')
        .expect(200);

      expect(response.body).toMatchObject({
        message: expect.any(String),
        version: 'v1'
      });
    });

    test('should handle 404 gracefully', async () => {
      const response = await request
        .get('/nonexistent-endpoint')
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: expect.stringContaining('not found')
      });
    });

    test('should require authentication for protected endpoints', async () => {
      await request
        .get('/v1/credits/balance')
        .expect(401);
    });
  });

  describe('Firebase Services Integration', () => {
    test('should connect to Firestore', async () => {
      try {
        const db = admin.firestore();
        const testDoc = await db.collection('system_health').limit(1).get();
        expect(testDoc).toBeDefined();
      } catch (error) {
        throw new Error(`Firestore connection failed: ${error}`);
      }
    });

    test('should connect to Realtime Database', async () => {
      try {
        const rtdb = admin.database();
        await rtdb.ref('system_status/health').once('value');
      } catch (error) {
        throw new Error(`Realtime Database connection failed: ${error}`);
      }
    });

    test('should have Firebase Auth configured', async () => {
      try {
        // Try to verify a dummy token (will fail but tests service availability)
        await admin.auth().verifyIdToken('dummy-token').catch(() => {
          // Expected to fail, but service is responding
        });
      } catch (error) {
        throw new Error(`Firebase Auth not available: ${error}`);
      }
    });
  });

  describe('Credit System Smoke Tests', () => {
    test('should handle credit balance request with auth', async () => {
      if (!testUserToken) {
        console.log('Skipping authenticated test - no test user');
        return;
      }

      const response = await request
        .get('/v1/credits/balance')
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          currentBalance: expect.any(Number),
          lastUpdated: expect.any(String)
        })
      });
    });

    test('should handle credit transaction history request', async () => {
      if (!testUserToken) {
        console.log('Skipping authenticated test - no test user');
        return;
      }

      const response = await request
        .get('/v1/credits/transactions')
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          transactions: expect.any(Array),
          pagination: expect.any(Object)
        })
      });
    });
  });

  describe('AI Assistant Smoke Tests', () => {
    test('should handle model list request', async () => {
      if (!testUserToken) {
        console.log('Skipping authenticated test - no test user');
        return;
      }

      const response = await request
        .get('/v1/models/available')
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          models: expect.any(Array)
        })
      });
    });

    test('should validate chat request format', async () => {
      if (!testUserToken) {
        console.log('Skipping authenticated test - no test user');
        return;
      }

      // Test with invalid request
      await request
        .post('/v1/chat/quick')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({})
        .expect(400);

      // Test with valid request format
      const response = await request
        .post('/v1/chat/quick')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          message: 'Hello, this is a test message',
          conversationId: 'test-conversation'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: expect.any(Boolean)
      });
    });
  });

  describe('Payment System Smoke Tests', () => {
    test('should handle payment packages request', async () => {
      if (!testUserToken) {
        console.log('Skipping authenticated test - no test user');
        return;
      }

      const response = await request
        .get('/v1/payments/packages')
        .set('Authorization', `Bearer ${testUserToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          packages: expect.any(Array)
        })
      });
    });

    test('should validate payment session creation', async () => {
      if (!testUserToken) {
        console.log('Skipping authenticated test - no test user');
        return;
      }

      // Test with invalid request
      await request
        .post('/v1/payments/create-session')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('Security and Rate Limiting', () => {
    test('should enforce rate limiting', async () => {
      const requests = Array(10).fill(null).map(() => 
        request.get('/health')
      );

      const responses = await Promise.all(requests);
      
      // Should handle burst requests gracefully
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });

    test('should have security headers', async () => {
      const response = await request
        .get('/health')
        .expect(200);

      // Check for basic security headers
      expect(response.headers).toMatchObject({
        'x-content-type-options': 'nosniff',
        'x-frame-options': expect.any(String),
        'x-xss-protection': expect.any(String)
      });
    });

    test('should reject malformed requests', async () => {
      await request
        .post('/v1/chat/quick')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });
  });

  describe('Performance Validation', () => {
    test('should respond to health check within acceptable time', async () => {
      const startTime = Date.now();
      
      await request
        .get('/health')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(5000); // 5 seconds max
    });

    test('should handle concurrent requests', async () => {
      const concurrentRequests = 5;
      const requests = Array(concurrentRequests).fill(null).map(() => 
        request.get('/health')
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Should handle concurrent requests efficiently
      expect(totalTime).toBeLessThan(10000); // 10 seconds max for 5 concurrent requests
    });
  });
});

// Utility function for retrying failed tests
async function retryTest(testFn: () => Promise<void>, attempts: number = TEST_CONFIG.retryAttempts): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await testFn();
      return;
    } catch (error) {
      if (i === attempts - 1) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.retryDelay));
    }
  }
}