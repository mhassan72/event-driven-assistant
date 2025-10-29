/**
 * API Integration Tests
 * Comprehensive tests for all API endpoints with authentication and authorization
 */

import request from 'supertest';
import { app } from '../../../src/app';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// Mock Firebase Admin SDK
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  cert: jest.fn()
}));

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
    getUser: jest.fn()
  }))
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
      })),
      where: jest.fn(() => ({
        orderBy: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn()
          }))
        })),
        get: jest.fn()
      })),
      limit: jest.fn(() => ({
        get: jest.fn()
      })),
      get: jest.fn()
    }))
  }))
}));

jest.mock('firebase-admin/database', () => ({
  getDatabase: jest.fn(() => ({
    ref: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      once: jest.fn(),
      on: jest.fn(),
      off: jest.fn()
    }))
  }))
}));

// Mock Firebase Auth middleware
jest.mock('../../../src/api/middleware/auth', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.user = {
      uid: 'test-user-123',
      email: 'test@example.com',
      emailVerified: true,
      roles: ['user'],
      permissions: ['VIEW_CREDITS', 'USE_AI_ASSISTANT', 'GENERATE_IMAGES', 'MAKE_PAYMENTS']
    };
    next();
  },
  optionalAuth: (req: any, res: any, next: any) => {
    req.user = {
      uid: 'test-user-123',
      email: 'test@example.com',
      emailVerified: true,
      roles: ['user'],
      permissions: ['VIEW_CREDITS', 'USE_AI_ASSISTANT', 'GENERATE_IMAGES', 'MAKE_PAYMENTS']
    };
    next();
  },
  requireAdmin: (req: any, res: any, next: any) => {
    req.user = {
      uid: 'admin-user-123',
      email: 'admin@example.com',
      emailVerified: true,
      roles: ['admin'],
      permissions: ['VIEW_CREDITS', 'MANAGE_CREDITS', 'USE_AI_ASSISTANT', 'MANAGE_USERS', 'API_ACCESS']
    };
    next();
  },
  requireRole: () => (req: any, res: any, next: any) => next(),
  requirePermission: () => (req: any, res: any, next: any) => next(),
  rateLimitByUser: () => (req: any, res: any, next: any) => next()
}));

describe('API Integration Tests', () => {
  let server: any;

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.FIREBASE_PROJECT_ID = 'test-project';
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Public Endpoints', () => {
    describe('GET /health', () => {
      it('should return health status', async () => {
        const response = await request(app)
          .get('/health')
          .expect(200);

        expect(response.body).toHaveProperty('status', 'healthy');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('version');
        expect(response.body).toHaveProperty('services');
      });
    });

    describe('GET /v1', () => {
      it('should return API information', async () => {
        const response = await request(app)
          .get('/v1')
          .expect(200);

        expect(response.body).toHaveProperty('version', 'v1');
        expect(response.body).toHaveProperty('name', 'Integrated Credit System API');
        expect(response.body).toHaveProperty('endpoints');
        expect(response.body).toHaveProperty('features');
      });
    });

    describe('GET /v1/docs/openapi.json', () => {
      it('should return OpenAPI specification', async () => {
        const response = await request(app)
          .get('/v1/docs/openapi.json')
          .expect(200);

        expect(response.body).toHaveProperty('openapi');
        expect(response.body).toHaveProperty('info');
        expect(response.body).toHaveProperty('paths');
        expect(response.body).toHaveProperty('components');
      });
    });

    describe('GET /v1/monitoring/health', () => {
      it('should return system health', async () => {
        const response = await request(app)
          .get('/v1/monitoring/health')
          .expect(200);

        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('services');
        expect(response.body).toHaveProperty('timestamp');
      });
    });
  });

  describe('Authentication Required Endpoints', () => {
    const authHeaders = {
      'Authorization': 'Bearer mock-firebase-token'
    };

    describe('Credits API', () => {
      describe('GET /v1/credits/balance', () => {
        it('should return user credit balance', async () => {
          const response = await request(app)
            .get('/v1/credits/balance')
            .set(authHeaders)
            .expect(200);

          expect(response.body).toHaveProperty('success', true);
          expect(response.body).toHaveProperty('data');
          expect(response.body.data).toHaveProperty('userId');
          expect(response.body.data).toHaveProperty('currentBalance');
        });

        it('should fail without authentication', async () => {
          await request(app)
            .get('/v1/credits/balance')
            .expect(401);
        });
      });

      describe('GET /v1/credits/history', () => {
        it('should return transaction history with pagination', async () => {
          const response = await request(app)
            .get('/v1/credits/history')
            .query({ limit: 10, offset: 0 })
            .set(authHeaders)
            .expect(200);

          expect(response.body).toHaveProperty('success', true);
          expect(response.body).toHaveProperty('data');
          expect(response.body.data).toHaveProperty('transactions');
          expect(response.body.data).toHaveProperty('pagination');
        });
      });

      describe('POST /v1/credits/welcome-bonus', () => {
        it('should grant welcome bonus for new users', async () => {
          const response = await request(app)
            .post('/v1/credits/welcome-bonus')
            .set(authHeaders)
            .send({ deviceFingerprint: 'test-device-123' })
            .expect(200);

          expect(response.body).toHaveProperty('success', true);
          expect(response.body.data).toHaveProperty('transactionId');
          expect(response.body.data).toHaveProperty('amount');
        });
      });
    });

    describe('Chat API', () => {
      describe('POST /v1/chat/conversations', () => {
        it('should create new conversation', async () => {
          const response = await request(app)
            .post('/v1/chat/conversations')
            .set(authHeaders)
            .send({
              title: 'Test Conversation',
              initialMessage: 'Hello, AI assistant!'
            })
            .expect(201);

          expect(response.body).toHaveProperty('success', true);
          expect(response.body.data).toHaveProperty('conversationId');
          expect(response.body.data).toHaveProperty('title', 'Test Conversation');
        });

        it('should fail without initial message', async () => {
          await request(app)
            .post('/v1/chat/conversations')
            .set(authHeaders)
            .send({ title: 'Test Conversation' })
            .expect(400);
        });
      });

      describe('GET /v1/chat/conversations', () => {
        it('should list user conversations', async () => {
          const response = await request(app)
            .get('/v1/chat/conversations')
            .set(authHeaders)
            .expect(200);

          expect(response.body).toHaveProperty('success', true);
          expect(response.body.data).toHaveProperty('conversations');
          expect(response.body.data).toHaveProperty('pagination');
        });
      });

      describe('POST /v1/chat/agent-tasks', () => {
        it('should create agent task', async () => {
          const response = await request(app)
            .post('/v1/chat/agent-tasks')
            .set(authHeaders)
            .send({
              taskType: 'research',
              prompt: 'Research the latest developments in AI',
              parameters: { maxCredits: 100 }
            })
            .expect(201);

          expect(response.body).toHaveProperty('success', true);
          expect(response.body.data).toHaveProperty('taskId');
          expect(response.body.data).toHaveProperty('status', 'queued');
        });

        it('should validate task type', async () => {
          await request(app)
            .post('/v1/chat/agent-tasks')
            .set(authHeaders)
            .send({
              taskType: 'invalid-type',
              prompt: 'Test prompt'
            })
            .expect(400);
        });
      });
    });

    describe('Models API', () => {
      describe('GET /v1/models', () => {
        it('should return available models', async () => {
          const response = await request(app)
            .get('/v1/models')
            .set(authHeaders)
            .expect(200);

          expect(response.body).toHaveProperty('success', true);
          expect(response.body.data).toHaveProperty('models');
          expect(response.body.data).toHaveProperty('totalCount');
        });

        it('should filter by category', async () => {
          const response = await request(app)
            .get('/v1/models')
            .query({ category: 'text_generation' })
            .set(authHeaders)
            .expect(200);

          expect(response.body).toHaveProperty('success', true);
        });
      });

      describe('GET /v1/models/preferences', () => {
        it('should return user model preferences', async () => {
          const response = await request(app)
            .get('/v1/models/preferences')
            .set(authHeaders)
            .expect(200);

          expect(response.body).toHaveProperty('success', true);
          expect(response.body.data).toHaveProperty('preferences');
        });
      });

      describe('POST /v1/models/estimate-cost', () => {
        it('should estimate model cost', async () => {
          const response = await request(app)
            .post('/v1/models/estimate-cost')
            .set(authHeaders)
            .send({
              modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
              inputTokens: 1000,
              outputTokens: 500
            })
            .expect(200);

          expect(response.body).toHaveProperty('success', true);
          expect(response.body.data).toHaveProperty('estimatedCost');
        });
      });
    });

    describe('Images API', () => {
      describe('POST /v1/images/generate', () => {
        it('should create image generation task', async () => {
          const response = await request(app)
            .post('/v1/images/generate')
            .set(authHeaders)
            .send({
              prompt: 'A beautiful sunset over mountains',
              size: '1024x1024',
              quality: 'standard'
            })
            .expect(201);

          expect(response.body).toHaveProperty('success', true);
          expect(response.body.data).toHaveProperty('taskId');
          expect(response.body.data).toHaveProperty('estimatedCredits');
        });

        it('should validate prompt length', async () => {
          const longPrompt = 'A'.repeat(1001);
          await request(app)
            .post('/v1/images/generate')
            .set(authHeaders)
            .send({ prompt: longPrompt })
            .expect(400);
        });

        it('should validate image size', async () => {
          await request(app)
            .post('/v1/images/generate')
            .set(authHeaders)
            .send({
              prompt: 'Test prompt',
              size: 'invalid-size'
            })
            .expect(400);
        });
      });

      describe('GET /v1/images', () => {
        it('should list user images', async () => {
          const response = await request(app)
            .get('/v1/images')
            .set(authHeaders)
            .expect(200);

          expect(response.body).toHaveProperty('success', true);
          expect(response.body.data).toHaveProperty('images');
          expect(response.body.data).toHaveProperty('pagination');
        });
      });
    });

    describe('Payments API', () => {
      describe('GET /v1/payments/options', () => {
        it('should return payment options', async () => {
          const response = await request(app)
            .get('/v1/payments/options')
            .set(authHeaders)
            .expect(200);

          expect(response.body).toHaveProperty('success', true);
          expect(response.body.data).toHaveProperty('creditPackages');
          expect(response.body.data).toHaveProperty('paymentMethods');
        });
      });

      describe('POST /v1/payments/traditional', () => {
        it('should process traditional payment', async () => {
          const response = await request(app)
            .post('/v1/payments/traditional')
            .set(authHeaders)
            .send({
              creditAmount: 1000,
              paymentMethod: 'credit_card',
              customerInfo: {
                name: 'Test User',
                email: 'test@example.com'
              }
            })
            .expect(200);

          expect(response.body).toHaveProperty('success', true);
          expect(response.body.data).toHaveProperty('paymentId');
        });

        it('should validate credit amount', async () => {
          await request(app)
            .post('/v1/payments/traditional')
            .set(authHeaders)
            .send({
              creditAmount: -100,
              paymentMethod: 'credit_card'
            })
            .expect(400);
        });
      });
    });
  });

  describe('Error Handling', () => {
    const authHeaders = {
      'Authorization': 'Bearer mock-firebase-token'
    };

    it('should handle 404 for non-existent endpoints', async () => {
      await request(app)
        .get('/v1/non-existent-endpoint')
        .set(authHeaders)
        .expect(404);
    });

    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/v1/chat/conversations')
        .set(authHeaders)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });

    it('should include correlation ID in error responses', async () => {
      const response = await request(app)
        .get('/v1/non-existent-endpoint')
        .set(authHeaders)
        .expect(404);

      expect(response.headers).toHaveProperty('x-correlation-id');
    });
  });

  describe('Request Validation', () => {
    const authHeaders = {
      'Authorization': 'Bearer mock-firebase-token'
    };

    it('should sanitize input data', async () => {
      const response = await request(app)
        .post('/v1/chat/conversations')
        .set(authHeaders)
        .send({
          title: '<script>alert("xss")</script>Clean Title',
          initialMessage: 'Hello, AI!'
        })
        .expect(201);

      expect(response.body.data.title).not.toContain('<script>');
    });

    it('should enforce rate limiting headers', async () => {
      const response = await request(app)
        .get('/v1/credits/balance')
        .set(authHeaders)
        .expect(200);

      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });

  describe('API Versioning', () => {
    it('should include API version in headers', async () => {
      const response = await request(app)
        .get('/v1')
        .expect(200);

      expect(response.headers).toHaveProperty('x-api-version', 'v1');
    });

    it('should handle version-specific endpoints', async () => {
      const response = await request(app)
        .get('/v1/monitoring/version')
        .expect(200);

      expect(response.body).toHaveProperty('api');
      expect(response.body).toHaveProperty('dependencies');
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/v1')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options', 'DENY');
      expect(response.headers).toHaveProperty('x-xss-protection', '1; mode=block');
    });

    it('should include CORS headers', async () => {
      const response = await request(app)
        .options('/v1/credits/balance')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });
  });

  describe('Performance', () => {
    const authHeaders = {
      'Authorization': 'Bearer mock-firebase-token'
    };

    it('should include response time headers', async () => {
      const response = await request(app)
        .get('/v1/credits/balance')
        .set(authHeaders)
        .expect(200);

      expect(response.headers).toHaveProperty('x-response-time');
    });

    it('should handle concurrent requests', async () => {
      const requests = Array(10).fill(null).map(() =>
        request(app)
          .get('/v1/credits/balance')
          .set(authHeaders)
      );

      const responses = await Promise.all(requests);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });
});