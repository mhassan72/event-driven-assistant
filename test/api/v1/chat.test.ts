/**
 * Chat API Tests
 * Unit tests for AI conversation endpoints
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
            id: 'conv-123',
            userId: 'test-user-123',
            title: 'Test Conversation',
            messages: [
              {
                id: 'msg-1',
                role: 'user',
                content: 'Hello',
                timestamp: new Date().toISOString(),
                creditsUsed: 0
              }
            ],
            createdAt: new Date().toISOString(),
            lastMessageAt: new Date().toISOString(),
            totalCreditsUsed: 25
          })
        })),
        set: jest.fn(),
        update: jest.fn()
      })),
      where: jest.fn(() => ({
        orderBy: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn(() => Promise.resolve({
              docs: [
                {
                  id: 'conv-123',
                  data: () => ({
                    title: 'Test Conversation',
                    lastMessageAt: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    messages: [{ content: 'Hello, how can I help you?' }],
                    totalCreditsUsed: 25
                  })
                }
              ]
            }))
          }))
        }))
      }))
    }))
  }))
}));

jest.mock('firebase-admin/database', () => ({
  getDatabase: jest.fn(() => ({
    ref: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      once: jest.fn(() => Promise.resolve({
        val: () => ({
          status: 'active',
          lastActivity: new Date().toISOString(),
          messageCount: 1
        })
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
  },
  requirePermission: () => (req: any, res: any, next: any) => next(),
  rateLimitByUser: () => (req: any, res: any, next: any) => next()
}));

describe('Chat API', () => {
  const authHeaders = {
    'Authorization': 'Bearer mock-firebase-token'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /v1/chat/conversations', () => {
    it('should create new conversation', async () => {
      const response = await request(app)
        .post('/v1/chat/conversations')
        .set(authHeaders)
        .send({
          title: 'Test Conversation',
          initialMessage: 'Hello, AI assistant!',
          modelPreferences: { model: 'gpt-4' }
        })
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        data: {
          conversationId: expect.stringMatching(/^conv_/),
          title: 'Test Conversation',
          createdAt: expect.any(String),
          status: 'created',
          message: expect.stringContaining('Conversation created successfully')
        }
      });
    });

    it('should use default title if not provided', async () => {
      const response = await request(app)
        .post('/v1/chat/conversations')
        .set(authHeaders)
        .send({
          initialMessage: 'Hello, AI assistant!'
        })
        .expect(201);

      expect(response.body.data.title).toBe('New Conversation');
    });

    it('should require initial message', async () => {
      await request(app)
        .post('/v1/chat/conversations')
        .set(authHeaders)
        .send({
          title: 'Test Conversation'
        })
        .expect(400);
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/v1/chat/conversations')
        .send({
          title: 'Test Conversation',
          initialMessage: 'Hello!'
        })
        .expect(401);
    });
  });

  describe('POST /v1/chat/conversations/:conversationId/messages', () => {
    it('should send message to AI assistant', async () => {
      const response = await request(app)
        .post('/v1/chat/conversations/conv-123/messages')
        .set(authHeaders)
        .send({
          message: 'How are you today?',
          modelOverride: 'gpt-4'
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          messageId: expect.stringMatching(/^msg_/),
          conversationId: 'conv-123',
          status: 'queued',
          message: expect.stringContaining('Message sent to AI assistant'),
          timestamp: expect.any(String)
        }
      });
    });

    it('should require message content', async () => {
      await request(app)
        .post('/v1/chat/conversations/conv-123/messages')
        .set(authHeaders)
        .send({})
        .expect(400);
    });

    it('should validate conversation ownership', async () => {
      // Mock conversation not found or access denied
      const mockFirestore = require('firebase-admin/firestore').getFirestore();
      mockFirestore.collection().doc().get.mockResolvedValueOnce({
        exists: false
      });

      await request(app)
        .post('/v1/chat/conversations/conv-456/messages')
        .set(authHeaders)
        .send({
          message: 'Hello'
        })
        .expect(404);
    });
  });

  describe('GET /v1/chat/conversations/:conversationId', () => {
    it('should return conversation details', async () => {
      const response = await request(app)
        .get('/v1/chat/conversations/conv-123')
        .set(authHeaders)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          id: 'conv-123',
          title: 'Test Conversation',
          messages: expect.any(Array),
          createdAt: expect.any(String),
          lastMessageAt: expect.any(String),
          totalCreditsUsed: expect.any(Number),
          status: expect.any(String),
          messageCount: expect.any(Number)
        }
      });
    });

    it('should return 404 for non-existent conversation', async () => {
      const mockFirestore = require('firebase-admin/firestore').getFirestore();
      mockFirestore.collection().doc().get.mockResolvedValueOnce({
        exists: false
      });

      await request(app)
        .get('/v1/chat/conversations/conv-nonexistent')
        .set(authHeaders)
        .expect(404);
    });
  });

  describe('GET /v1/chat/conversations', () => {
    it('should list user conversations', async () => {
      const response = await request(app)
        .get('/v1/chat/conversations')
        .set(authHeaders)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          conversations: expect.any(Array),
          pagination: {
            limit: 20,
            offset: 0,
            total: expect.any(Number),
            hasMore: expect.any(Boolean)
          }
        }
      });

      expect(response.body.data.conversations[0]).toEqual({
        id: expect.any(String),
        title: expect.any(String),
        lastMessageAt: expect.any(String),
        createdAt: expect.any(String),
        messageCount: expect.any(Number),
        totalCreditsUsed: expect.any(Number),
        lastMessage: expect.any(String)
      });
    });

    it('should accept pagination parameters', async () => {
      const response = await request(app)
        .get('/v1/chat/conversations')
        .query({ limit: 10, offset: 5 })
        .set(authHeaders)
        .expect(200);

      expect(response.body.data.pagination.limit).toBe(10);
      expect(response.body.data.pagination.offset).toBe(5);
    });

    it('should limit maximum page size', async () => {
      const response = await request(app)
        .get('/v1/chat/conversations')
        .query({ limit: 200 })
        .set(authHeaders)
        .expect(200);

      expect(response.body.data.pagination.limit).toBe(100);
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
          parameters: {
            maxCredits: 500,
            estimatedDuration: 300
          },
          priority: 'high'
        })
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        data: {
          taskId: expect.stringMatching(/^agent_/),
          status: 'queued',
          taskType: 'research',
          createdAt: expect.any(String),
          estimatedDuration: 300,
          message: expect.stringContaining('Agent task queued successfully')
        }
      });
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

    it('should require prompt', async () => {
      await request(app)
        .post('/v1/chat/agent-tasks')
        .set(authHeaders)
        .send({
          taskType: 'research'
        })
        .expect(400);
    });

    it('should use default priority if not specified', async () => {
      const response = await request(app)
        .post('/v1/chat/agent-tasks')
        .set(authHeaders)
        .send({
          taskType: 'analysis',
          prompt: 'Analyze this data'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /v1/chat/agent-tasks/:taskId', () => {
    beforeEach(() => {
      // Mock Firestore response for agent task
      const mockFirestore = require('firebase-admin/firestore').getFirestore();
      mockFirestore.collection().doc().get.mockResolvedValue({
        exists: true,
        data: () => ({
          id: 'agent-123',
          userId: 'test-user-123',
          taskType: 'research',
          status: 'in_progress',
          progress: 50,
          createdAt: new Date().toISOString(),
          result: null,
          creditsUsed: 100
        })
      });

      // Mock Realtime Database response
      const mockRealtimeDb = require('firebase-admin/database').getDatabase();
      mockRealtimeDb.ref().once.mockResolvedValue({
        val: () => ({
          status: 'processing',
          progress: 75,
          updatedAt: new Date().toISOString(),
          estimatedCompletion: new Date(Date.now() + 60000).toISOString(),
          currentStep: 'Analyzing data'
        })
      });
    });

    it('should return agent task status', async () => {
      const response = await request(app)
        .get('/v1/chat/agent-tasks/agent-123')
        .set(authHeaders)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          taskId: 'agent-123',
          taskType: 'research',
          status: expect.any(String),
          progress: expect.any(Number),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          result: null,
          creditsUsed: expect.any(Number),
          estimatedCompletion: expect.any(String),
          currentStep: expect.any(String)
        }
      });
    });

    it('should return 404 for non-existent task', async () => {
      const mockFirestore = require('firebase-admin/firestore').getFirestore();
      mockFirestore.collection().doc().get.mockResolvedValueOnce({
        exists: false
      });

      await request(app)
        .get('/v1/chat/agent-tasks/agent-nonexistent')
        .set(authHeaders)
        .expect(404);
    });

    it('should validate task ownership', async () => {
      const mockFirestore = require('firebase-admin/firestore').getFirestore();
      mockFirestore.collection().doc().get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          userId: 'other-user-456',
          taskType: 'research'
        })
      });

      await request(app)
        .get('/v1/chat/agent-tasks/agent-123')
        .set(authHeaders)
        .expect(400);
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const response = await request(app)
        .post('/v1/chat/conversations')
        .set(authHeaders)
        .send({
          title: 'Test',
          initialMessage: 'Hello'
        })
        .expect(201);

      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });

  describe('Input Validation', () => {
    it('should sanitize HTML in conversation title', async () => {
      const response = await request(app)
        .post('/v1/chat/conversations')
        .set(authHeaders)
        .send({
          title: '<script>alert("xss")</script>Clean Title',
          initialMessage: 'Hello'
        })
        .expect(201);

      expect(response.body.data.title).not.toContain('<script>');
      expect(response.body.data.title).toContain('Clean Title');
    });

    it('should handle very long messages', async () => {
      const longMessage = 'A'.repeat(10001);
      
      await request(app)
        .post('/v1/chat/conversations/conv-123/messages')
        .set(authHeaders)
        .send({
          message: longMessage
        })
        .expect(400);
    });
  });
});