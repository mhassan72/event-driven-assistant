/**
 * Credits API Tests
 * Unit tests for credit management endpoints
 */

import request from 'supertest';
import { app } from '../../../src/app';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock Firebase services
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  cert: jest.fn()
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({
          exists: true,
          data: () => ({
            userId: 'test-user-123',
            currentBalance: 1000,
            availableBalance: 950,
            reservedCredits: 50,
            accountStatus: 'active',
            lifetimeCreditsEarned: 2000,
            lifetimeCreditsSpent: 1000,
            lastUpdated: new Date().toISOString()
          })
        }))
      }))
    }))
  }))
}));

// Mock authentication middleware
jest.mock('../../../src/api/middleware/auth', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.user = {
      uid: 'test-user-123',
      email: 'test@example.com',
      emailVerified: true
    };
    next();
  }
}));

// Mock AI Credit Service
jest.mock('../../../src/features/credit-system/services/ai-credit-service', () => ({
  AICreditService: jest.fn().mockImplementation(() => ({
    getBalance: jest.fn().mockResolvedValue({
      userId: 'test-user-123',
      currentBalance: 1000,
      availableBalance: 950,
      reservedCredits: 50,
      accountStatus: 'active',
      lifetimeCreditsEarned: 2000,
      lifetimeCreditsSpent: 1000,
      lastUpdated: new Date().toISOString(),
      healthStatus: 'healthy'
    }),
    getTransactionHistory: jest.fn().mockResolvedValue([
      {
        id: 'tx-123',
        userId: 'test-user-123',
        type: 'deduction',
        amount: 50,
        reason: 'AI conversation',
        timestamp: new Date().toISOString()
      }
    ]),
    getAIUsageAnalytics: jest.fn().mockResolvedValue({
      totalCreditsUsed: 500,
      totalInteractions: 25,
      averageCreditsPerInteraction: 20,
      topModels: ['gpt-4', 'claude-3'],
      dailyUsage: []
    }),
    checkLowBalanceThreshold: jest.fn().mockResolvedValue(null),
    grantWelcomeBonus: jest.fn().mockResolvedValue({
      id: 'tx-welcome-123',
      amount: 1000,
      balanceAfter: 2000
    })
  }))
}));

describe('Credits API', () => {
  const authHeaders = {
    'Authorization': 'Bearer mock-firebase-token'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /v1/credits/balance', () => {
    it('should return user credit balance', async () => {
      const response = await request(app)
        .get('/v1/credits/balance')
        .set(authHeaders)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          userId: 'test-user-123',
          currentBalance: 1000,
          availableBalance: 950,
          reservedCredits: 50,
          accountStatus: 'active',
          lifetimeCreditsEarned: 2000,
          lifetimeCreditsSpent: 1000,
          lastUpdated: expect.any(String),
          healthStatus: 'healthy'
        }
      });
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/v1/credits/balance')
        .expect(401);
    });
  });

  describe('GET /v1/credits/history', () => {
    it('should return transaction history with default pagination', async () => {
      const response = await request(app)
        .get('/v1/credits/history')
        .set(authHeaders)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          transactions: expect.any(Array),
          pagination: {
            limit: 50,
            offset: 0,
            total: expect.any(Number)
          }
        }
      });
    });

    it('should accept pagination parameters', async () => {
      const response = await request(app)
        .get('/v1/credits/history')
        .query({ limit: 10, offset: 20 })
        .set(authHeaders)
        .expect(200);

      expect(response.body.data.pagination.limit).toBe(10);
      expect(response.body.data.pagination.offset).toBe(20);
    });

    it('should limit maximum page size', async () => {
      const response = await request(app)
        .get('/v1/credits/history')
        .query({ limit: 200 })
        .set(authHeaders)
        .expect(200);

      expect(response.body.data.pagination.limit).toBe(100);
    });
  });

  describe('GET /v1/credits/analytics', () => {
    it('should return AI usage analytics', async () => {
      const response = await request(app)
        .get('/v1/credits/analytics')
        .set(authHeaders)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          totalCreditsUsed: expect.any(Number),
          totalInteractions: expect.any(Number),
          averageCreditsPerInteraction: expect.any(Number),
          topModels: expect.any(Array),
          dailyUsage: expect.any(Array)
        }
      });
    });

    it('should accept time range parameter', async () => {
      const response = await request(app)
        .get('/v1/credits/analytics')
        .query({ days: 7 })
        .set(authHeaders)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /v1/credits/low-balance-check', () => {
    it('should check low balance status', async () => {
      const response = await request(app)
        .get('/v1/credits/low-balance-check')
        .set(authHeaders)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          hasAlert: false,
          alert: null
        }
      });
    });
  });

  describe('POST /v1/credits/welcome-bonus', () => {
    it('should grant welcome bonus for eligible users', async () => {
      const response = await request(app)
        .post('/v1/credits/welcome-bonus')
        .set(authHeaders)
        .send({ deviceFingerprint: 'test-device-123' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          transactionId: 'tx-welcome-123',
          amount: 1000,
          newBalance: 2000,
          message: 'Welcome bonus granted successfully'
        }
      });
    });

    it('should require device fingerprint', async () => {
      await request(app)
        .post('/v1/credits/welcome-bonus')
        .set(authHeaders)
        .send({})
        .expect(400);
    });
  });

  describe('POST /v1/credits/reserve', () => {
    it('should reserve credits for tasks', async () => {
      const response = await request(app)
        .post('/v1/credits/reserve')
        .set(authHeaders)
        .send({
          amount: 100,
          reason: 'AI task execution',
          correlationId: 'task-123',
          expiresInMinutes: 60
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('reservationId');
      expect(response.body.data).toHaveProperty('amount', 100);
    });

    it('should validate required fields', async () => {
      await request(app)
        .post('/v1/credits/reserve')
        .set(authHeaders)
        .send({ amount: 100 })
        .expect(400);
    });
  });

  describe('POST /v1/credits/release-reservation', () => {
    it('should release credit reservation', async () => {
      const response = await request(app)
        .post('/v1/credits/release-reservation')
        .set(authHeaders)
        .send({ reservationId: 'res-123' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Reservation released successfully'
      });
    });

    it('should require reservation ID', async () => {
      await request(app)
        .post('/v1/credits/release-reservation')
        .set(authHeaders)
        .send({})
        .expect(400);
    });
  });

  describe('POST /v1/credits/check-insufficient', () => {
    it('should check insufficient credits and return payment options', async () => {
      const response = await request(app)
        .post('/v1/credits/check-insufficient')
        .set(authHeaders)
        .send({ requiredAmount: 2000 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should validate required amount', async () => {
      await request(app)
        .post('/v1/credits/check-insufficient')
        .set(authHeaders)
        .send({ requiredAmount: -100 })
        .expect(400);
    });
  });

  describe('GET /v1/credits/verify/:transactionId', () => {
    it('should verify transaction integrity', async () => {
      const response = await request(app)
        .get('/v1/credits/verify/tx-123')
        .set(authHeaders)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          transactionId: 'tx-123',
          isValid: expect.any(Boolean),
          verificationTimestamp: expect.any(String),
          issues: expect.any(Array),
          status: expect.stringMatching(/^(verified|failed)$/)
        }
      });
    });

    it('should require transaction ID', async () => {
      await request(app)
        .get('/v1/credits/verify/')
        .set(authHeaders)
        .expect(404);
    });
  });

  describe('GET /v1/credits/validate-chain', () => {
    it('should validate hash chain integrity', async () => {
      const response = await request(app)
        .get('/v1/credits/validate-chain')
        .set(authHeaders)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          userId: 'test-user-123',
          isValid: expect.any(Boolean),
          totalTransactions: expect.any(Number),
          validatedTransactions: expect.any(Number),
          errors: expect.any(Array),
          brokenAt: expect.anything(),
          lastValidHash: expect.anything()
        }
      });
    });
  });

  describe('GET /v1/credits/audit', () => {
    it('should generate audit report', async () => {
      const response = await request(app)
        .get('/v1/credits/audit')
        .set(authHeaders)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should accept time range parameter', async () => {
      const response = await request(app)
        .get('/v1/credits/audit')
        .query({ days: 7 })
        .set(authHeaders)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /v1/credits/sync-balance', () => {
    it('should sync balance between databases', async () => {
      const response = await request(app)
        .post('/v1/credits/sync-balance')
        .set(authHeaders)
        .expect(200);

      expect(response.body.success).toBeDefined();
      expect(response.body.data).toHaveProperty('userId', 'test-user-123');
      expect(response.body.data).toHaveProperty('syncedAt');
    });
  });

  describe('GET /v1/credits/validate-balance', () => {
    it('should validate balance consistency', async () => {
      const response = await request(app)
        .get('/v1/credits/validate-balance')
        .set(authHeaders)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });
  });
});