/**
 * AI Credit Service Unit Tests
 * Tests for AI-specific credit management functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AICreditService, AIInteractionRequest } from '../../../../src/features/credit-system/services/ai-credit-service';
import { IMetricsCollector } from '../../../../src/shared/observability/metrics';
import { 
  CreditBalance,
  CreditTransaction,
  TransactionType,
  CreditSource,
  AccountStatus,
  BalanceHealthStatus,
  LowBalanceAlert,
  AlertLevel
} from '../../../../src/shared/types/credit-system';
import { TaskType } from '../../../../src/shared/types/ai-assistant';

// Mock Firebase Admin
jest.mock('firebase-admin/firestore');
jest.mock('firebase-admin/database');

// Mock dependencies
const mockMetrics: IMetricsCollector = {
  increment: jest.fn(),
  histogram: jest.fn(),
  gauge: jest.fn()
};

const mockFirestore = {
  collection: jest.fn(),
  runTransaction: jest.fn()
};

const mockDatabase = {
  ref: jest.fn()
};

// Mock Firestore methods
const mockDoc = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn()
};

const mockCollection = {
  doc: jest.fn(() => mockDoc),
  where: jest.fn(() => ({
    get: jest.fn(),
    limit: jest.fn(() => ({
      get: jest.fn()
    }))
  })),
  get: jest.fn()
};

mockFirestore.collection.mockReturnValue(mockCollection);

// Mock Realtime Database methods
const mockRef = {
  set: jest.fn(),
  once: jest.fn(),
  on: jest.fn(),
  off: jest.fn()
};

mockDatabase.ref.mockReturnValue(mockRef);

describe('AICreditService', () => {
  let aiCreditService: AICreditService;
  let mockLedgerService: any;
  let mockBalanceSyncService: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock ledger service
    mockLedgerService = {
      recordTransaction: jest.fn().mockResolvedValue({
        id: 'ledger-entry-123',
        transactionHash: 'hash123',
        blockIndex: 1
      })
    };

    // Mock balance sync service
    mockBalanceSyncService = {
      subscribeToBalanceChanges: jest.fn().mockResolvedValue(() => {}),
      broadcastBalanceUpdate: jest.fn().mockResolvedValue(undefined)
    };

    // Create service instance
    aiCreditService = new AICreditService(mockMetrics, {
      ledgerService: mockLedgerService,
      balanceSyncService: mockBalanceSyncService
    });

    // Mock getFirestore and getDatabase
    (aiCreditService as any).firestore = mockFirestore;
    (aiCreditService as any).database = mockDatabase;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('deductCreditsForAIInteraction', () => {
    const mockUserId = 'user-123';
    const mockRequest: AIInteractionRequest = {
      conversationId: 'conv-123',
      messageLength: 100,
      aiModel: 'gpt-4',
      taskType: TaskType.QUICK_CHAT,
      estimatedCost: 25,
      inputTokens: 50,
      outputTokens: 75
    };

    const mockBalance: CreditBalance = {
      userId: mockUserId,
      currentBalance: 1000,
      reservedCredits: 0,
      availableBalance: 1000,
      lastUpdated: new Date(),
      accountStatus: AccountStatus.ACTIVE,
      lifetimeCreditsEarned: 1000,
      lifetimeCreditsSpent: 0,
      version: 1,
      lastEventId: 'event-123',
      syncVersion: 1,
      lastSyncTimestamp: new Date(),
      pendingOperations: [],
      lastVerifiedBalance: 1000,
      lastVerificationTimestamp: new Date(),
      verificationHash: 'hash123',
      healthStatus: BalanceHealthStatus.HEALTHY,
      lastHealthCheck: new Date()
    };

    it('should successfully deduct credits for AI interaction', async () => {
      // Mock balance retrieval
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockBalance
      });

      // Mock transaction creation
      const mockTransaction: CreditTransaction = {
        id: 'trans-123',
        userId: mockUserId,
        type: TransactionType.CREDIT_DEDUCTION,
        amount: -25,
        balanceBefore: 1000,
        balanceAfter: 975,
        status: 'completed' as any,
        source: CreditSource.AI_USAGE,
        reason: 'AI quick_chat interaction',
        metadata: {
          conversationId: mockRequest.conversationId,
          messageLength: mockRequest.messageLength,
          aiModel: mockRequest.aiModel,
          taskType: mockRequest.taskType,
          inputTokens: mockRequest.inputTokens,
          outputTokens: mockRequest.outputTokens,
          featureId: 'ai-assistant'
        },
        timestamp: new Date(),
        eventId: 'trans-123',
        version: 1,
        transactionHash: '',
        previousTransactionHash: '',
        signature: '',
        blockIndex: 0,
        correlationId: expect.any(String),
        idempotencyKey: expect.any(String),
        processingDuration: 0,
        retryCount: 0
      };

      // Mock Firestore transaction
      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        await callback({
          update: jest.fn(),
          set: jest.fn()
        });
      });

      // Mock AI interaction tracking
      mockDoc.set.mockResolvedValue(undefined);

      const result = await aiCreditService.deductCreditsForAIInteraction(mockUserId, mockRequest);

      expect(result).toMatchObject({
        userId: mockUserId,
        type: TransactionType.CREDIT_DEDUCTION,
        amount: -25,
        balanceBefore: 1000,
        balanceAfter: 975,
        source: CreditSource.AI_USAGE
      });

      expect(mockLedgerService.recordTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          amount: -25,
          type: TransactionType.CREDIT_DEDUCTION
        })
      );

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'ai.credits.deducted',
        1,
        expect.objectContaining({
          task_type: TaskType.QUICK_CHAT,
          model: 'gpt-4'
        })
      );
    });

    it('should throw error for insufficient credits', async () => {
      const insufficientBalance = {
        ...mockBalance,
        currentBalance: 10,
        availableBalance: 10
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => insufficientBalance
      });

      await expect(
        aiCreditService.deductCreditsForAIInteraction(mockUserId, mockRequest)
      ).rejects.toThrow('Insufficient credits for AI interaction');

      expect(mockLedgerService.recordTransaction).not.toHaveBeenCalled();
    });

    it('should handle AI interaction tracking failure gracefully', async () => {
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockBalance
      });

      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        await callback({
          update: jest.fn(),
          set: jest.fn()
        });
      });

      // Mock AI interaction tracking failure
      mockDoc.set.mockRejectedValueOnce(new Error('Tracking failed'));

      const result = await aiCreditService.deductCreditsForAIInteraction(mockUserId, mockRequest);

      // Should still succeed even if tracking fails
      expect(result).toMatchObject({
        userId: mockUserId,
        type: TransactionType.CREDIT_DEDUCTION
      });
    });
  });

  describe('estimateAIInteractionCost', () => {
    it('should estimate cost for quick chat', async () => {
      const request = {
        taskType: TaskType.QUICK_CHAT,
        messageLength: 100,
        aiModel: 'gpt-4'
      };

      // Mock model cost multiplier
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ pricing: { costMultiplier: 1.5 } })
      });

      const cost = await aiCreditService.estimateAIInteractionCost(request);

      expect(cost).toBeGreaterThan(0);
      expect(typeof cost).toBe('number');
    });

    it('should estimate cost for image generation', async () => {
      const request = {
        taskType: TaskType.IMAGE_GENERATION,
        imageCount: 2,
        aiModel: 'dall-e-3'
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ pricing: { costMultiplier: 2.0 } })
      });

      const cost = await aiCreditService.estimateAIInteractionCost(request);

      expect(cost).toBeGreaterThan(50); // Base image cost is 50 per image
    });

    it('should handle token-based cost calculation', async () => {
      const request = {
        taskType: TaskType.QUICK_CHAT,
        inputTokens: 1000,
        outputTokens: 500,
        aiModel: 'gpt-4'
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ pricing: { costMultiplier: 1.0 } })
      });

      const cost = await aiCreditService.estimateAIInteractionCost(request);

      expect(cost).toBeGreaterThan(0);
    });
  });

  describe('grantWelcomeBonus', () => {
    const mockUserId = 'new-user-123';
    const mockUserData = {
      email: 'test@example.com',
      welcomeBonusGranted: false
    };

    it('should grant welcome bonus to eligible user', async () => {
      // Mock user data retrieval
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockUserData
      });

      // Mock eligibility check (no previous grants)
      mockCollection.where.mockReturnValueOnce({
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] })
      });

      // Mock transaction creation
      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        await callback({
          set: jest.fn()
        });
      });

      // Mock user update
      mockDoc.update.mockResolvedValue(undefined);
      mockDoc.set.mockResolvedValue(undefined);

      const result = await aiCreditService.grantWelcomeBonus(mockUserId, 'device-123');

      expect(result).toMatchObject({
        userId: mockUserId,
        type: TransactionType.WELCOME_BONUS,
        amount: 1000,
        source: CreditSource.WELCOME_BONUS
      });

      expect(mockLedgerService.recordTransaction).toHaveBeenCalled();
      expect(mockMetrics.increment).toHaveBeenCalledWith('ai.welcome_bonus.granted', 1);
    });

    it('should reject welcome bonus for ineligible user', async () => {
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({ ...mockUserData, welcomeBonusGranted: true })
      });

      await expect(
        aiCreditService.grantWelcomeBonus(mockUserId)
      ).rejects.toThrow('User not eligible for welcome bonus');
    });

    it('should reject welcome bonus for duplicate device fingerprint', async () => {
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockUserData
      });

      // Mock existing device fingerprint
      mockCollection.where.mockReturnValueOnce({
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{ data: () => ({ deviceFingerprint: 'device-123' }) }]
        })
      });

      await expect(
        aiCreditService.grantWelcomeBonus(mockUserId, 'device-123')
      ).rejects.toThrow('User not eligible for welcome bonus');
    });
  });

  describe('checkLowBalanceThreshold', () => {
    const mockUserId = 'user-123';

    it('should return urgent alert for very low balance', async () => {
      const lowBalance: CreditBalance = {
        userId: mockUserId,
        currentBalance: 5,
        reservedCredits: 0,
        availableBalance: 5,
        lastUpdated: new Date(),
        accountStatus: AccountStatus.ACTIVE,
        lifetimeCreditsEarned: 1000,
        lifetimeCreditsSpent: 995,
        version: 1,
        lastEventId: 'event-123',
        syncVersion: 1,
        lastSyncTimestamp: new Date(),
        pendingOperations: [],
        lastVerifiedBalance: 5,
        lastVerificationTimestamp: new Date(),
        verificationHash: 'hash123',
        healthStatus: BalanceHealthStatus.WARNING,
        lastHealthCheck: new Date()
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => lowBalance
      });

      // Mock usage calculation for estimated days
      mockCollection.where.mockReturnValueOnce({
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [
            { data: () => ({ amount: -10, timestamp: new Date() }) },
            { data: () => ({ amount: -15, timestamp: new Date() }) }
          ]
        })
      });

      const alert = await aiCreditService.checkLowBalanceThreshold(mockUserId);

      expect(alert).toMatchObject({
        userId: mockUserId,
        currentBalance: 5,
        threshold: 10,
        alertLevel: AlertLevel.URGENT
      });

      expect(alert?.message).toContain('Critical');
      expect(alert?.estimatedDaysRemaining).toBeGreaterThanOrEqual(0);
    });

    it('should return warning alert for moderate balance', async () => {
      const moderateBalance: CreditBalance = {
        userId: mockUserId,
        currentBalance: 75,
        reservedCredits: 0,
        availableBalance: 75,
        lastUpdated: new Date(),
        accountStatus: AccountStatus.ACTIVE,
        lifetimeCreditsEarned: 1000,
        lifetimeCreditsSpent: 925,
        version: 1,
        lastEventId: 'event-123',
        syncVersion: 1,
        lastSyncTimestamp: new Date(),
        pendingOperations: [],
        lastVerifiedBalance: 75,
        lastVerificationTimestamp: new Date(),
        verificationHash: 'hash123',
        healthStatus: BalanceHealthStatus.WARNING,
        lastHealthCheck: new Date()
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => moderateBalance
      });

      const alert = await aiCreditService.checkLowBalanceThreshold(mockUserId);

      expect(alert).toMatchObject({
        userId: mockUserId,
        currentBalance: 75,
        threshold: 100,
        alertLevel: AlertLevel.WARNING
      });
    });

    it('should return null for healthy balance', async () => {
      const healthyBalance: CreditBalance = {
        userId: mockUserId,
        currentBalance: 500,
        reservedCredits: 0,
        availableBalance: 500,
        lastUpdated: new Date(),
        accountStatus: AccountStatus.ACTIVE,
        lifetimeCreditsEarned: 1000,
        lifetimeCreditsSpent: 500,
        version: 1,
        lastEventId: 'event-123',
        syncVersion: 1,
        lastSyncTimestamp: new Date(),
        pendingOperations: [],
        lastVerifiedBalance: 500,
        lastVerificationTimestamp: new Date(),
        verificationHash: 'hash123',
        healthStatus: BalanceHealthStatus.HEALTHY,
        lastHealthCheck: new Date()
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => healthyBalance
      });

      const alert = await aiCreditService.checkLowBalanceThreshold(mockUserId);

      expect(alert).toBeNull();
    });
  });

  describe('getAIUsageAnalytics', () => {
    const mockUserId = 'user-123';
    const mockTimeRange = {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
      granularity: 'day' as any
    };

    it('should return comprehensive AI usage analytics', async () => {
      // Mock AI transactions
      const mockTransactions = [
        {
          id: 'trans-1',
          userId: mockUserId,
          amount: -25,
          timestamp: new Date('2024-01-15'),
          metadata: {
            taskType: TaskType.QUICK_CHAT,
            aiModel: 'gpt-4',
            inputTokens: 100,
            outputTokens: 150,
            conversationId: 'conv-1'
          }
        },
        {
          id: 'trans-2',
          userId: mockUserId,
          amount: -50,
          timestamp: new Date('2024-01-16'),
          metadata: {
            taskType: TaskType.IMAGE_GENERATION,
            aiModel: 'dall-e-3',
            conversationId: 'conv-2'
          }
        }
      ];

      mockCollection.where.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          docs: mockTransactions.map(t => ({ data: () => t }))
        })
      });

      // Mock base analytics (would normally come from parent class)
      const mockBaseAnalytics = {
        userId: mockUserId,
        timeRange: mockTimeRange,
        totalCreditsUsed: 75,
        totalCreditsAdded: 0,
        netCreditsChange: -75,
        usageByFeature: [],
        usageByDay: [],
        usageByModel: [],
        averageDailyUsage: 2.5,
        peakUsageDay: new Date('2024-01-16'),
        mostUsedFeature: 'ai-assistant',
        projectedMonthlyUsage: 75,
        recommendedTopUpAmount: 500
      };

      // Mock the parent method
      jest.spyOn(aiCreditService, 'getUserUsageAnalytics').mockResolvedValue(mockBaseAnalytics);

      const analytics = await aiCreditService.getAIUsageAnalytics(mockUserId, mockTimeRange);

      expect(analytics).toMatchObject({
        ...mockBaseAnalytics,
        totalAIInteractions: 2,
        averageCreditsPerInteraction: 37.5,
        mostUsedModel: expect.any(String)
      });

      expect(analytics.taskTypeBreakdown).toHaveLength(2);
      expect(analytics.modelEfficiencyMetrics).toHaveLength(2);
      expect(analytics.conversationMetrics).toMatchObject({
        totalConversations: 2,
        averageMessagesPerConversation: 1,
        averageCreditsPerConversation: 37.5
      });
    });

    it('should handle empty transaction history', async () => {
      mockCollection.where.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: [] })
      });

      const mockBaseAnalytics = {
        userId: mockUserId,
        timeRange: mockTimeRange,
        totalCreditsUsed: 0,
        totalCreditsAdded: 0,
        netCreditsChange: 0,
        usageByFeature: [],
        usageByDay: [],
        usageByModel: [],
        averageDailyUsage: 0,
        peakUsageDay: new Date(),
        mostUsedFeature: 'none',
        projectedMonthlyUsage: 0,
        recommendedTopUpAmount: 500
      };

      jest.spyOn(aiCreditService, 'getUserUsageAnalytics').mockResolvedValue(mockBaseAnalytics);

      const analytics = await aiCreditService.getAIUsageAnalytics(mockUserId, mockTimeRange);

      expect(analytics.totalAIInteractions).toBe(0);
      expect(analytics.averageCreditsPerInteraction).toBe(0);
      expect(analytics.mostUsedModel).toBe('none');
      expect(analytics.taskTypeBreakdown).toHaveLength(0);
    });
  });

  describe('subscribeToBalanceUpdates', () => {
    it('should delegate to balance sync service', async () => {
      const mockUserId = 'user-123';
      const mockCallback = jest.fn();
      const mockUnsubscribe = jest.fn();

      mockBalanceSyncService.subscribeToBalanceChanges.mockResolvedValue(mockUnsubscribe);

      const unsubscribe = await aiCreditService.subscribeToBalanceUpdates(mockUserId, mockCallback);

      expect(mockBalanceSyncService.subscribeToBalanceChanges).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Function)
      );
      expect(unsubscribe).toBe(mockUnsubscribe);
    });
  });

  describe('broadcastBalanceUpdate', () => {
    it('should delegate to balance sync service', async () => {
      const mockUserId = 'user-123';
      const mockBalance: CreditBalance = {
        userId: mockUserId,
        currentBalance: 500,
        reservedCredits: 0,
        availableBalance: 500,
        lastUpdated: new Date(),
        accountStatus: AccountStatus.ACTIVE,
        lifetimeCreditsEarned: 1000,
        lifetimeCreditsSpent: 500,
        version: 1,
        lastEventId: 'event-123',
        syncVersion: 1,
        lastSyncTimestamp: new Date(),
        pendingOperations: [],
        lastVerifiedBalance: 500,
        lastVerificationTimestamp: new Date(),
        verificationHash: 'hash123',
        healthStatus: BalanceHealthStatus.HEALTHY,
        lastHealthCheck: new Date()
      };

      await aiCreditService.broadcastBalanceUpdate(mockUserId, mockBalance);

      expect(mockBalanceSyncService.broadcastBalanceUpdate).toHaveBeenCalledWith(mockUserId, mockBalance);
    });
  });

  describe('error handling', () => {
    it('should handle Firestore errors gracefully', async () => {
      const mockUserId = 'user-123';
      const mockRequest: AIInteractionRequest = {
        conversationId: 'conv-123',
        messageLength: 100,
        aiModel: 'gpt-4',
        taskType: TaskType.QUICK_CHAT,
        estimatedCost: 25
      };

      mockDoc.get.mockRejectedValue(new Error('Firestore error'));

      await expect(
        aiCreditService.deductCreditsForAIInteraction(mockUserId, mockRequest)
      ).rejects.toThrow('Firestore error');

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'ai.credits.deduction_errors',
        1,
        expect.objectContaining({
          error_type: 'unknown_error'
        })
      );
    });

    it('should categorize errors correctly', async () => {
      const mockUserId = 'user-123';
      const mockRequest: AIInteractionRequest = {
        conversationId: 'conv-123',
        messageLength: 100,
        aiModel: 'gpt-4',
        taskType: TaskType.QUICK_CHAT,
        estimatedCost: 25
      };

      mockDoc.get.mockRejectedValue(new Error('insufficient credits'));

      await expect(
        aiCreditService.deductCreditsForAIInteraction(mockUserId, mockRequest)
      ).rejects.toThrow('insufficient credits');

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'ai.credits.deduction_errors',
        1,
        expect.objectContaining({
          error_type: 'insufficient_credits'
        })
      );
    });
  });
});