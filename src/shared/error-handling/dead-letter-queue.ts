/**
 * Dead Letter Queue Management
 * Handles failed operations with recovery procedures and monitoring
 */

import { Database } from 'firebase-admin/database';
import { Firestore } from 'firebase-admin/firestore';
import { IStructuredLogger } from '../observability/logger';
import { IMetricsCollector } from '../observability/metrics';
import { CategorizedError, ErrorSeverity, ErrorCategory } from './error-categories';

/**
 * Dead letter queue item
 */
export interface DLQItem {
  id: string;
  originalOperationId: string;
  operationType: string;
  payload: any;
  
  // Error information
  error: CategorizedError;
  failureReason: string;
  failureCount: number;
  
  // Timing information
  createdAt: Date;
  lastFailedAt: Date;
  nextRetryAt?: Date;
  
  // Processing information
  status: DLQStatus;
  priority: DLQPriority;
  retryPolicy: DLQRetryPolicy;
  
  // Context and metadata
  correlationId?: string;
  userId?: string;
  sessionId?: string;
  context: Record<string, any>;
  tags: string[];
  
  // Recovery information
  recoveryAttempts: DLQRecoveryAttempt[];
  manualInterventionRequired: boolean;
  escalated: boolean;
}

/**
 * DLQ status
 */
export enum DLQStatus {
  PENDING = 'pending',           // Waiting for retry
  PROCESSING = 'processing',     // Being processed
  RECOVERED = 'recovered',       // Successfully recovered
  FAILED = 'failed',            // Permanently failed
  MANUAL = 'manual',            // Requires manual intervention
  ARCHIVED = 'archived'         // Archived for historical purposes
}

/**
 * DLQ priority levels
 */
export enum DLQPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4,
  URGENT = 5
}

/**
 * DLQ retry policy
 */
export interface DLQRetryPolicy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterEnabled: boolean;
  
  // Escalation settings
  escalateAfterAttempts: number;
  escalateAfterDuration: number; // milliseconds
  
  // Recovery settings
  autoRecoveryEnabled: boolean;
  manualRecoveryRequired: boolean;
}

/**
 * DLQ recovery attempt
 */
export interface DLQRecoveryAttempt {
  attemptNumber: number;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  success: boolean;
  error?: CategorizedError;
  recoveryMethod: DLQRecoveryMethod;
  notes?: string;
}

/**
 * DLQ recovery methods
 */
export enum DLQRecoveryMethod {
  AUTOMATIC_RETRY = 'automatic_retry',
  MANUAL_RETRY = 'manual_retry',
  COMPENSATION = 'compensation',
  DATA_REPAIR = 'data_repair',
  ROLLBACK = 'rollback',
  ESCALATION = 'escalation'
}

/**
 * DLQ processing result
 */
export interface DLQProcessingResult {
  success: boolean;
  itemId: string;
  recoveryMethod: DLQRecoveryMethod;
  result?: any;
  error?: CategorizedError;
  duration: number;
  requiresEscalation: boolean;
}

/**
 * DLQ filter for querying items
 */
export interface DLQFilter {
  status?: DLQStatus[];
  priority?: DLQPriority[];
  operationType?: string[];
  errorCategory?: ErrorCategory[];
  userId?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  tags?: string[];
  requiresManualIntervention?: boolean;
}

/**
 * DLQ statistics
 */
export interface DLQStats {
  totalItems: number;
  itemsByStatus: Record<DLQStatus, number>;
  itemsByPriority: Record<DLQPriority, number>;
  itemsByOperationType: Record<string, number>;
  averageRecoveryTime: number;
  recoveryRate: number;
  escalationRate: number;
  oldestPendingItem?: Date;
}

/**
 * Dead Letter Queue Manager
 */
export class DeadLetterQueueManager {
  private realtimeDB: Database;
  private firestore: Firestore;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  
  // Processing state
  private isProcessing: boolean = false;
  private processingInterval?: NodeJS.Timeout;
  private recoveryHandlers: Map<string, DLQRecoveryHandler> = new Map();
  
  constructor(dependencies: {
    realtimeDB: Database;
    firestore: Firestore;
    logger: IStructuredLogger;
    metrics: IMetricsCollector;
  }) {
    this.realtimeDB = dependencies.realtimeDB;
    this.firestore = dependencies.firestore;
    this.logger = dependencies.logger;
    this.metrics = dependencies.metrics;
    
    this.initializeDLQ();
  }
  
  /**
   * Initialize DLQ system
   */
  private async initializeDLQ(): Promise<void> {
    this.logger.info('Initializing Dead Letter Queue Manager');
    
    // Start background processing
    this.startBackgroundProcessing();
    
    // Register default recovery handlers
    this.registerDefaultRecoveryHandlers();
  }
  
  /**
   * Add item to dead letter queue
   */
  async addToDLQ(
    originalOperationId: string,
    operationType: string,
    payload: any,
    error: CategorizedError,
    context: Partial<DLQItem> = {}
  ): Promise<string> {
    const dlqId = `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const dlqItem: DLQItem = {
        id: dlqId,
        originalOperationId,
        operationType,
        payload,
        error,
        failureReason: error.message,
        failureCount: 1,
        createdAt: new Date(),
        lastFailedAt: new Date(),
        status: DLQStatus.PENDING,
        priority: this.determinePriority(error, operationType),
        retryPolicy: this.getRetryPolicy(operationType, error),
        correlationId: context.correlationId,
        userId: context.userId,
        sessionId: context.sessionId,
        context: context.context || {},
        tags: context.tags || [],
        recoveryAttempts: [],
        manualInterventionRequired: this.requiresManualIntervention(error),
        escalated: false,
        ...context
      };
      
      // Store in Firestore for persistence
      await this.firestore.collection('dlq_items').doc(dlqId).set({
        ...dlqItem,
        createdAt: dlqItem.createdAt.toISOString(),
        lastFailedAt: dlqItem.lastFailedAt.toISOString(),
        nextRetryAt: dlqItem.nextRetryAt?.toISOString()
      });
      
      // Add to Realtime Database for processing queue
      await this.realtimeDB.ref(`dlq/pending/${dlqItem.priority}/${dlqId}`).set({
        id: dlqId,
        operationType,
        priority: dlqItem.priority,
        createdAt: dlqItem.createdAt.toISOString(),
        status: dlqItem.status
      });
      
      this.logger.warn('Item added to Dead Letter Queue', {
        dlqId,
        originalOperationId,
        operationType,
        errorCode: error.code,
        priority: dlqItem.priority,
        manualInterventionRequired: dlqItem.manualInterventionRequired
      });
      
      this.metrics.increment('dlq.items_added', 1, {
        operation_type: operationType,
        error_category: error.category,
        priority: dlqItem.priority.toString(),
        manual_intervention: dlqItem.manualInterventionRequired.toString()
      });
      
      // Trigger immediate processing for high priority items
      if (dlqItem.priority >= DLQPriority.HIGH) {
        this.processHighPriorityItems();
      }
      
      return dlqId;
      
    } catch (err) {
      this.logger.error('Failed to add item to DLQ', {
        originalOperationId,
        operationType,
        error: (err as Error).message
      });
      
      throw err;
    }
  }
  
  /**
   * Process DLQ items
   */
  async processDLQItems(filter?: DLQFilter, limit: number = 10): Promise<DLQProcessingResult[]> {
    if (this.isProcessing) {
      this.logger.debug('DLQ processing already in progress');
      return [];
    }
    
    this.isProcessing = true;
    const results: DLQProcessingResult[] = [];
    
    try {
      this.logger.info('Starting DLQ processing', { limit, filter });
      
      // Get pending items
      const items = await this.getPendingItems(filter, limit);
      
      if (items.length === 0) {
        this.logger.debug('No pending DLQ items to process');
        return results;
      }
      
      this.logger.info('Processing DLQ items', { count: items.length });
      
      // Process items in parallel with concurrency limit
      const concurrency = 3;
      const chunks = this.chunkArray(items, concurrency);
      
      for (const chunk of chunks) {
        const chunkResults = await Promise.allSettled(
          chunk.map(item => this.processDLQItem(item))
        );
        
        chunkResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            this.logger.error('Failed to process DLQ item', {
              itemId: chunk[index].id,
              error: result.reason.message
            });
          }
        });
      }
      
      this.logger.info('DLQ processing completed', {
        totalProcessed: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      });
      
      return results;
      
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Process individual DLQ item
   */
  private async processDLQItem(item: DLQItem): Promise<DLQProcessingResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Processing DLQ item', {
        itemId: item.id,
        operationType: item.operationType,
        attemptNumber: item.recoveryAttempts.length + 1
      });
      
      // Update status to processing
      await this.updateItemStatus(item.id, DLQStatus.PROCESSING);
      
      // Check if manual intervention is required
      if (item.manualInterventionRequired) {
        await this.updateItemStatus(item.id, DLQStatus.MANUAL);
        
        return {
          success: false,
          itemId: item.id,
          recoveryMethod: DLQRecoveryMethod.ESCALATION,
          duration: Date.now() - startTime,
          requiresEscalation: true,
          error: item.error
        };
      }
      
      // Get recovery handler
      const handler = this.recoveryHandlers.get(item.operationType);
      if (!handler) {
        throw new Error(`No recovery handler found for operation type: ${item.operationType}`);
      }
      
      // Attempt recovery
      const recoveryResult = await handler.recover(item);
      
      // Record recovery attempt
      const attempt: DLQRecoveryAttempt = {
        attemptNumber: item.recoveryAttempts.length + 1,
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime,
        success: recoveryResult.success,
        error: recoveryResult.error,
        recoveryMethod: recoveryResult.method,
        notes: recoveryResult.notes
      };
      
      item.recoveryAttempts.push(attempt);
      
      if (recoveryResult.success) {
        // Recovery successful
        await this.updateItemStatus(item.id, DLQStatus.RECOVERED);
        
        this.logger.info('DLQ item recovered successfully', {
          itemId: item.id,
          recoveryMethod: recoveryResult.method,
          duration: attempt.duration
        });
        
        this.metrics.increment('dlq.items_recovered', 1, {
          operation_type: item.operationType,
          recovery_method: recoveryResult.method,
          attempt_number: attempt.attemptNumber.toString()
        });
        
        return {
          success: true,
          itemId: item.id,
          recoveryMethod: recoveryResult.method,
          result: recoveryResult.result,
          duration: attempt.duration!,
          requiresEscalation: false
        };
        
      } else {
        // Recovery failed
        item.failureCount++;
        item.lastFailedAt = new Date();
        
        // Check if we should escalate or retry
        const shouldEscalate = this.shouldEscalate(item);
        
        if (shouldEscalate) {
          await this.escalateItem(item);
          
          return {
            success: false,
            itemId: item.id,
            recoveryMethod: DLQRecoveryMethod.ESCALATION,
            error: recoveryResult.error,
            duration: attempt.duration!,
            requiresEscalation: true
          };
          
        } else {
          // Schedule retry
          const nextRetryDelay = this.calculateRetryDelay(item);
          item.nextRetryAt = new Date(Date.now() + nextRetryDelay);
          
          await this.updateItemStatus(item.id, DLQStatus.PENDING);
          await this.persistItem(item);
          
          this.logger.warn('DLQ item recovery failed, scheduled for retry', {
            itemId: item.id,
            nextRetryAt: item.nextRetryAt.toISOString(),
            failureCount: item.failureCount
          });
          
          return {
            success: false,
            itemId: item.id,
            recoveryMethod: recoveryResult.method,
            error: recoveryResult.error,
            duration: attempt.duration!,
            requiresEscalation: false
          };
        }
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('DLQ item processing failed', {
        itemId: item.id,
        error: (error as Error).message,
        duration
      });
      
      // Update item status to failed
      await this.updateItemStatus(item.id, DLQStatus.FAILED);
      
      return {
        success: false,
        itemId: item.id,
        recoveryMethod: DLQRecoveryMethod.AUTOMATIC_RETRY,
        error: error as CategorizedError,
        duration,
        requiresEscalation: true
      };
    }
  }
  
  /**
   * Get pending DLQ items
   */
  private async getPendingItems(filter?: DLQFilter, limit: number = 10): Promise<DLQItem[]> {
    let query = this.firestore.collection('dlq_items')
      .where('status', '==', DLQStatus.PENDING)
      .orderBy('priority', 'desc')
      .orderBy('createdAt', 'asc')
      .limit(limit);
    
    // Apply filters
    if (filter) {
      if (filter.operationType && filter.operationType.length > 0) {
        query = query.where('operationType', 'in', filter.operationType);
      }
      if (filter.priority && filter.priority.length > 0) {
        query = query.where('priority', 'in', filter.priority);
      }
      if (filter.userId) {
        query = query.where('userId', '==', filter.userId);
      }
      if (filter.createdAfter) {
        query = query.where('createdAt', '>=', filter.createdAfter.toISOString());
      }
      if (filter.createdBefore) {
        query = query.where('createdAt', '<=', filter.createdBefore.toISOString());
      }
    }
    
    const snapshot = await query.get();
    const items: DLQItem[] = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      items.push({
        ...data,
        createdAt: new Date(data.createdAt),
        lastFailedAt: new Date(data.lastFailedAt),
        nextRetryAt: data.nextRetryAt ? new Date(data.nextRetryAt) : undefined,
        recoveryAttempts: data.recoveryAttempts || []
      } as DLQItem);
    });
    
    // Filter by nextRetryAt if specified
    const now = new Date();
    return items.filter(item => !item.nextRetryAt || item.nextRetryAt <= now);
  }
  
  /**
   * Determine priority for DLQ item
   */
  private determinePriority(error: CategorizedError, operationType: string): DLQPriority {
    // High priority for critical errors
    if (error.severity === ErrorSeverity.CRITICAL || error.severity === ErrorSeverity.FATAL) {
      return DLQPriority.CRITICAL;
    }
    
    // High priority for payment operations
    if (operationType.includes('payment')) {
      return DLQPriority.HIGH;
    }
    
    // High priority for user-facing operations
    if (operationType.includes('user') || operationType.includes('notification')) {
      return DLQPriority.HIGH;
    }
    
    // Medium priority for high severity errors
    if (error.severity === ErrorSeverity.HIGH) {
      return DLQPriority.HIGH;
    }
    
    return DLQPriority.NORMAL;
  }
  
  /**
   * Get retry policy for operation type
   */
  private getRetryPolicy(operationType: string, error: CategorizedError): DLQRetryPolicy {
    const basePolicy: DLQRetryPolicy = {
      maxRetries: 3,
      baseDelay: 60000, // 1 minute
      maxDelay: 3600000, // 1 hour
      backoffMultiplier: 2,
      jitterEnabled: true,
      escalateAfterAttempts: 3,
      escalateAfterDuration: 3600000, // 1 hour
      autoRecoveryEnabled: true,
      manualRecoveryRequired: false
    };
    
    // Customize based on operation type
    if (operationType.includes('payment')) {
      return {
        ...basePolicy,
        maxRetries: 2,
        escalateAfterAttempts: 2,
        manualRecoveryRequired: true
      };
    }
    
    if (operationType.includes('critical')) {
      return {
        ...basePolicy,
        maxRetries: 5,
        baseDelay: 30000, // 30 seconds
        escalateAfterAttempts: 2
      };
    }
    
    return basePolicy;
  }
  
  /**
   * Check if manual intervention is required
   */
  private requiresManualIntervention(error: CategorizedError): boolean {
    // Require manual intervention for security violations
    if (error.category === ErrorCategory.SECURITY_VIOLATION || 
        error.category === ErrorCategory.FRAUD_DETECTION) {
      return true;
    }
    
    // Require manual intervention for data corruption
    if (error.category === ErrorCategory.DATA_CORRUPTION) {
      return true;
    }
    
    // Require manual intervention for fatal errors
    if (error.severity === ErrorSeverity.FATAL) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if item should be escalated
   */
  private shouldEscalate(item: DLQItem): boolean {
    // Escalate if max retries exceeded
    if (item.recoveryAttempts.length >= item.retryPolicy.maxRetries) {
      return true;
    }
    
    // Escalate if item is too old
    const age = Date.now() - item.createdAt.getTime();
    if (age >= item.retryPolicy.escalateAfterDuration) {
      return true;
    }
    
    // Escalate if manual intervention is required
    if (item.manualInterventionRequired) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Calculate retry delay
   */
  private calculateRetryDelay(item: DLQItem): number {
    const attempt = item.recoveryAttempts.length;
    let delay = item.retryPolicy.baseDelay * Math.pow(item.retryPolicy.backoffMultiplier, attempt);
    
    delay = Math.min(delay, item.retryPolicy.maxDelay);
    
    if (item.retryPolicy.jitterEnabled) {
      const jitter = delay * 0.1 * (Math.random() - 0.5) * 2;
      delay += jitter;
    }
    
    return Math.max(delay, 0);
  }
  
  /**
   * Escalate DLQ item
   */
  private async escalateItem(item: DLQItem): Promise<void> {
    item.escalated = true;
    item.status = DLQStatus.MANUAL;
    
    await this.updateItemStatus(item.id, DLQStatus.MANUAL);
    await this.persistItem(item);
    
    this.logger.error('DLQ item escalated for manual intervention', {
      itemId: item.id,
      operationType: item.operationType,
      failureCount: item.failureCount,
      age: Date.now() - item.createdAt.getTime()
    });
    
    this.metrics.increment('dlq.items_escalated', 1, {
      operation_type: item.operationType,
      failure_count: item.failureCount.toString()
    });
    
    // TODO: Send alert to operations team
  }
  
  /**
   * Update item status
   */
  private async updateItemStatus(itemId: string, status: DLQStatus): Promise<void> {
    await this.firestore.collection('dlq_items').doc(itemId).update({ status });
    
    // Update in Realtime Database based on status
    if (status === DLQStatus.PENDING) {
      // Move back to pending queue
      const item = await this.getDLQItem(itemId);
      if (item) {
        await this.realtimeDB.ref(`dlq/pending/${item.priority}/${itemId}`).set({
          id: itemId,
          operationType: item.operationType,
          priority: item.priority,
          status
        });
      }
    } else {
      // Remove from pending queue
      const pendingRef = this.realtimeDB.ref('dlq/pending');
      const snapshot = await pendingRef.orderByChild('id').equalTo(itemId).once('value');
      
      snapshot.forEach(child => {
        child.ref.remove();
      });
    }
  }
  
  /**
   * Persist DLQ item
   */
  private async persistItem(item: DLQItem): Promise<void> {
    await this.firestore.collection('dlq_items').doc(item.id).update({
      ...item,
      createdAt: item.createdAt.toISOString(),
      lastFailedAt: item.lastFailedAt.toISOString(),
      nextRetryAt: item.nextRetryAt?.toISOString()
    });
  }
  
  /**
   * Get DLQ item by ID
   */
  async getDLQItem(itemId: string): Promise<DLQItem | null> {
    const doc = await this.firestore.collection('dlq_items').doc(itemId).get();
    
    if (!doc.exists) {
      return null;
    }
    
    const data = doc.data()!;
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      lastFailedAt: new Date(data.lastFailedAt),
      nextRetryAt: data.nextRetryAt ? new Date(data.nextRetryAt) : undefined,
      recoveryAttempts: data.recoveryAttempts || []
    } as DLQItem;
  }
  
  /**
   * Start background processing
   */
  private startBackgroundProcessing(): void {
    // Process DLQ items every 5 minutes
    this.processingInterval = setInterval(async () => {
      try {
        await this.processDLQItems();
      } catch (error) {
        this.logger.error('Background DLQ processing failed', {
          error: (error as Error).message
        });
      }
    }, 5 * 60 * 1000);
    
    this.logger.info('Started background DLQ processing');
  }
  
  /**
   * Process high priority items immediately
   */
  private async processHighPriorityItems(): Promise<void> {
    try {
      const filter: DLQFilter = {
        priority: [DLQPriority.CRITICAL, DLQPriority.URGENT, DLQPriority.HIGH]
      };
      
      await this.processDLQItems(filter, 5);
    } catch (error) {
      this.logger.error('High priority DLQ processing failed', {
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Register default recovery handlers
   */
  private registerDefaultRecoveryHandlers(): void {
    // Default retry handler
    this.registerRecoveryHandler('default', new DefaultRecoveryHandler());
    
    // Add more specific handlers as needed
    this.logger.info('Registered default DLQ recovery handlers');
  }
  
  /**
   * Register recovery handler for operation type
   */
  registerRecoveryHandler(operationType: string, handler: DLQRecoveryHandler): void {
    this.recoveryHandlers.set(operationType, handler);
    
    this.logger.info('Registered DLQ recovery handler', { operationType });
  }
  
  /**
   * Utility method to chunk array
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  
  /**
   * Get DLQ statistics
   */
  async getStats(): Promise<DLQStats> {
    const snapshot = await this.firestore.collection('dlq_items').get();
    
    const stats: DLQStats = {
      totalItems: snapshot.size,
      itemsByStatus: {} as Record<DLQStatus, number>,
      itemsByPriority: {} as Record<DLQPriority, number>,
      itemsByOperationType: {},
      averageRecoveryTime: 0,
      recoveryRate: 0,
      escalationRate: 0
    };
    
    let totalRecoveryTime = 0;
    let recoveredCount = 0;
    let escalatedCount = 0;
    let oldestPending: Date | undefined;
    
    // Initialize counters
    Object.values(DLQStatus).forEach(status => {
      stats.itemsByStatus[status] = 0;
    });
    
    Object.values(DLQPriority).forEach(priority => {
      if (typeof priority === 'number') {
        stats.itemsByPriority[priority] = 0;
      }
    });
    
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Count by status
      stats.itemsByStatus[data.status as DLQStatus]++;
      
      // Count by priority
      stats.itemsByPriority[data.priority as DLQPriority]++;
      
      // Count by operation type
      stats.itemsByOperationType[data.operationType] = 
        (stats.itemsByOperationType[data.operationType] || 0) + 1;
      
      // Calculate recovery metrics
      if (data.status === DLQStatus.RECOVERED) {
        recoveredCount++;
        if (data.recoveryAttempts && data.recoveryAttempts.length > 0) {
          const lastAttempt = data.recoveryAttempts[data.recoveryAttempts.length - 1];
          if (lastAttempt.duration) {
            totalRecoveryTime += lastAttempt.duration;
          }
        }
      }
      
      if (data.escalated) {
        escalatedCount++;
      }
      
      // Find oldest pending item
      if (data.status === DLQStatus.PENDING) {
        const createdAt = new Date(data.createdAt);
        if (!oldestPending || createdAt < oldestPending) {
          oldestPending = createdAt;
        }
      }
    });
    
    // Calculate rates and averages
    if (recoveredCount > 0) {
      stats.averageRecoveryTime = totalRecoveryTime / recoveredCount;
    }
    
    if (stats.totalItems > 0) {
      stats.recoveryRate = recoveredCount / stats.totalItems;
      stats.escalationRate = escalatedCount / stats.totalItems;
    }
    
    stats.oldestPendingItem = oldestPending;
    
    return stats;
  }
  
  /**
   * Cleanup old DLQ items
   */
  async cleanup(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000));
    
    const query = this.firestore.collection('dlq_items')
      .where('status', 'in', [DLQStatus.RECOVERED, DLQStatus.ARCHIVED])
      .where('createdAt', '<', cutoffDate.toISOString());
    
    const snapshot = await query.get();
    const batch = this.firestore.batch();
    
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    this.logger.info('Cleaned up old DLQ items', {
      count: snapshot.size,
      olderThanDays
    });
    
    return snapshot.size;
  }
  
  /**
   * Stop DLQ manager
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    
    this.logger.info('Stopped DLQ manager');
  }
}

/**
 * DLQ recovery handler interface
 */
export interface DLQRecoveryHandler {
  recover(item: DLQItem): Promise<DLQRecoveryResult>;
}

/**
 * DLQ recovery result
 */
export interface DLQRecoveryResult {
  success: boolean;
  method: DLQRecoveryMethod;
  result?: any;
  error?: CategorizedError;
  notes?: string;
}

/**
 * Default recovery handler that simply retries the original operation
 */
class DefaultRecoveryHandler implements DLQRecoveryHandler {
  async recover(item: DLQItem): Promise<DLQRecoveryResult> {
    try {
      // This is a placeholder - in practice, you would implement
      // the actual recovery logic based on the operation type
      
      // For now, we'll simulate a recovery attempt
      const success = Math.random() > 0.5; // 50% success rate for demo
      
      if (success) {
        return {
          success: true,
          method: DLQRecoveryMethod.AUTOMATIC_RETRY,
          result: { recovered: true },
          notes: 'Successfully recovered using default retry logic'
        };
      } else {
        throw new Error('Simulated recovery failure');
      }
      
    } catch (error) {
      return {
        success: false,
        method: DLQRecoveryMethod.AUTOMATIC_RETRY,
        error: error as CategorizedError,
        notes: `Recovery failed: ${(error as Error).message}`
      };
    }
  }
}