/**
 * Unit Tests for Operation Queue
 * Tests operation queuing, retry mechanisms, and failure recovery
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  OperationQueue,
  OperationType,
  OperationPriority,
  OperationStatus
} from '../../../src/shared/orchestration/operation-queue';
import { ExecutionStatus, ErrorSeverity } from '../../../src/shared/types/orchestration';

// Mock dependencies
const mockRealtimeDB = {
  ref: jest.fn(() => ({
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    once: jest.fn().mockResolvedValue({ val: () => ({}) })
  }))
};

const mockFirestore = {
  collection: jest.fn(() => ({
    doc: jest.fn(() => ({
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue({ 
        exists: true, 
        data: () => ({
          id: 'op123',
          type: OperationType.CREDIT_DEDUCTION,
          status: OperationStatus.QUEUED,
          createdAt: new Date().toISOString(),
          scheduledAt: new Date().toISOString(),
          attemptCount: 0,
          errors: []
        })
      }),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined)
    })),
    where: jest.fn(() => ({
      get: jest.fn().mockResolvedValue({ docs: [] })
    }))
  }))
};

const mockEventBus = {
  publish: jest.fn().mockResolvedValue({
    eventId: 'event123',
    status: 'success',
    publishedAt: new Date(),
    subscribersNotified: 1
  })
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

const mockMetrics = {
  counter: jest.fn(),
  histogram: jest.fn(),
  gauge: jest.fn()
};

describe('OperationQueue', () => {
  let operationQueue: OperationQueue;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    operationQueue = new OperationQueue({
      realtimeDB: mockRealtimeDB as any,
      firestore: mockFirestore as any,
      eventBus: mockEventBus as any,
      logger: mockLogger as any,
      metrics: mockMetrics as any
    });
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Operation Enqueuing', () => {
    it('should enqueue operation successfully', async () => {
      // Arrange
      const operation = {
        type: OperationType.CREDIT_DEDUCTION,
        payload: { userId: 'user123', amount: 50 },
        priority: OperationPriority.NORMAL,
        retryPolicy: {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          retryableErrors: ['NETWORK_ERROR']
        },
        scheduledAt: new Date(),
        maxAttempts: 3,
        correlationId: 'corr123',
        userId: 'user123',
        metadata: { source: 'test' }
      };
      
      // Act
      const operationId = await operationQueue.enqueue(operation);
      
      // Assert
      expect(operationId).toMatch(/op_\d+_[a-z0-9]+/);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Enqueuing operation',
        expect.objectContaining({
          operationId,
          type: OperationType.CREDIT_DEDUCTION,
          priority: OperationPriority.NORMAL,
          correlationId: 'corr123'
        })
      );
      
      // Verify operation was persisted to Firestore
      expect(mockFirestore.collection).toHaveBeenCalledWith('operations');
      expect(mockFirestore.collection().doc().set).toHaveBeenCalled();
      
      // Verify operation was stored in Realtime DB
      expect(mockRealtimeDB.ref).toHaveBeenCalledWith(`operations/queued/${operationId}`);
      expect(mockRealtimeDB.ref().set).toHaveBeenCalledWith(
        expect.objectContaining({
          id: operationId,
          type: OperationType.CREDIT_DEDUCTION,
          priority: OperationPriority.NORMAL,
          status: OperationStatus.QUEUED
        })
      );
      
      // Verify metrics were updated
      expect(mockMetrics.counter).toHaveBeenCalledWith(
        'operation_queue.enqueued',
        1,
        expect.objectContaining({
          operation_type: OperationType.CREDIT_DEDUCTION,
          priority: OperationPriority.NORMAL.toString()
        })
      );
    });
    
    it('should handle enqueue failure gracefully', async () => {
      // Arrange
      const operation = {
        type: OperationType.CREDIT_DEDUCTION,
        payload: { userId: 'user123', amount: 50 },
        priority: OperationPriority.NORMAL,
        retryPolicy: {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          retryableErrors: ['NETWORK_ERROR']
        },
        scheduledAt: new Date(),
        maxAttempts: 3,
        correlationId: 'corr123',
        userId: 'user123',
        metadata: { source: 'test' }
      };
      
      // Mock Firestore failure
      mockFirestore.collection.mockImplementation(() => ({
        doc: () => ({
          set: jest.fn().mockRejectedValue(new Error('Firestore error'))
        })
      }));
      
      // Act & Assert
      await expect(operationQueue.enqueue(operation))
        .rejects.toThrow('Firestore error');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to enqueue operation',
        expect.objectContaining({
          error: 'Firestore error'
        })
      );
      
      expect(mockMetrics.counter).toHaveBeenCalledWith(
        'operation_queue.enqueue_errors',
        1,
        expect.objectContaining({
          operation_type: OperationType.CREDIT_DEDUCTION,
          error_type: 'unknown'
        })
      );
    });
  });
  
  describe('Operation Status Retrieval', () => {
    it('should get operation status from persistence', async () => {
      // Arrange
      const operationId = 'op123';
      
      // Act
      const operation = await operationQueue.getOperationStatus(operationId);
      
      // Assert
      expect(operation).toBeDefined();
      expect(operation!.id).toBe('op123');
      expect(operation!.type).toBe(OperationType.CREDIT_DEDUCTION);
      expect(operation!.status).toBe(OperationStatus.QUEUED);
      
      expect(mockFirestore.collection).toHaveBeenCalledWith('operations');
      expect(mockFirestore.collection().doc).toHaveBeenCalledWith('op123');
    });
    
    it('should return null for non-existent operation', async () => {
      // Arrange
      const operationId = 'nonexistent';
      
      mockFirestore.collection.mockImplementation(() => ({
        doc: () => ({
          get: jest.fn().mockResolvedValue({ exists: false })
        })
      }));
      
      // Act
      const operation = await operationQueue.getOperationStatus(operationId);
      
      // Assert
      expect(operation).toBeNull();
    });
  });
  
  describe('Operation Cancellation', () => {
    it('should cancel queued operation successfully', async () => {
      // Arrange
      const operationId = 'op123';
      
      // Mock finding operation in queue
      const mockQueue = {
        removeOperation: jest.fn().mockResolvedValue({
          id: operationId,
          type: OperationType.CREDIT_DEDUCTION,
          status: OperationStatus.QUEUED
        })
      };
      
      (operationQueue as any).queues = new Map([[OperationPriority.NORMAL, mockQueue]]);
      
      // Act
      const cancelled = await operationQueue.cancelOperation(operationId);
      
      // Assert
      expect(cancelled).toBe(true);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cancelling operation',
        expect.objectContaining({ operationId })
      );
      
      // Verify operation was removed from Realtime DB
      expect(mockRealtimeDB.ref).toHaveBeenCalledWith(`operations/queued/${operationId}`);
      expect(mockRealtimeDB.ref().remove).toHaveBeenCalled();
      
      expect(mockMetrics.counter).toHaveBeenCalledWith(
        'operation_queue.cancelled',
        1,
        expect.objectContaining({
          operation_type: OperationType.CREDIT_DEDUCTION
        })
      );
    });
    
    it('should return false when operation not found for cancellation', async () => {
      // Arrange
      const operationId = 'nonexistent';
      
      // Mock empty queues
      (operationQueue as any).queues = new Map();
      
      // Act
      const cancelled = await operationQueue.cancelOperation(operationId);
      
      // Assert
      expect(cancelled).toBe(false);
    });
  });
  
  describe('Operation Processing', () => {
    it('should process operation successfully', async () => {
      // Arrange
      const operation = {
        id: 'op123',
        type: OperationType.CREDIT_DEDUCTION,
        payload: { userId: 'user123', amount: 50 },
        priority: OperationPriority.NORMAL,
        status: OperationStatus.QUEUED,
        createdAt: new Date(),
        scheduledAt: new Date(),
        attemptCount: 0,
        maxAttempts: 3,
        errors: [],
        correlationId: 'corr123',
        userId: 'user123',
        metadata: {},
        retryPolicy: {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          retryableErrors: ['NETWORK_ERROR']
        }
      };
      
      // Mock processor
      const mockProcessor = {
        execute: jest.fn().mockResolvedValue({
          operationId: 'op123',
          status: ExecutionStatus.SUCCESS,
          result: { creditsDeducted: 50 },
          executionTime: 100,
          resourcesUsed: {
            cpuTimeMs: 50,
            memoryMB: 10,
            networkBytes: 1024,
            storageOperations: 2
          }
        })
      };
      
      (operationQueue as any).processors = new Map([[OperationType.CREDIT_DEDUCTION, mockProcessor]]);
      
      // Act
      await (operationQueue as any).processOperation(operation);
      
      // Assert
      expect(mockProcessor.execute).toHaveBeenCalledWith(operation);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Processing operation',
        expect.objectContaining({
          operationId: 'op123',
          type: OperationType.CREDIT_DEDUCTION,
          attempt: 1
        })
      );
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Operation completed successfully',
        expect.objectContaining({
          operationId: 'op123'
        })
      );
      
      // Verify success event was published
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'operation.completed',
          data: expect.objectContaining({
            operationId: 'op123',
            operationType: OperationType.CREDIT_DEDUCTION
          })
        })
      );
      
      // Verify metrics were updated
      expect(mockMetrics.counter).toHaveBeenCalledWith(
        'operation_queue.completed',
        1,
        expect.objectContaining({
          operation_type: OperationType.CREDIT_DEDUCTION
        })
      );
      
      expect(mockMetrics.histogram).toHaveBeenCalledWith(
        'operation_queue.execution_time',
        expect.any(Number),
        expect.objectContaining({
          operation_type: OperationType.CREDIT_DEDUCTION,
          priority: OperationPriority.NORMAL.toString()
        })
      );
    });
    
    it('should handle operation processing failure with retry', async () => {
      // Arrange
      const operation = {
        id: 'op123',
        type: OperationType.CREDIT_DEDUCTION,
        payload: { userId: 'user123', amount: 50 },
        priority: OperationPriority.NORMAL,
        status: OperationStatus.QUEUED,
        createdAt: new Date(),
        scheduledAt: new Date(),
        attemptCount: 0,
        maxAttempts: 3,
        errors: [],
        correlationId: 'corr123',
        userId: 'user123',
        metadata: {},
        retryPolicy: {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          retryableErrors: ['NETWORK_ERROR']
        }
      };
      
      // Mock processor failure
      const mockProcessor = {
        execute: jest.fn().mockRejectedValue(new Error('NETWORK_ERROR: Connection failed'))
      };
      
      (operationQueue as any).processors = new Map([[OperationType.CREDIT_DEDUCTION, mockProcessor]]);
      
      // Mock retry scheduler
      const mockRetryScheduler = {
        scheduleRetry: jest.fn().mockResolvedValue(undefined)
      };
      
      (operationQueue as any).retryScheduler = mockRetryScheduler;
      
      // Act
      await (operationQueue as any).processOperation(operation);
      
      // Assert
      expect(mockProcessor.execute).toHaveBeenCalledWith(operation);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Operation failed',
        expect.objectContaining({
          operationId: 'op123',
          attempt: 1,
          error: 'NETWORK_ERROR: Connection failed'
        })
      );
      
      // Verify retry was scheduled
      expect(mockRetryScheduler.scheduleRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'op123',
          status: OperationStatus.RETRY_SCHEDULED,
          nextRetryAt: expect.any(Date)
        })
      );
      
      expect(mockMetrics.counter).toHaveBeenCalledWith(
        'operation_queue.retries_scheduled',
        1,
        expect.objectContaining({
          operation_type: OperationType.CREDIT_DEDUCTION,
          attempt: '1'
        })
      );
    });
    
    it('should send operation to DLQ after max retries exceeded', async () => {
      // Arrange
      const operation = {
        id: 'op123',
        type: OperationType.CREDIT_DEDUCTION,
        payload: { userId: 'user123', amount: 50 },
        priority: OperationPriority.CRITICAL, // Critical operation goes to DLQ
        status: OperationStatus.QUEUED,
        createdAt: new Date(),
        scheduledAt: new Date(),
        attemptCount: 3, // Max attempts reached
        maxAttempts: 3,
        errors: [],
        correlationId: 'corr123',
        userId: 'user123',
        metadata: {},
        retryPolicy: {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          retryableErrors: ['NETWORK_ERROR']
        }
      };
      
      // Mock processor failure
      const mockProcessor = {
        execute: jest.fn().mockRejectedValue(new Error('NETWORK_ERROR: Connection failed'))
      };
      
      (operationQueue as any).processors = new Map([[OperationType.CREDIT_DEDUCTION, mockProcessor]]);
      
      // Mock DLQ manager
      const mockDLQManager = {
        addOperation: jest.fn().mockResolvedValue(undefined)
      };
      
      (operationQueue as any).dlqManager = mockDLQManager;
      
      // Act
      await (operationQueue as any).processOperation(operation);
      
      // Assert
      expect(mockDLQManager.addOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'op123',
          status: OperationStatus.DLQ
        }),
        expect.objectContaining({
          code: 'NETWORK_ERROR',
          message: 'NETWORK_ERROR: Connection failed',
          retryable: true
        })
      );
      
      // Verify failure event was published
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'operation.failed',
          data: expect.objectContaining({
            operationId: 'op123',
            operationType: OperationType.CREDIT_DEDUCTION
          })
        })
      );
    });
  });
  
  describe('Priority Queue Management', () => {
    it('should process operations in priority order', async () => {
      // Arrange
      const lowPriorityOp = {
        id: 'op1',
        type: OperationType.USER_NOTIFICATION,
        priority: OperationPriority.LOW,
        scheduledAt: new Date(Date.now() - 1000) // Earlier
      };
      
      const highPriorityOp = {
        id: 'op2',
        type: OperationType.CREDIT_DEDUCTION,
        priority: OperationPriority.HIGH,
        scheduledAt: new Date() // Later but higher priority
      };
      
      // Mock priority queues
      const mockLowQueue = {
        dequeue: jest.fn().mockResolvedValue(lowPriorityOp)
      };
      
      const mockHighQueue = {
        dequeue: jest.fn().mockResolvedValue(highPriorityOp)
      };
      
      (operationQueue as any).queues = new Map([
        [OperationPriority.LOW, mockLowQueue],
        [OperationPriority.HIGH, mockHighQueue]
      ]);
      
      // Act
      const nextOperation = await (operationQueue as any).getNextOperation();
      
      // Assert
      expect(nextOperation).toBe(highPriorityOp); // High priority should be returned first
      expect(mockHighQueue.dequeue).toHaveBeenCalled();
      expect(mockLowQueue.dequeue).not.toHaveBeenCalled();
    });
  });
  
  describe('Retry Logic', () => {
    it('should calculate retry delay with exponential backoff', () => {
      // Arrange
      const operation = {
        attemptCount: 2,
        retryPolicy: {
          maxRetries: 5,
          initialDelayMs: 1000,
          maxDelayMs: 30000,
          backoffMultiplier: 2,
          retryableErrors: []
        }
      };
      
      // Act
      const delay = (operationQueue as any).calculateRetryDelay(operation);
      
      // Assert
      // Should be initialDelayMs * backoffMultiplier^(attemptCount-1)
      // 1000 * 2^(2-1) = 1000 * 2 = 2000
      expect(delay).toBe(2000);
    });
    
    it('should cap retry delay at maximum', () => {
      // Arrange
      const operation = {
        attemptCount: 10, // Very high attempt count
        retryPolicy: {
          maxRetries: 15,
          initialDelayMs: 1000,
          maxDelayMs: 5000, // Low max delay
          backoffMultiplier: 2,
          retryableErrors: []
        }
      };
      
      // Act
      const delay = (operationQueue as any).calculateRetryDelay(operation);
      
      // Assert
      expect(delay).toBe(5000); // Should be capped at maxDelayMs
    });
    
    it('should identify retryable errors correctly', () => {
      // Arrange
      const retryableError = new Error('NETWORK_ERROR: Connection timeout');
      const nonRetryableError = new Error('VALIDATION_ERROR: Invalid data');
      
      // Act
      const isRetryable1 = (operationQueue as any).isRetryableError(retryableError);
      const isRetryable2 = (operationQueue as any).isRetryableError(nonRetryableError);
      
      // Assert
      expect(isRetryable1).toBe(true);
      expect(isRetryable2).toBe(false);
    });
    
    it('should determine if operation should be retried', () => {
      // Arrange
      const retryableOperation = {
        attemptCount: 2,
        maxAttempts: 5,
        retryPolicy: { maxRetries: 5 }
      };
      
      const maxedOutOperation = {
        attemptCount: 5,
        maxAttempts: 5,
        retryPolicy: { maxRetries: 5 }
      };
      
      const retryableError = {
        retryable: true
      };
      
      const nonRetryableError = {
        retryable: false
      };
      
      // Act
      const shouldRetry1 = (operationQueue as any).shouldRetryOperation(retryableOperation, retryableError);
      const shouldRetry2 = (operationQueue as any).shouldRetryOperation(maxedOutOperation, retryableError);
      const shouldRetry3 = (operationQueue as any).shouldRetryOperation(retryableOperation, nonRetryableError);
      
      // Assert
      expect(shouldRetry1).toBe(true);
      expect(shouldRetry2).toBe(false); // Max attempts reached
      expect(shouldRetry3).toBe(false); // Non-retryable error
    });
  });
  
  describe('Error Classification', () => {
    it('should extract error codes correctly', () => {
      // Arrange
      const errorWithCode = new Error('NETWORK_ERROR: Connection failed');
      const errorWithoutCode = new Error('Something went wrong');
      
      // Act
      const code1 = (operationQueue as any).getErrorCode(errorWithCode);
      const code2 = (operationQueue as any).getErrorCode(errorWithoutCode);
      
      // Assert
      expect(code1).toBe('NETWORK_ERROR');
      expect(code2).toBe('UNKNOWN_ERROR');
    });
    
    it('should determine error severity correctly', () => {
      // Arrange
      const criticalError = new Error('CRITICAL: System failure');
      const highError = new Error('HIGH: Service unavailable');
      const mediumError = new Error('MEDIUM: Temporary issue');
      const normalError = new Error('Something happened');
      
      // Act
      const severity1 = (operationQueue as any).getErrorSeverity(criticalError);
      const severity2 = (operationQueue as any).getErrorSeverity(highError);
      const severity3 = (operationQueue as any).getErrorSeverity(mediumError);
      const severity4 = (operationQueue as any).getErrorSeverity(normalError);
      
      // Assert
      expect(severity1).toBe(ErrorSeverity.CRITICAL);
      expect(severity2).toBe(ErrorSeverity.HIGH);
      expect(severity3).toBe(ErrorSeverity.MEDIUM);
      expect(severity4).toBe(ErrorSeverity.LOW);
    });
    
    it('should identify critical operations correctly', () => {
      // Arrange
      const criticalTypeOperation = {
        type: OperationType.CREDIT_DEDUCTION,
        priority: OperationPriority.NORMAL
      };
      
      const criticalPriorityOperation = {
        type: OperationType.USER_NOTIFICATION,
        priority: OperationPriority.CRITICAL
      };
      
      const normalOperation = {
        type: OperationType.USER_NOTIFICATION,
        priority: OperationPriority.NORMAL
      };
      
      // Act
      const isCritical1 = (operationQueue as any).isCriticalOperation(criticalTypeOperation);
      const isCritical2 = (operationQueue as any).isCriticalOperation(criticalPriorityOperation);
      const isCritical3 = (operationQueue as any).isCriticalOperation(normalOperation);
      
      // Assert
      expect(isCritical1).toBe(true); // Critical operation type
      expect(isCritical2).toBe(true); // Critical priority
      expect(isCritical3).toBe(false); // Normal operation
    });
  });
});