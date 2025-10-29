/**
 * Conversation Manager Tests
 * Unit tests for conversation history and context management
 */

import { ConversationManager, IConversationManager } from '@/features/ai-assistant/services/conversation-manager';
import { 
  ConversationContext,
  ConversationMessage,
  MessageRole,
  MemoryConfig,
  MemoryType
} from '@/shared/types';
import { IStructuredLogger } from '@/shared/observability/logger';
import { IMetricsCollector } from '@/shared/observability/metrics';
import * as admin from 'firebase-admin';

// Mock Firebase Admin
jest.mock('firebase-admin', () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: jest.fn(() => new Date()),
      increment: jest.fn((value: number) => value)
    }
  },
  database: {
    ServerValue: {
      TIMESTAMP: Date.now()
    }
  }
}));

// Mock dependencies
const mockFirestore = {
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  set: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue({
    exists: true,
    data: jest.fn().mockReturnValue({
      conversationId: 'test-conv-1',
      userId: 'test-user-1',
      messageHistory: [],
      systemPrompt: 'You are a helpful assistant',
      variables: {},
      metadata: {
        createdAt: new Date(),
        lastActivity: new Date(),
        messageCount: 0
      }
    })
  }),
  update: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  runTransaction: jest.fn().mockImplementation((callback) => callback({
    get: jest.fn().mockResolvedValue({
      exists: true,
      data: jest.fn().mockReturnValue({})
    }),
    update: jest.fn(),
    set: jest.fn()
  }))
} as any;

const mockRealtimeDB = {
  ref: jest.fn().mockReturnThis(),
  set: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
  push: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined)
} as any;

const mockLogger: jest.Mocked<IStructuredLogger> = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  logError: jest.fn()
};

const mockMetrics: jest.Mocked<IMetricsCollector> = {
  increment: jest.fn(),
  gauge: jest.fn(),
  histogram: jest.fn(),
  recordHttpRequest: jest.fn(),
  recordCreditOperation: jest.fn(),
  recordPayment: jest.fn(),
  getMetrics: jest.fn(),
  clearMetrics: jest.fn()
};

describe('ConversationManager', () => {
  let conversationManager: IConversationManager;

  beforeEach(() => {
    conversationManager = new ConversationManager(
      mockFirestore,
      mockRealtimeDB,
      mockLogger,
      mockMetrics
    );
    jest.clearAllMocks();
  });

  describe('createConversation', () => {
    it('should create a new conversation successfully', async () => {
      const userId = 'test-user-1';
      const initialMessage = 'Hello, I need help with something';

      const context = await conversationManager.createConversation(userId, initialMessage);

      expect(context).toBeDefined();
      expect(context.conversationId).toBeDefined();
      expect(context.userId).toBe(userId);
      expect(context.messageHistory).toHaveLength(1);
      expect(context.messageHistory[0].content).toBe(initialMessage);
      expect(context.messageHistory[0].role).toBe(MessageRole.USER);
      expect(context.systemPrompt).toBeDefined();

      expect(mockFirestore.collection).toHaveBeenCalledWith('conversations');
      expect(mockFirestore.set).toHaveBeenCalled();
      expect(mockRealtimeDB.ref).toHaveBeenCalled();
      expect(mockRealtimeDB.set).toHaveBeenCalled();
    });

    it('should create conversation without initial message', async () => {
      const userId = 'test-user-2';

      const context = await conversationManager.createConversation(userId);

      expect(context.conversationId).toBeDefined();
      expect(context.userId).toBe(userId);
      expect(context.messageHistory).toHaveLength(0);
      expect(context.metadata?.messageCount).toBe(0);
    });

    it('should log conversation creation', async () => {
      const userId = 'test-user-logging';
      
      await conversationManager.createConversation(userId, 'Test message');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Conversation created',
        expect.objectContaining({
          userId,
          hasInitialMessage: true
        })
      );

      expect(mockMetrics.increment).toHaveBeenCalledWith('conversation_manager.conversations_created');
    });
  });

  describe('getConversation', () => {
    it('should retrieve existing conversation', async () => {
      const conversationId = 'test-conv-1';

      const context = await conversationManager.getConversation(conversationId);

      expect(context).toBeDefined();
      expect(context.conversationId).toBe(conversationId);
      expect(mockFirestore.collection).toHaveBeenCalledWith('conversations');
      expect(mockFirestore.doc).toHaveBeenCalledWith(conversationId);
      expect(mockFirestore.get).toHaveBeenCalled();
    });

    it('should throw error for non-existent conversation', async () => {
      mockFirestore.get.mockResolvedValueOnce({
        exists: false
      });

      await expect(conversationManager.getConversation('non-existent'))
        .rejects.toThrow('Conversation non-existent not found');
    });

    it('should update last access time', async () => {
      const conversationId = 'test-conv-access';
      
      await conversationManager.getConversation(conversationId);

      expect(mockRealtimeDB.ref).toHaveBeenCalledWith(
        expect.stringContaining('lastActivity')
      );
    });
  });

  describe('addMessage', () => {
    const testMessage: ConversationMessage = {
      id: 'msg-1',
      role: MessageRole.USER,
      content: 'Test message content',
      timestamp: new Date(),
      metadata: {}
    };

    it('should add message to conversation', async () => {
      const conversationId = 'test-conv-1';

      await conversationManager.addMessage(conversationId, testMessage);

      expect(mockFirestore.update).toHaveBeenCalled();
      expect(mockRealtimeDB.ref).toHaveBeenCalled();
      // Note: push might not be called if there are no active subscriptions
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Message added to conversation',
        expect.objectContaining({
          conversationId,
          messageId: testMessage.id,
          role: testMessage.role
        })
      );

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'conversation_manager.messages_added',
        1,
        expect.objectContaining({
          role: testMessage.role.toString()
        })
      );
    });

    it('should broadcast message to subscribers', async () => {
      const conversationId = 'test-conv-broadcast';
      
      // First create a subscription to ensure broadcasting happens
      await conversationManager.subscribeToConversation(conversationId);

      await conversationManager.addMessage(conversationId, testMessage);

      // Check that ref was called with the messages path
      expect(mockRealtimeDB.ref).toHaveBeenCalledWith(
        expect.stringContaining(`conversations/${conversationId}/messages`)
      );
      expect(mockRealtimeDB.push).toHaveBeenCalled();
    });
  });

  describe('getMessages', () => {
    it('should retrieve messages with default pagination', async () => {
      const conversationId = 'test-conv-messages';
      
      // Mock conversation with multiple messages
      const mockMessages = Array.from({ length: 10 }, (_, i) => ({
        id: `msg-${i}`,
        role: MessageRole.USER,
        content: `Message ${i}`,
        timestamp: new Date()
      }));

      mockFirestore.get.mockResolvedValueOnce({
        exists: true,
        data: jest.fn().mockReturnValue({
          conversationId,
          messageHistory: mockMessages
        })
      });

      const messages = await conversationManager.getMessages(conversationId);

      expect(messages).toHaveLength(10);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Messages retrieved',
        expect.objectContaining({
          conversationId,
          messageCount: 10,
          limit: 50,
          offset: 0
        })
      );
    });

    it('should handle pagination correctly', async () => {
      const conversationId = 'test-conv-pagination';
      const limit = 5;
      const offset = 2;

      const mockMessages = Array.from({ length: 20 }, (_, i) => ({
        id: `msg-${i}`,
        role: MessageRole.USER,
        content: `Message ${i}`,
        timestamp: new Date()
      }));

      mockFirestore.get.mockResolvedValueOnce({
        exists: true,
        data: jest.fn().mockReturnValue({
          conversationId,
          messageHistory: mockMessages
        })
      });

      const messages = await conversationManager.getMessages(conversationId, limit, offset);

      expect(messages).toHaveLength(5);
    });
  });

  describe('buildContextForRequest', () => {
    it('should build context string within token limit', async () => {
      const conversationId = 'test-conv-context';
      const maxTokens = 1000;

      // Mock conversation with system prompt and messages
      mockFirestore.get.mockResolvedValueOnce({
        exists: true,
        data: jest.fn().mockReturnValue({
          conversationId,
          systemPrompt: 'You are a helpful assistant',
          messageHistory: [
            {
              id: 'msg-1',
              role: MessageRole.USER,
              content: 'Hello',
              timestamp: new Date()
            },
            {
              id: 'msg-2',
              role: MessageRole.ASSISTANT,
              content: 'Hi there! How can I help you?',
              timestamp: new Date()
            }
          ]
        })
      });

      const contextString = await conversationManager.buildContextForRequest(conversationId, maxTokens);

      expect(contextString).toBeDefined();
      expect(contextString).toContain('System: You are a helpful assistant');
      expect(contextString).toContain('User: Hello');
      expect(contextString).toContain('Assistant: Hi there! How can I help you?');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Context built for request',
        expect.objectContaining({
          conversationId,
          maxTokens
        })
      );
    });

    it('should handle empty conversation', async () => {
      const conversationId = 'test-conv-empty';

      mockFirestore.get.mockResolvedValueOnce({
        exists: true,
        data: jest.fn().mockReturnValue({
          conversationId,
          systemPrompt: 'You are a helpful assistant',
          messageHistory: []
        })
      });

      const contextString = await conversationManager.buildContextForRequest(conversationId);

      expect(contextString).toBe('System: You are a helpful assistant');
    });
  });

  describe('summarizeConversation', () => {
    it('should generate conversation summary', async () => {
      const conversationId = 'test-conv-summary';

      const mockMessages = [
        {
          id: 'msg-1',
          role: MessageRole.USER,
          content: 'I need help with JavaScript',
          timestamp: new Date(Date.now() - 60000)
        },
        {
          id: 'msg-2',
          role: MessageRole.ASSISTANT,
          content: 'I can help you with JavaScript. What specific topic?',
          timestamp: new Date()
        }
      ];

      mockFirestore.get.mockResolvedValueOnce({
        exists: true,
        data: jest.fn().mockReturnValue({
          conversationId,
          messageHistory: mockMessages,
          userId: 'test-user-1'
        })
      });

      const summary = await conversationManager.summarizeConversation(conversationId);

      expect(summary).toBeDefined();
      expect(summary.conversationId).toBe(conversationId);
      expect(summary.messageCount).toBe(2);
      expect(summary.summary).toBeDefined();
      expect(summary.keyTopics).toBeInstanceOf(Array);
      expect(summary.sentiment).toBeDefined();
      expect(summary.timespan.start).toBeInstanceOf(Date);
      expect(summary.timespan.end).toBeInstanceOf(Date);
      expect(summary.timespan.duration).toBeGreaterThan(0);
    });

    it('should throw error for empty conversation', async () => {
      const conversationId = 'test-conv-empty-summary';

      mockFirestore.get.mockResolvedValueOnce({
        exists: true,
        data: jest.fn().mockReturnValue({
          conversationId,
          messageHistory: []
        })
      });

      await expect(conversationManager.summarizeConversation(conversationId))
        .rejects.toThrow('Cannot summarize empty conversation');
    });
  });

  describe('compressContext', () => {
    it('should return original context if within target size', async () => {
      const context: ConversationContext = {
        conversationId: 'test-conv-compress',
        userId: 'test-user-1',
        messageHistory: [
          {
            id: 'msg-1',
            role: MessageRole.USER,
            content: 'Short message',
            timestamp: new Date()
          }
        ],
        systemPrompt: 'You are helpful',
        variables: {}
      };

      const targetSize = 1000;
      const compressedContext = await conversationManager.compressContext(context, targetSize);

      expect(compressedContext).toEqual(context);
    });

    it('should compress context when exceeding target size', async () => {
      const longMessages = Array.from({ length: 20 }, (_, i) => ({
        id: `msg-${i}`,
        role: MessageRole.USER,
        content: `This is a very long message number ${i} that contains a lot of text to exceed the target size`,
        timestamp: new Date()
      }));

      const context: ConversationContext = {
        conversationId: 'test-conv-compress-long',
        userId: 'test-user-1',
        messageHistory: longMessages,
        systemPrompt: 'You are helpful',
        variables: {}
      };

      const targetSize = 500; // Small target to force compression
      const compressedContext = await conversationManager.compressContext(context, targetSize);

      expect(compressedContext.messageHistory.length).toBeLessThan(context.messageHistory.length);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Context compressed',
        expect.objectContaining({
          conversationId: context.conversationId
        })
      );
    });
  });

  describe('memory management', () => {
    it('should configure memory for conversation', async () => {
      const conversationId = 'test-conv-memory';
      const memoryConfig: MemoryConfig = {
        type: MemoryType.SUMMARY,
        maxTokens: 2000,
        summaryThreshold: 1000,
        persistenceEnabled: true
      };

      await conversationManager.configureMemory(conversationId, memoryConfig);

      expect(mockFirestore.collection).toHaveBeenCalledWith('conversation_memory_configs');
      expect(mockFirestore.doc).toHaveBeenCalledWith(conversationId);
      expect(mockFirestore.set).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MemoryType.SUMMARY,
          maxTokens: 2000
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Memory configuration updated',
        expect.objectContaining({
          conversationId,
          memoryType: MemoryType.SUMMARY
        })
      );
    });

    it('should return default memory config for non-existent config', async () => {
      const conversationId = 'test-conv-default-memory';

      mockFirestore.get.mockResolvedValueOnce({
        exists: false
      });

      const memoryConfig = await conversationManager.getMemoryConfig(conversationId);

      expect(memoryConfig).toBeDefined();
      expect(memoryConfig.type).toBe(MemoryType.BUFFER);
      expect(memoryConfig.maxTokens).toBe(4000);
      expect(memoryConfig.persistenceEnabled).toBe(true);
    });
  });

  describe('real-time synchronization', () => {
    it('should create conversation subscription', async () => {
      const conversationId = 'test-conv-subscription';

      const subscription = await conversationManager.subscribeToConversation(conversationId);

      expect(subscription).toBeDefined();
      expect(subscription.subscriptionId).toBeDefined();
      expect(subscription.conversationId).toBe(conversationId);
      expect(subscription.websocketUrl).toContain(conversationId);
      expect(subscription.events).toContain('message_added');
      expect(subscription.expiresAt).toBeInstanceOf(Date);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Conversation subscription created',
        expect.objectContaining({
          conversationId
        })
      );
    });

    it('should sync conversation state', async () => {
      const conversationId = 'test-conv-sync';

      await conversationManager.syncConversationState(conversationId);

      expect(mockRealtimeDB.ref).toHaveBeenCalledWith(
        `conversations/${conversationId}/state`
      );
      expect(mockRealtimeDB.update).toHaveBeenCalled();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Conversation state synchronized',
        expect.objectContaining({
          conversationId
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle Firestore errors gracefully', async () => {
      const error = new Error('Firestore connection failed');
      mockFirestore.get.mockRejectedValueOnce(error);

      await expect(conversationManager.getConversation('test-conv-error'))
        .rejects.toThrow('Firestore connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get conversation',
        expect.objectContaining({
          conversationId: 'test-conv-error',
          error
        })
      );
    });

    it('should handle Realtime Database errors gracefully', async () => {
      const error = new Error('Realtime DB connection failed');
      mockRealtimeDB.set.mockRejectedValueOnce(error);

      await expect(conversationManager.createConversation('test-user-error'))
        .rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle message broadcasting failures', async () => {
      const error = new Error('Broadcast failed');
      const conversationId = 'test-conv-broadcast-error';
      
      // Create a subscription to ensure broadcasting is attempted
      await conversationManager.subscribeToConversation(conversationId);
      
      // Mock push to fail
      mockRealtimeDB.push.mockRejectedValueOnce(error);

      const testMessage: ConversationMessage = {
        id: 'msg-error',
        role: MessageRole.USER,
        content: 'Test message',
        timestamp: new Date()
      };

      // Should not throw, but handle gracefully
      await conversationManager.addMessage(conversationId, testMessage);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to broadcast message',
        expect.objectContaining({
          conversationId: conversationId,
          messageId: testMessage.id
        })
      );
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation from both Firestore and Realtime DB', async () => {
      const conversationId = 'test-conv-delete';

      await conversationManager.deleteConversation(conversationId);

      expect(mockFirestore.collection).toHaveBeenCalledWith('conversations');
      expect(mockFirestore.doc).toHaveBeenCalledWith(conversationId);
      expect(mockFirestore.delete).toHaveBeenCalled();

      expect(mockRealtimeDB.ref).toHaveBeenCalledWith(`conversations/${conversationId}`);
      expect(mockRealtimeDB.remove).toHaveBeenCalled();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Conversation deleted',
        expect.objectContaining({
          conversationId
        })
      );

      expect(mockMetrics.increment).toHaveBeenCalledWith('conversation_manager.conversations_deleted');
    });
  });
});