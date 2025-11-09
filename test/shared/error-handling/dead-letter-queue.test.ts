/**
 * Dead Letter Queue Tests
 */

import {
  DeadLetterQueueManager,
  DLQStatus,
  DLQPriority,
  DLQRecoveryMethod,
  DLQRecoveryHandler,
  DLQRecoveryResult
} from '../../../src/shared/error-handling/dead-letter-queue';
import { CategorizedError, ErrorSeverity, ErrorCategory } from '../../../src/shared/error-handling/error-categories';

// Mock Firebase dependencies
const mockRealtimeDB = {
  ref: jest.fn().mockReturnThis(),
  set: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
  once: jest.fn().mockResolvedValue({ val: () => null }),
  orderByChild: jest.fn().mockReturnThis(),
  equalTo: jest.fn().mockReturnThis(),
  transaction: jest.fn()
};

const mockFirestore = {
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  set: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
  update: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  batch: jest.fn().mockReturnValue({
    delete: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined)
  })
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

const mockMetrics = {
  increment: jest.fn(),
  histogram: jest.fn(),
  gauge: jest.fn()
};

describe('Dead Letter Queue Manager', () => {
  let dlqManager: DeadLetterQueueManager;
  let mockError: CategorizedError;

  beforeEach(() => {
    jest.clearAllMocks();
    
    dlqManager = new DeadLetterQueueManager({
      realtimeDB: mockRealtimeDB as any,
      firestore: mockFirestore as any,
      logger: mockLogger as any,
      metrics: mockMetrics as any
    });

    mockError = {
      id: 'error-123',
      name: 'TestError',
      message: 'Test error message',
      code: 'TEST_ERROR',
      category: ErrorCategory.SYSTEM_FAILURE,
      severity: ErrorSeverity.MEDIUM,
      timestamp: new Date(),
      retryable: true,
      recoveryStrategy: 'retry' as any,
      context: {},
      tags: [],
      isOperational: true,
      requiresAlert: false,
      requiresEscalation: false
    };
  });

  afterEach(() => {
    // Clean up the DLQ manager to prevent open handles
    if (dlqManager && typeof (dlqManager as any).stop === 'function') {
      (dlqManager as any).stop();
    }
  });

  describe('Adding Items to DLQ', () => {
    it('should add item to DLQ successfully', async () => {
      const dlqId = await dlqManager.addToDLQ(
        'operation-123',
        'credit_deduction',
        { userId: 'user-123', amount: 100 },
        mockError
      );

      expect(dlqId).toBeDefined();
      expect(dlqId).toMatch(/^dlq_/);
      
      expect(mockFirestore.collection).toHaveBeenCalledWith('dlq_items');
      expect(mockFirestore.doc).toHaveBeenCalledWith(dlqId);
      expect(mockFirestore.set).toHaveBeenCalled();
      
      expect(mockRealtimeDB.ref).toHaveBeenCalledWith(expect.stringContaining('dlq/pending'));
      expect(mockRealtimeDB.set).toHaveBeenCalled();
    });

    it('should determine correct priority based on error severity', async () => {
      const criticalError = { ...mockError, severity: ErrorSeverity.CRITICAL };
      
      const dlqId = await dlqManager.addToDLQ(
        'operation-123',
        'payment_processing',
        {},
        criticalError
      );

      expect(dlqId).toBeDefined();
      // Should use CRITICAL priority for critical errors and payment operations
    });

    it('should set manual intervention flag for security violations', async () => {
      const securityError = { 
        ...mockError, 
        category: ErrorCategory.SECURITY_VIOLATION,
        severity: ErrorSeverity.HIGH
      };
      
      const dlqId = await dlqManager.addToDLQ(
        'operation-123',
        'user_operation',
        {},
        securityError
      );

      expect(dlqId).toBeDefined();
      // Should require manual intervention for security violations
    });

    it('should handle DLQ addition errors gracefully', async () => {
      mockFirestore.set.mockRejectedValueOnce(new Error('Firestore error'));

      await expect(dlqManager.addToDLQ(
        'operation-123',
        'test_operation',
        {},
        mockError
      )).rejects.toThrow('Firestore error');
    });
  });

  describe('Processing DLQ Items', () => {
    beforeEach(() => {
      // Mock getting pending items
      mockFirestore.get.mockResolvedValue({
        docs: [
          {
            id: 'dlq-item-1',
            data: () => ({
              id: 'dlq-item-1',
              operationType: 'credit_deduction',
              status: DLQStatus.PENDING,
              createdAt: new Date().toISOString(),
              lastFailedAt: new Date().toISOString(),
              recoveryAttempts: [],
              manualInterventionRequired: false
            })
          }
        ]
      });
    });

    it('should process pending DLQ items', async () => {
      // Register a mock recovery handler
      const mockRecoveryHandler: DLQRecoveryHandler = {
        recover: jest.fn().mockResolvedValue({
          success: true,
          method: DLQRecoveryMethod.AUTOMATIC_RETRY,
          result: { recovered: true }
        })
      };

      dlqManager.registerRecoveryHandler('credit_deduction', mockRecoveryHandler);

      const results = await dlqManager.processDLQItems();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(mockRecoveryHandler.recover).toHaveBeenCalled();
    });

    it('should handle recovery handler failures', async () => {
      const mockRecoveryHandler: DLQRecoveryHandler = {
        recover: jest.fn().mockResolvedValue({
          success: false,
          method: DLQRecoveryMethod.AUTOMATIC_RETRY,
          error: mockError
        })
      };

      dlqManager.registerRecoveryHandler('credit_deduction', mockRecoveryHandler);

      const results = await dlqManager.processDLQItems();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
    });

    it('should skip items requiring manual intervention', async () => {
      mockFirestore.get.mockResolvedValue({
        docs: [
          {
            id: 'dlq-item-1',
            data: () => ({
              id: 'dlq-item-1',
              operationType: 'security_operation',
              status: DLQStatus.PENDING,
              createdAt: new Date().toISOString(),
              lastFailedAt: new Date().toISOString(),
              recoveryAttempts: [],
              manualInterventionRequired: true
            })
          }
        ]
      });

      const results = await dlqManager.processDLQItems();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].requiresEscalation).toBe(true);
    });

    it('should handle missing recovery handlers', async () => {
      // Don't register any recovery handler
      const results = await dlqManager.processDLQItems();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
    });

    it('should respect processing limits', async () => {
      // Mock multiple items
      mockFirestore.get.mockResolvedValue({
        docs: Array.from({ length: 20 }, (_, i) => ({
          id: `dlq-item-${i}`,
          data: () => ({
            id: `dlq-item-${i}`,
            operationType: 'test_operation',
            status: DLQStatus.PENDING,
            createdAt: new Date().toISOString(),
            lastFailedAt: new Date().toISOString(),
            recoveryAttempts: [],
            manualInterventionRequired: false
          })
        }))
      });

      const results = await dlqManager.processDLQItems(undefined, 5);

      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('DLQ Item Retrieval', () => {
    it('should get DLQ item by ID', async () => {
      const mockItemData = {
        id: 'dlq-item-1',
        operationType: 'test_operation',
        status: DLQStatus.PENDING,
        createdAt: new Date().toISOString(),
        lastFailedAt: new Date().toISOString(),
        recoveryAttempts: []
      };

      mockFirestore.get.mockResolvedValue({
        exists: true,
        data: () => mockItemData
      });

      const item = await dlqManager.getDLQItem('dlq-item-1');

      expect(item).toBeDefined();
      expect(item?.id).toBe('dlq-item-1');
      expect(item?.operationType).toBe('test_operation');
    });

    it('should return null for non-existent item', async () => {
      mockFirestore.get.mockResolvedValue({
        exists: false
      });

      const item = await dlqManager.getDLQItem('non-existent');

      expect(item).toBeNull();
    });

    it('should handle retrieval errors gracefully', async () => {
      mockFirestore.get.mockRejectedValue(new Error('Firestore error'));

      const item = await dlqManager.getDLQItem('dlq-item-1');

      expect(item).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Recovery Handler Management', () => {
    it('should register recovery handlers', () => {
      const mockHandler: DLQRecoveryHandler = {
        recover: jest.fn()
      };

      dlqManager.registerRecoveryHandler('test_operation', mockHandler);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered DLQ recovery handler',
        { operationType: 'test_operation' }
      );
    });

    it('should use registered recovery handlers during processing', async () => {
      const mockHandler: DLQRecoveryHandler = {
        recover: jest.fn().mockResolvedValue({
          success: true,
          method: DLQRecoveryMethod.AUTOMATIC_RETRY
        })
      };

      dlqManager.registerRecoveryHandler('credit_deduction', mockHandler);

      await dlqManager.processDLQItems();

      expect(mockHandler.recover).toHaveBeenCalled();
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should collect DLQ statistics', async () => {
      // Mock statistics data
      mockFirestore.get.mockResolvedValue({
        size: 10,
        forEach: jest.fn().mockImplementation((callback) => {
          // Mock some items with different statuses
          const items = [
            { data: () => ({ status: DLQStatus.PENDING, priority: DLQPriority.HIGH, operationType: 'credit_deduction', escalated: false, recoveryAttempts: [] }) },
            { data: () => ({ status: DLQStatus.RECOVERED, priority: DLQPriority.NORMAL, operationType: 'payment_processing', escalated: false, recoveryAttempts: [{ success: true, duration: 1000 }] }) },
            { data: () => ({ status: DLQStatus.FAILED, priority: DLQPriority.LOW, operationType: 'user_operation', escalated: true, recoveryAttempts: [] }) }
          ];
          
          items.forEach(callback);
        })
      });

      const stats = await dlqManager.getStats();

      expect(stats.totalItems).toBe(10);
      expect(stats.itemsByStatus).toBeDefined();
      expect(stats.itemsByPriority).toBeDefined();
      expect(stats.itemsByOperationType).toBeDefined();
      expect(stats.recoveryRate).toBeGreaterThanOrEqual(0);
      expect(stats.escalationRate).toBeGreaterThanOrEqual(0);
    });

    it('should calculate recovery metrics correctly', async () => {
      mockFirestore.get.mockResolvedValue({
        size: 3,
        forEach: jest.fn().mockImplementation((callback) => {
          const items = [
            { 
              data: () => ({ 
                status: DLQStatus.RECOVERED, 
                recoveryAttempts: [{ success: true, duration: 1000 }],
                escalated: false
              }) 
            },
            { 
              data: () => ({ 
                status: DLQStatus.RECOVERED, 
                recoveryAttempts: [{ success: true, duration: 2000 }],
                escalated: false
              }) 
            },
            { 
              data: () => ({ 
                status: DLQStatus.FAILED, 
                recoveryAttempts: [],
                escalated: true
              }) 
            }
          ];
          
          items.forEach(callback);
        })
      });

      const stats = await dlqManager.getStats();

      expect(stats.recoveryRate).toBeCloseTo(0.67, 1); // 2/3 recovered
      expect(stats.escalationRate).toBeCloseTo(0.33, 1); // 1/3 escalated
      expect(stats.averageRecoveryTime).toBe(1500); // (1000 + 2000) / 2
    });
  });

  describe('Cleanup Operations', () => {
    it('should cleanup old DLQ items', async () => {
      const mockBatch = {
        delete: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined)
      };

      mockFirestore.batch.mockReturnValue(mockBatch);
      
      mockFirestore.get.mockResolvedValue({
        size: 5,
        forEach: jest.fn().mockImplementation((callback) => {
          // Mock 5 old items
          for (let i = 0; i < 5; i++) {
            callback({ ref: `ref-${i}` });
          }
        })
      });

      const cleanedCount = await dlqManager.cleanup(30);

      expect(cleanedCount).toBe(5);
      expect(mockBatch.delete).toHaveBeenCalledTimes(5);
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      mockFirestore.get.mockRejectedValue(new Error('Cleanup error'));

      await expect(dlqManager.cleanup()).rejects.toThrow('Cleanup error');
    });
  });

  describe('Resource Management', () => {
    it('should cleanup resources on stop', () => {
      // Mock internal timers
      const mockTimer = setTimeout(() => {}, 1000);
      (dlqManager as any).processingInterval = mockTimer;

      dlqManager.stop();

      expect(mockLogger.info).toHaveBeenCalledWith('Stopped DLQ manager');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle concurrent processing gracefully', async () => {
      // Start processing
      const promise1 = dlqManager.processDLQItems();
      
      // Try to start another processing (should be ignored)
      const promise2 = dlqManager.processDLQItems();

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Second call should return empty array due to concurrent processing check
      expect(result2).toEqual([]);
    });

    it('should handle Firestore connection errors', async () => {
      mockFirestore.collection.mockImplementation(() => {
        throw new Error('Firestore connection error');
      });

      await expect(dlqManager.addToDLQ(
        'operation-123',
        'test_operation',
        {},
        mockError
      )).rejects.toThrow('Firestore connection error');
    });

    it('should handle Realtime Database errors', async () => {
      mockRealtimeDB.ref.mockImplementation(() => {
        throw new Error('RTDB connection error');
      });

      await expect(dlqManager.addToDLQ(
        'operation-123',
        'test_operation',
        {},
        mockError
      )).rejects.toThrow();
    });
  });
});