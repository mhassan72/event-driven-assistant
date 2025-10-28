/**
 * Event Bus Implementation
 * Provides guaranteed message delivery, retry mechanisms, and dead letter queue management
 */

import { Database } from 'firebase-admin/database';
import { Firestore } from 'firebase-admin/firestore';
import {
  IEventBus,
  Event,
  EventHandler,
  Subscription,
  PublishResult,
  BatchPublishResult,
  DLQResult,
  ReprocessResult,
  RetryPolicy,
  DLQFilter,
  PublishStatus,
  DLQStatus,
  EventPriority,
  ErrorSeverity
} from '../types/orchestration';
import { IStructuredLogger } from '../observability/logger';
import { IMetricsCollector } from '../observability/metrics';

/**
 * Dependencies for event bus
 */
export interface EventBusDependencies {
  realtimeDB: Database;
  firestore: Firestore;
  logger: IStructuredLogger;
  metrics: IMetricsCollector;
}

/**
 * Event bus implementation with guaranteed delivery and retry mechanisms
 */
export class EventBus implements IEventBus {
  private realtimeDB: Database;
  private firestore: Firestore;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  
  // Internal state
  private subscriptions: Map<string, SubscriptionInfo[]> = new Map();
  private retryQueues: Map<string, RetryQueue> = new Map();
  private dlqProcessor: DLQProcessor;
  
  constructor(dependencies: EventBusDependencies) {
    this.realtimeDB = dependencies.realtimeDB;
    this.firestore = dependencies.firestore;
    this.logger = dependencies.logger;
    this.metrics = dependencies.metrics;
    
    this.dlqProcessor = new DLQProcessor(dependencies);
    this.initializeEventBus();
  }
  
  // ============================================================================
  // Event Publishing
  // ============================================================================
  
  async publish<T>(event: Event<T>): Promise<PublishResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Publishing event', {
        eventId: event.id,
        eventType: event.type,
        correlationId: event.correlationId,
        priority: event.metadata.priority
      });
      
      // Validate event
      this.validateEvent(event);
      
      // Store event in Firestore for persistence
      await this.storeEvent(event);
      
      // Get subscribers for this event type
      const subscribers = this.subscriptions.get(event.type) || [];
      
      if (subscribers.length === 0) {
        this.logger.warn('No subscribers found for event type', {
          eventType: event.type,
          eventId: event.id
        });
      }
      
      // Publish to Realtime Database for immediate delivery
      await this.publishToRealtimeDB(event);
      
      // Notify subscribers
      let successfulNotifications = 0;
      const notificationPromises = subscribers.map(async (subscription) => {
        try {
          await this.notifySubscriber(subscription, event);
          successfulNotifications++;
        } catch (error) {
          this.logger.error('Failed to notify subscriber', {
            eventId: event.id,
            subscriptionId: subscription.id,
            error: error.message
          });
          
          // Add to retry queue if retryable
          if (this.isRetryableError(error)) {
            await this.addToRetryQueue(event, subscription, error);
          } else {
            await this.sendToDLQ(event, subscription, error);
          }
        }
      });
      
      await Promise.allSettled(notificationPromises);
      
      // Update metrics
      this.metrics.histogram('event_bus.publish_time', Date.now() - startTime, {
        event_type: event.type,
        priority: event.metadata.priority,
        subscriber_count: subscribers.length.toString()
      });
      
      this.metrics.counter('event_bus.events_published', 1, {
        event_type: event.type,
        priority: event.metadata.priority
      });
      
      return {
        eventId: event.id,
        status: successfulNotifications === subscribers.length ? PublishStatus.SUCCESS :
                successfulNotifications > 0 ? PublishStatus.PARTIAL : PublishStatus.FAILED,
        publishedAt: new Date(),
        subscribersNotified: successfulNotifications
      };
      
    } catch (error) {
      this.logger.error('Event publishing failed', {
        eventId: event.id,
        error: error.message
      });
      
      this.metrics.counter('event_bus.publish_errors', 1, {
        event_type: event.type,
        error_type: 'publish_failed'
      });
      
      return {
        eventId: event.id,
        status: PublishStatus.FAILED,
        publishedAt: new Date(),
        subscribersNotified: 0
      };
    }
  }
  
  async publishBatch<T>(events: Event<T>[]): Promise<BatchPublishResult> {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
      this.logger.info('Publishing event batch', {
        batchId,
        eventCount: events.length
      });
      
      // Validate all events
      events.forEach(event => this.validateEvent(event));
      
      // Publish events in parallel
      const publishPromises = events.map(event => this.publish(event));
      const results = await Promise.allSettled(publishPromises);
      
      // Collect results
      const publishResults: PublishResult[] = [];
      let successfulEvents = 0;
      let failedEvents = 0;
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          publishResults.push(result.value);
          if (result.value.status === PublishStatus.SUCCESS) {
            successfulEvents++;
          } else {
            failedEvents++;
          }
        } else {
          failedEvents++;
          publishResults.push({
            eventId: events[index].id,
            status: PublishStatus.FAILED,
            publishedAt: new Date(),
            subscribersNotified: 0
          });
        }
      });
      
      // Update metrics
      this.metrics.histogram('event_bus.batch_publish_time', Date.now() - startTime, {
        batch_size: events.length.toString()
      });
      
      return {
        batchId,
        totalEvents: events.length,
        successfulEvents,
        failedEvents,
        results: publishResults
      };
      
    } catch (error) {
      this.logger.error('Batch event publishing failed', {
        batchId,
        error: error.message
      });
      
      return {
        batchId,
        totalEvents: events.length,
        successfulEvents: 0,
        failedEvents: events.length,
        results: events.map(event => ({
          eventId: event.id,
          status: PublishStatus.FAILED,
          publishedAt: new Date(),
          subscribersNotified: 0
        }))
      };
    }
  }
  
  // ============================================================================
  // Event Subscription
  // ============================================================================
  
  async subscribe<T>(eventType: string, handler: EventHandler<T>): Promise<Subscription> {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      this.logger.info('Creating event subscription', {
        subscriptionId,
        eventType
      });
      
      const subscription: Subscription = {
        id: subscriptionId,
        eventType,
        handler,
        isActive: true,
        createdAt: new Date()
      };
      
      // Add to internal subscriptions
      const subscriptionInfo: SubscriptionInfo = {
        subscription,
        retryPolicy: this.getDefaultRetryPolicy()
      };
      
      if (!this.subscriptions.has(eventType)) {
        this.subscriptions.set(eventType, []);
      }
      this.subscriptions.get(eventType)!.push(subscriptionInfo);
      
      // Set up Realtime Database listener for this event type
      await this.setupRealtimeListener(eventType, subscriptionInfo);
      
      // Update metrics
      this.metrics.gauge('event_bus.active_subscriptions', this.getTotalSubscriptions());
      
      return subscription;
      
    } catch (error) {
      this.logger.error('Failed to create subscription', {
        subscriptionId,
        eventType,
        error: error.message
      });
      
      throw error;
    }
  }
  
  async subscribeWithRetry<T>(
    eventType: string,
    handler: EventHandler<T>,
    retryPolicy: RetryPolicy
  ): Promise<Subscription> {
    const subscription = await this.subscribe(eventType, handler);
    
    // Update retry policy for this subscription
    const subscriptions = this.subscriptions.get(eventType) || [];
    const subscriptionInfo = subscriptions.find(s => s.subscription.id === subscription.id);
    
    if (subscriptionInfo) {
      subscriptionInfo.retryPolicy = retryPolicy;
    }
    
    return subscription;
  }
  
  // ============================================================================
  // Dead Letter Queue Management
  // ============================================================================
  
  async handleFailedEvent(event: Event<any>, error: Error): Promise<DLQResult> {
    try {
      this.logger.info('Handling failed event', {
        eventId: event.id,
        eventType: event.type,
        error: error.message
      });
      
      const dlqMessage: DLQMessage = {
        id: `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        originalEvent: event,
        error: {
          message: error.message,
          stack: error.stack,
          timestamp: new Date()
        },
        retryCount: 0,
        maxRetries: this.getMaxRetriesForEvent(event),
        nextRetryAt: this.calculateNextRetry(0),
        priority: this.calculateDLQPriority(event, error),
        createdAt: new Date()
      };
      
      // Store in DLQ
      await this.dlqProcessor.addMessage(dlqMessage);
      
      // Update metrics
      this.metrics.counter('event_bus.dlq_messages', 1, {
        event_type: event.type,
        error_type: this.categorizeError(error)
      });
      
      return {
        messageId: dlqMessage.id,
        status: DLQStatus.QUEUED,
        processedAt: new Date(),
        retryCount: 0
      };
      
    } catch (error) {
      this.logger.error('Failed to handle failed event', {
        eventId: event.id,
        error: error.message
      });
      
      return {
        messageId: 'unknown',
        status: DLQStatus.DISCARDED,
        processedAt: new Date(),
        retryCount: 0
      };
    }
  }
  
  async reprocessDLQEvents(filter?: DLQFilter): Promise<ReprocessResult> {
    try {
      this.logger.info('Reprocessing DLQ events', { filter });
      
      const messages = await this.dlqProcessor.getMessages(filter);
      const results: DLQResult[] = [];
      
      let successfulMessages = 0;
      let failedMessages = 0;
      
      for (const message of messages) {
        try {
          // Attempt to reprocess the event
          const result = await this.reprocessDLQMessage(message);
          results.push(result);
          
          if (result.status === DLQStatus.REPROCESSED) {
            successfulMessages++;
          } else {
            failedMessages++;
          }
        } catch (error) {
          this.logger.error('Failed to reprocess DLQ message', {
            messageId: message.id,
            error: error.message
          });
          
          results.push({
            messageId: message.id,
            status: DLQStatus.DISCARDED,
            processedAt: new Date(),
            retryCount: message.retryCount
          });
          
          failedMessages++;
        }
      }
      
      // Update metrics
      this.metrics.counter('event_bus.dlq_reprocessed', successfulMessages);
      this.metrics.counter('event_bus.dlq_failed_reprocess', failedMessages);
      
      return {
        totalMessages: messages.length,
        successfulMessages,
        failedMessages,
        results
      };
      
    } catch (error) {
      this.logger.error('DLQ reprocessing failed', { error: error.message });
      
      return {
        totalMessages: 0,
        successfulMessages: 0,
        failedMessages: 0,
        results: []
      };
    }
  }
  
  // ============================================================================
  // Private Helper Methods
  // ============================================================================
  
  private async initializeEventBus(): Promise<void> {
    this.logger.info('Initializing event bus');
    
    // Start retry queue processors
    this.startRetryQueueProcessors();
    
    // Start DLQ processor
    await this.dlqProcessor.start();
    
    // Set up metrics collection
    this.initializeMetrics();
  }
  
  private validateEvent<T>(event: Event<T>): void {
    if (!event.id) throw new Error('Event ID is required');
    if (!event.type) throw new Error('Event type is required');
    if (!event.timestamp) throw new Error('Event timestamp is required');
    if (!event.correlationId) throw new Error('Event correlation ID is required');
    if (!event.metadata) throw new Error('Event metadata is required');
  }
  
  private async storeEvent<T>(event: Event<T>): Promise<void> {
    const eventDoc = {
      id: event.id,
      type: event.type,
      data: event.data,
      timestamp: event.timestamp,
      correlationId: event.correlationId,
      metadata: event.metadata,
      storedAt: new Date()
    };
    
    await this.firestore.collection('events').doc(event.id).set(eventDoc);
  }
  
  private async publishToRealtimeDB<T>(event: Event<T>): Promise<void> {
    const eventPath = `events/${event.type}/${event.id}`;
    
    await this.realtimeDB.ref(eventPath).set({
      id: event.id,
      type: event.type,
      data: event.data,
      timestamp: event.timestamp.toISOString(),
      correlationId: event.correlationId,
      metadata: event.metadata,
      publishedAt: new Date().toISOString()
    });
  }
  
  private async notifySubscriber<T>(subscription: SubscriptionInfo, event: Event<T>): Promise<void> {
    const startTime = Date.now();
    
    try {
      await subscription.subscription.handler(event);
      
      // Update metrics
      this.metrics.histogram('event_bus.handler_execution_time', Date.now() - startTime, {
        event_type: event.type,
        subscription_id: subscription.subscription.id
      });
      
    } catch (error) {
      // Update error metrics
      this.metrics.counter('event_bus.handler_errors', 1, {
        event_type: event.type,
        subscription_id: subscription.subscription.id,
        error_type: this.categorizeError(error)
      });
      
      throw error;
    }
  }
  
  private async setupRealtimeListener(eventType: string, subscription: SubscriptionInfo): Promise<void> {
    const eventPath = `events/${eventType}`;
    
    this.realtimeDB.ref(eventPath).on('child_added', async (snapshot) => {
      const eventData = snapshot.val();
      
      if (eventData && subscription.subscription.isActive) {
        try {
          const event: Event<any> = {
            id: eventData.id,
            type: eventData.type,
            data: eventData.data,
            timestamp: new Date(eventData.timestamp),
            correlationId: eventData.correlationId,
            metadata: eventData.metadata
          };
          
          await this.notifySubscriber(subscription, event);
          
        } catch (error) {
          this.logger.error('Realtime event handler failed', {
            eventId: eventData.id,
            subscriptionId: subscription.subscription.id,
            error: error.message
          });
          
          // Handle retry logic
          if (this.isRetryableError(error)) {
            await this.addToRetryQueue(eventData, subscription, error);
          } else {
            await this.sendToDLQ(eventData, subscription, error);
          }
        }
      }
    });
  }
  
  private async addToRetryQueue(event: any, subscription: SubscriptionInfo, error: Error): Promise<void> {
    const retryQueueKey = `${event.type}_${subscription.subscription.id}`;
    
    if (!this.retryQueues.has(retryQueueKey)) {
      this.retryQueues.set(retryQueueKey, new RetryQueue(subscription.retryPolicy));
    }
    
    const retryQueue = this.retryQueues.get(retryQueueKey)!;
    await retryQueue.addItem({
      event,
      subscription,
      error,
      retryCount: 0,
      nextRetryAt: this.calculateNextRetry(0, subscription.retryPolicy)
    });
  }
  
  private async sendToDLQ(event: any, subscription: SubscriptionInfo, error: Error): Promise<void> {
    await this.handleFailedEvent(event, error);
  }
  
  private startRetryQueueProcessors(): void {
    // Process retry queues every 5 seconds
    setInterval(async () => {
      for (const [queueKey, retryQueue] of this.retryQueues.entries()) {
        try {
          await this.processRetryQueue(queueKey, retryQueue);
        } catch (error) {
          this.logger.error('Retry queue processing failed', {
            queueKey,
            error: error.message
          });
        }
      }
    }, 5000);
  }
  
  private async processRetryQueue(queueKey: string, retryQueue: RetryQueue): Promise<void> {
    const readyItems = await retryQueue.getReadyItems();
    
    for (const item of readyItems) {
      try {
        await this.notifySubscriber(item.subscription, item.event);
        await retryQueue.removeItem(item);
        
      } catch (error) {
        item.retryCount++;
        
        if (item.retryCount >= item.subscription.retryPolicy.maxRetries) {
          // Max retries exceeded, send to DLQ
          await this.sendToDLQ(item.event, item.subscription, error);
          await retryQueue.removeItem(item);
        } else {
          // Schedule next retry
          item.nextRetryAt = this.calculateNextRetry(item.retryCount, item.subscription.retryPolicy);
          await retryQueue.updateItem(item);
        }
      }
    }
  }
  
  private async reprocessDLQMessage(message: DLQMessage): Promise<DLQResult> {
    try {
      // Attempt to republish the original event
      const result = await this.publish(message.originalEvent);
      
      if (result.status === PublishStatus.SUCCESS) {
        // Remove from DLQ
        await this.dlqProcessor.removeMessage(message.id);
        
        return {
          messageId: message.id,
          status: DLQStatus.REPROCESSED,
          processedAt: new Date(),
          retryCount: message.retryCount
        };
      } else {
        // Update retry count
        message.retryCount++;
        
        if (message.retryCount >= message.maxRetries) {
          return {
            messageId: message.id,
            status: DLQStatus.DISCARDED,
            processedAt: new Date(),
            retryCount: message.retryCount
          };
        } else {
          message.nextRetryAt = this.calculateNextRetry(message.retryCount);
          await this.dlqProcessor.updateMessage(message);
          
          return {
            messageId: message.id,
            status: DLQStatus.QUEUED,
            processedAt: new Date(),
            retryCount: message.retryCount
          };
        }
      }
      
    } catch (error) {
      this.logger.error('DLQ message reprocessing failed', {
        messageId: message.id,
        error: error.message
      });
      
      throw error;
    }
  }
  
  private getDefaultRetryPolicy(): RetryPolicy {
    return {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      retryableErrors: [
        'NETWORK_ERROR',
        'TIMEOUT_ERROR',
        'TEMPORARY_UNAVAILABLE',
        'RATE_LIMITED'
      ]
    };
  }
  
  private calculateNextRetry(retryCount: number, retryPolicy?: RetryPolicy): Date {
    const policy = retryPolicy || this.getDefaultRetryPolicy();
    const delay = Math.min(
      policy.initialDelayMs * Math.pow(policy.backoffMultiplier, retryCount),
      policy.maxDelayMs
    );
    
    return new Date(Date.now() + delay);
  }
  
  private isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'NETWORK_ERROR',
      'TIMEOUT_ERROR',
      'TEMPORARY_UNAVAILABLE',
      'RATE_LIMITED'
    ];
    
    return retryableErrors.some(errorType => error.message.includes(errorType));
  }
  
  private categorizeError(error: Error): string {
    if (error.message.includes('NETWORK')) return 'network';
    if (error.message.includes('TIMEOUT')) return 'timeout';
    if (error.message.includes('RATE_LIMITED')) return 'rate_limit';
    if (error.message.includes('VALIDATION')) return 'validation';
    return 'unknown';
  }
  
  private getMaxRetriesForEvent(event: Event<any>): number {
    // Determine max retries based on event priority
    switch (event.metadata.priority) {
      case EventPriority.CRITICAL: return 5;
      case EventPriority.HIGH: return 3;
      case EventPriority.NORMAL: return 2;
      case EventPriority.LOW: return 1;
      default: return 2;
    }
  }
  
  private calculateDLQPriority(event: Event<any>, error: Error): EventPriority {
    // Calculate DLQ priority based on original event priority and error type
    if (event.metadata.priority === EventPriority.CRITICAL) {
      return EventPriority.CRITICAL;
    }
    
    if (this.isCriticalError(error)) {
      return EventPriority.HIGH;
    }
    
    return event.metadata.priority;
  }
  
  private isCriticalError(error: Error): boolean {
    const criticalErrors = [
      'CREDIT_TRANSACTION_FAILED',
      'PAYMENT_PROCESSING_FAILED',
      'BLOCKCHAIN_LEDGER_FAILED'
    ];
    
    return criticalErrors.some(errorType => error.message.includes(errorType));
  }
  
  private getTotalSubscriptions(): number {
    return Array.from(this.subscriptions.values())
      .reduce((total, subs) => total + subs.length, 0);
  }
  
  private initializeMetrics(): void {
    this.metrics.gauge('event_bus.retry_queues', () => this.retryQueues.size);
    this.metrics.gauge('event_bus.dlq_size', () => this.dlqProcessor.getQueueSize());
  }
}

// ============================================================================
// Supporting Classes and Interfaces
// ============================================================================

interface SubscriptionInfo {
  subscription: Subscription;
  retryPolicy: RetryPolicy;
}

interface RetryItem {
  event: Event<any>;
  subscription: SubscriptionInfo;
  error: Error;
  retryCount: number;
  nextRetryAt: Date;
}

interface DLQMessage {
  id: string;
  originalEvent: Event<any>;
  error: {
    message: string;
    stack?: string;
    timestamp: Date;
  };
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date;
  priority: EventPriority;
  createdAt: Date;
}

class RetryQueue {
  private items: Map<string, RetryItem> = new Map();
  private retryPolicy: RetryPolicy;
  
  constructor(retryPolicy: RetryPolicy) {
    this.retryPolicy = retryPolicy;
  }
  
  async addItem(item: RetryItem): Promise<void> {
    const itemId = `${item.event.id}_${item.subscription.subscription.id}`;
    this.items.set(itemId, item);
  }
  
  async removeItem(item: RetryItem): Promise<void> {
    const itemId = `${item.event.id}_${item.subscription.subscription.id}`;
    this.items.delete(itemId);
  }
  
  async updateItem(item: RetryItem): Promise<void> {
    const itemId = `${item.event.id}_${item.subscription.subscription.id}`;
    this.items.set(itemId, item);
  }
  
  async getReadyItems(): Promise<RetryItem[]> {
    const now = new Date();
    return Array.from(this.items.values())
      .filter(item => item.nextRetryAt <= now);
  }
}

class DLQProcessor {
  private firestore: Firestore;
  private logger: IStructuredLogger;
  private messages: Map<string, DLQMessage> = new Map();
  
  constructor(dependencies: EventBusDependencies) {
    this.firestore = dependencies.firestore;
    this.logger = dependencies.logger;
  }
  
  async start(): Promise<void> {
    this.logger.info('Starting DLQ processor');
    
    // Load existing DLQ messages from Firestore
    await this.loadExistingMessages();
    
    // Start periodic processing
    this.startPeriodicProcessing();
  }
  
  async addMessage(message: DLQMessage): Promise<void> {
    // Store in memory
    this.messages.set(message.id, message);
    
    // Persist to Firestore
    await this.firestore.collection('dlq_messages').doc(message.id).set({
      ...message,
      createdAt: message.createdAt.toISOString(),
      nextRetryAt: message.nextRetryAt.toISOString()
    });
  }
  
  async removeMessage(messageId: string): Promise<void> {
    this.messages.delete(messageId);
    await this.firestore.collection('dlq_messages').doc(messageId).delete();
  }
  
  async updateMessage(message: DLQMessage): Promise<void> {
    this.messages.set(message.id, message);
    
    await this.firestore.collection('dlq_messages').doc(message.id).update({
      retryCount: message.retryCount,
      nextRetryAt: message.nextRetryAt.toISOString()
    });
  }
  
  async getMessages(filter?: DLQFilter): Promise<DLQMessage[]> {
    let messages = Array.from(this.messages.values());
    
    if (filter) {
      messages = messages.filter(message => {
        if (filter.eventType && message.originalEvent.type !== filter.eventType) {
          return false;
        }
        if (filter.minRetryCount && message.retryCount < filter.minRetryCount) {
          return false;
        }
        if (filter.maxRetryCount && message.retryCount > filter.maxRetryCount) {
          return false;
        }
        if (filter.fromDate && message.createdAt < filter.fromDate) {
          return false;
        }
        if (filter.toDate && message.createdAt > filter.toDate) {
          return false;
        }
        return true;
      });
    }
    
    return messages;
  }
  
  getQueueSize(): number {
    return this.messages.size;
  }
  
  private async loadExistingMessages(): Promise<void> {
    try {
      const snapshot = await this.firestore.collection('dlq_messages').get();
      
      snapshot.forEach(doc => {
        const data = doc.data();
        const message: DLQMessage = {
          ...data,
          createdAt: new Date(data.createdAt),
          nextRetryAt: new Date(data.nextRetryAt)
        } as DLQMessage;
        
        this.messages.set(message.id, message);
      });
      
      this.logger.info('Loaded DLQ messages', { count: this.messages.size });
      
    } catch (error) {
      this.logger.error('Failed to load DLQ messages', { error: error.message });
    }
  }
  
  private startPeriodicProcessing(): void {
    // Process DLQ messages every 30 seconds
    setInterval(async () => {
      try {
        await this.processReadyMessages();
      } catch (error) {
        this.logger.error('DLQ periodic processing failed', { error: error.message });
      }
    }, 30000);
  }
  
  private async processReadyMessages(): Promise<void> {
    const now = new Date();
    const readyMessages = Array.from(this.messages.values())
      .filter(message => message.nextRetryAt <= now && message.retryCount < message.maxRetries);
    
    if (readyMessages.length > 0) {
      this.logger.info('Processing ready DLQ messages', { count: readyMessages.length });
      
      // This would trigger reprocessing of ready messages
      // For now, just log them
      readyMessages.forEach(message => {
        this.logger.debug('Ready for reprocessing', {
          messageId: message.id,
          eventType: message.originalEvent.type,
          retryCount: message.retryCount
        });
      });
    }
  }
}