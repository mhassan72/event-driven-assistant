/**
 * Unit Tests for Event Bus
 * Tests event publishing, subscription management, and dead letter queue functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventBus } from '../../../src/shared/orchestration/event-bus';
import {
  Event,
  EventPriority,
  PublishStatus,
  DLQStatus,
  ErrorSeverity
} from '../../../src/shared/types/orchestration';

// Mock dependencies
const mockRealtimeDB = {
  ref: jest.fn(() => ({
    set: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    off: jest.fn()
  }))
};

const mockFirestore = {
  collection: jest.fn(() => ({
    doc: jest.fn(() => ({
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined)
    })),
    get: jest.fn().mockResolvedValue({ docs: [] })
  }))
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

describe('EventBus', () => {
  let eventBus: EventBus;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    eventBus = new EventBus({
      realtimeDB: mockRealtimeDB as any,
      firestore: mockFirestore as any,
      logger: mockLogger as any,
      metrics: mockMetrics as any
    });
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Event Publishing', () => {
    it('should publish event successfully', async () => {
      // Arrange
      const event: Event<any> = {
        id: 'event123',
        type: 'test.event',
        data: { message: 'test data' },
        timestamp: new Date(),
        correlationId: 'corr123',
        metadata: {
          source: 'test',
          environment: 'test',
          traceId: 'trace123',
          spanId: 'span123',
          priority: EventPriority.NORMAL
        }
      };
      
      // Act
      const result = await eventBus.publish(event);
      
      // Assert
      expect(result.eventId).toBe('event123');
      expect(result.status).toBe(PublishStatus.SUCCESS);
      expect(result.publishedAt).toBeInstanceOf(Date);
      expect(result.subscribersNotified).toBe(0); // No subscribers initially
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Publishing event',
        expect.objectContaining({
          eventId: 'event123',
          eventType: 'test.event',
          correlationId: 'corr123',
          priority: EventPriority.NORMAL
        })
      );
      
      // Verify event was stored in Firestore
      expect(mockFirestore.collection).toHaveBeenCalledWith('events');
      expect(mockFirestore.collection().doc).toHaveBeenCalledWith('event123');
      expect(mockFirestore.collection().doc().set).toHaveBeenCalled();
      
      // Verify event was published to Realtime DB
      expect(mockRealtimeDB.ref).toHaveBeenCalledWith('events/test.event/event123');
      expect(mockRealtimeDB.ref().set).toHaveBeenCalled();
    });
    
    it('should handle event publishing failure', async () => {
      // Arrange
      const event: Event<any> = {
        id: 'event123',
        type: 'test.event',
        data: { message: 'test data' },
        timestamp: new Date(),
        correlationId: 'corr123',
        metadata: {
          source: 'test',
          environment: 'test',
          traceId: 'trace123',
          spanId: 'span123',
          priority: EventPriority.NORMAL
        }
      };
      
      // Mock Firestore failure
      mockFirestore.collection.mockImplementation(() => ({
        doc: () => ({
          set: jest.fn().mockRejectedValue(new Error('Firestore error'))
        })
      }));
      
      // Act
      const result = await eventBus.publish(event);
      
      // Assert
      expect(result.status).toBe(PublishStatus.FAILED);
      expect(result.subscribersNotified).toBe(0);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Event publishing failed',
        expect.objectContaining({
          eventId: 'event123',
          error: 'Firestore error'
        })
      );
      
      expect(mockMetrics.counter).toHaveBeenCalledWith(
        'event_bus.publish_errors',
        1,
        expect.objectContaining({
          event_type: 'test.event',
          error_type: 'publish_failed'
        })
      );
    });
    
    it('should validate event before publishing', async () => {
      // Arrange
      const invalidEvent = {
        id: '', // Missing ID
        type: 'test.event',
        data: { message: 'test data' },
        timestamp: new Date(),
        correlationId: '', // Missing correlation ID
        metadata: {
          source: 'test',
          environment: 'test',
          traceId: 'trace123',
          spanId: 'span123',
          priority: EventPriority.NORMAL
        }
      } as Event<any>;
      
      // Act
      const result = await eventBus.publish(invalidEvent);
      
      // Assert
      expect(result.status).toBe(PublishStatus.FAILED);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Event publishing failed',
        expect.objectContaining({
          error: 'Event ID is required'
        })
      );
    });
  });
  
  describe('Batch Event Publishing', () => {
    it('should publish batch of events successfully', async () => {
      // Arrange
      const events: Event<any>[] = [
        {
          id: 'event1',
          type: 'test.event',
          data: { message: 'test data 1' },
          timestamp: new Date(),
          correlationId: 'corr1',
          metadata: {
            source: 'test',
            environment: 'test',
            traceId: 'trace1',
            spanId: 'span1',
            priority: EventPriority.NORMAL
          }
        },
        {
          id: 'event2',
          type: 'test.event',
          data: { message: 'test data 2' },
          timestamp: new Date(),
          correlationId: 'corr2',
          metadata: {
            source: 'test',
            environment: 'test',
            traceId: 'trace2',
            spanId: 'span2',
            priority: EventPriority.HIGH
          }
        }
      ];
      
      // Act
      const result = await eventBus.publishBatch(events);
      
      // Assert
      expect(result.batchId).toMatch(/batch_\d+_[a-z0-9]+/);
      expect(result.totalEvents).toBe(2);
      expect(result.successfulEvents).toBe(2);
      expect(result.failedEvents).toBe(0);
      expect(result.results).toHaveLength(2);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Publishing event batch',
        expect.objectContaining({
          batchId: result.batchId,
          eventCount: 2
        })
      );
      
      expect(mockMetrics.histogram).toHaveBeenCalledWith(
        'event_bus.batch_publish_time',
        expect.any(Number),
        expect.objectContaining({
          batch_size: '2'
        })
      );
    });
    
    it('should handle partial batch failure', async () => {
      // Arrange
      const events: Event<any>[] = [
        {
          id: 'event1',
          type: 'test.event',
          data: { message: 'test data 1' },
          timestamp: new Date(),
          correlationId: 'corr1',
          metadata: {
            source: 'test',
            environment: 'test',
            traceId: 'trace1',
            spanId: 'span1',
            priority: EventPriority.NORMAL
          }
        },
        {
          id: '', // Invalid event
          type: 'test.event',
          data: { message: 'test data 2' },
          timestamp: new Date(),
          correlationId: 'corr2',
          metadata: {
            source: 'test',
            environment: 'test',
            traceId: 'trace2',
            spanId: 'span2',
            priority: EventPriority.HIGH
          }
        } as Event<any>
      ];
      
      // Act
      const result = await eventBus.publishBatch(events);
      
      // Assert
      expect(result.totalEvents).toBe(2);
      expect(result.successfulEvents).toBe(1);
      expect(result.failedEvents).toBe(1);
      
      // First event should succeed, second should fail
      expect(result.results[0].status).toBe(PublishStatus.SUCCESS);
      expect(result.results[1].status).toBe(PublishStatus.FAILED);
    });
  });
  
  describe('Event Subscription', () => {
    it('should create subscription successfully', async () => {
      // Arrange
      const eventType = 'test.event';
      const handler = jest.fn().mockResolvedValue(undefined);
      
      // Act
      const subscription = await eventBus.subscribe(eventType, handler);
      
      // Assert
      expect(subscription.id).toMatch(/sub_\d+_[a-z0-9]+/);
      expect(subscription.eventType).toBe('test.event');
      expect(subscription.handler).toBe(handler);
      expect(subscription.isActive).toBe(true);
      expect(subscription.createdAt).toBeInstanceOf(Date);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating event subscription',
        expect.objectContaining({
          subscriptionId: subscription.id,
          eventType: 'test.event'
        })
      );
      
      // Verify Realtime DB listener was set up
      expect(mockRealtimeDB.ref).toHaveBeenCalledWith('events/test.event');
      expect(mockRealtimeDB.ref().on).toHaveBeenCalledWith('child_added', expect.any(Function));
    });
    
    it('should create subscription with custom retry policy', async () => {
      // Arrange
      const eventType = 'test.event';
      const handler = jest.fn().mockResolvedValue(undefined);
      const retryPolicy = {
        maxRetries: 5,
        initialDelayMs: 2000,
        maxDelayMs: 60000,
        backoffMultiplier: 3,
        retryableErrors: ['CUSTOM_ERROR']
      };
      
      // Act
      const subscription = await eventBus.subscribeWithRetry(eventType, handler, retryPolicy);
      
      // Assert
      expect(subscription.eventType).toBe('test.event');
      expect(subscription.handler).toBe(handler);
      
      // Verify subscription was created with custom retry policy
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating event subscription',
        expect.objectContaining({
          eventType: 'test.event'
        })
      );
    });
  });
  
  describe('Dead Letter Queue Management', () => {
    it('should handle failed event and send to DLQ', async () => {
      // Arrange
      const event: Event<any> = {
        id: 'event123',
        type: 'test.event',
        data: { message: 'test data' },
        timestamp: new Date(),
        correlationId: 'corr123',
        metadata: {
          source: 'test',
          environment: 'test',
          traceId: 'trace123',
          spanId: 'span123',
          priority: EventPriority.CRITICAL
        }
      };
      
      const error = new Error('Handler failed');
      
      // Act
      const result = await eventBus.handleFailedEvent(event, error);
      
      // Assert
      expect(result.messageId).toMatch(/dlq_\d+_[a-z0-9]+/);
      expect(result.status).toBe(DLQStatus.QUEUED);
      expect(result.processedAt).toBeInstanceOf(Date);
      expect(result.retryCount).toBe(0);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Handling failed event',
        expect.objectContaining({
          eventId: 'event123',
          eventType: 'test.event',
          error: 'Handler failed'
        })
      );
      
      expect(mockMetrics.counter).toHaveBeenCalledWith(
        'event_bus.dlq_messages',
        1,
        expect.objectContaining({
          event_type: 'test.event'
        })
      );
    });
    
    it('should reprocess DLQ events successfully', async () => {
      // Arrange
      const filter = {
        eventType: 'test.event',
        maxRetryCount: 3
      };
      
      // Mock DLQ processor to return some messages
      const mockMessages = [
        {
          id: 'dlq1',
          originalEvent: {
            id: 'event1',
            type: 'test.event',
            data: {},
            timestamp: new Date(),
            correlationId: 'corr1',
            metadata: { priority: EventPriority.NORMAL }
          },
          retryCount: 1,
          maxRetries: 3
        }
      ];
      
      // Mock the DLQ processor methods
      (eventBus as any).dlqProcessor = {
        getMessages: jest.fn().mockResolvedValue(mockMessages),
        removeMessage: jest.fn().mockResolvedValue(undefined)
      };
      
      // Act
      const result = await eventBus.reprocessDLQEvents(filter);
      
      // Assert
      expect(result.totalMessages).toBe(1);
      expect(result.successfulMessages).toBe(1);
      expect(result.failedMessages).toBe(0);
      expect(result.results).toHaveLength(1);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Reprocessing DLQ events',
        expect.objectContaining({ filter })
      );
      
      expect(mockMetrics.counter).toHaveBeenCalledWith(
        'event_bus.dlq_reprocessed',
        1
      );
    });
  });
  
  describe('Error Handling and Retry Logic', () => {
    it('should identify retryable errors correctly', () => {
      // Arrange
      const retryableError = new Error('NETWORK_ERROR: Connection failed');
      const nonRetryableError = new Error('VALIDATION_ERROR: Invalid data');
      
      // Act
      const isRetryable1 = (eventBus as any).isRetryableError(retryableError);
      const isRetryable2 = (eventBus as any).isRetryableError(nonRetryableError);
      
      // Assert
      expect(isRetryable1).toBe(true);
      expect(isRetryable2).toBe(false);
    });
    
    it('should categorize errors correctly', () => {
      // Arrange
      const networkError = new Error('NETWORK_ERROR: Connection timeout');
      const timeoutError = new Error('TIMEOUT_ERROR: Request timeout');
      const validationError = new Error('VALIDATION_ERROR: Invalid input');
      const unknownError = new Error('Something went wrong');
      
      // Act
      const category1 = (eventBus as any).categorizeError(networkError);
      const category2 = (eventBus as any).categorizeError(timeoutError);
      const category3 = (eventBus as any).categorizeError(validationError);
      const category4 = (eventBus as any).categorizeError(unknownError);
      
      // Assert
      expect(category1).toBe('network');
      expect(category2).toBe('timeout');
      expect(category3).toBe('validation');
      expect(category4).toBe('unknown');
    });
    
    it('should calculate retry delay with exponential backoff', () => {
      // Arrange
      const retryPolicy = {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        retryableErrors: []
      };
      
      // Act
      const delay1 = (eventBus as any).calculateNextRetry(0, retryPolicy);
      const delay2 = (eventBus as any).calculateNextRetry(1, retryPolicy);
      const delay3 = (eventBus as any).calculateNextRetry(2, retryPolicy);
      const delay4 = (eventBus as any).calculateNextRetry(10, retryPolicy); // Should be capped
      
      // Assert
      expect(delay1.getTime()).toBeGreaterThan(Date.now() + 900); // ~1000ms
      expect(delay2.getTime()).toBeGreaterThan(Date.now() + 1900); // ~2000ms
      expect(delay3.getTime()).toBeGreaterThan(Date.now() + 3900); // ~4000ms
      expect(delay4.getTime()).toBeLessThan(Date.now() + 31000); // Capped at maxDelayMs
    });
    
    it('should determine max retries based on event priority', () => {
      // Arrange
      const criticalEvent: Event<any> = {
        id: 'event1',
        type: 'test.event',
        data: {},
        timestamp: new Date(),
        correlationId: 'corr1',
        metadata: { priority: EventPriority.CRITICAL } as any
      };
      
      const normalEvent: Event<any> = {
        id: 'event2',
        type: 'test.event',
        data: {},
        timestamp: new Date(),
        correlationId: 'corr2',
        metadata: { priority: EventPriority.NORMAL } as any
      };
      
      // Act
      const maxRetries1 = (eventBus as any).getMaxRetriesForEvent(criticalEvent);
      const maxRetries2 = (eventBus as any).getMaxRetriesForEvent(normalEvent);
      
      // Assert
      expect(maxRetries1).toBe(5); // Critical events get more retries
      expect(maxRetries2).toBe(2); // Normal events get fewer retries
    });
  });
  
  describe('Metrics and Monitoring', () => {
    it('should record publishing metrics', async () => {
      // Arrange
      const event: Event<any> = {
        id: 'event123',
        type: 'test.event',
        data: { message: 'test data' },
        timestamp: new Date(),
        correlationId: 'corr123',
        metadata: {
          source: 'test',
          environment: 'test',
          traceId: 'trace123',
          spanId: 'span123',
          priority: EventPriority.HIGH
        }
      };
      
      // Act
      await eventBus.publish(event);
      
      // Assert
      expect(mockMetrics.histogram).toHaveBeenCalledWith(
        'event_bus.publish_time',
        expect.any(Number),
        expect.objectContaining({
          event_type: 'test.event',
          priority: EventPriority.HIGH,
          subscriber_count: '0'
        })
      );
      
      expect(mockMetrics.counter).toHaveBeenCalledWith(
        'event_bus.events_published',
        1,
        expect.objectContaining({
          event_type: 'test.event',
          priority: EventPriority.HIGH
        })
      );
    });
    
    it('should initialize gauge metrics', () => {
      // Assert
      expect(mockMetrics.gauge).toHaveBeenCalledWith(
        'event_bus.active_subscriptions',
        expect.any(Function)
      );
      
      expect(mockMetrics.gauge).toHaveBeenCalledWith(
        'event_bus.retry_queues',
        expect.any(Function)
      );
      
      expect(mockMetrics.gauge).toHaveBeenCalledWith(
        'event_bus.dlq_size',
        expect.any(Function)
      );
    });
  });
});