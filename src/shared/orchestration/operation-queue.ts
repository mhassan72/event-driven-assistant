/**
 * Operation Queue Management
 * Handles queuing, retry mechanisms, and failure recovery for orchestrated operations
 */

import { Database } from 'firebase-admin/database';
import { Firestore } from 'firebase-admin/firestore';
import {
  RetryPolicy,
  ExecutionStatus,
  ErrorSeverity,
  EventPriority
} from '../types/orchestration';
import { IStructuredLogger } from '../observability/logger';
import { IMetricsCollector } from '../observability/metrics';
import { IEventBus } from '../types/orchestration';

/**
 * Dependencies for operation queue
 */
export interface OperationQueueDependencies {
  realtimeDB: Database;
  firestore: Firestore;
  eventBus: IEventBus;
  logger: IStructuredLogger;
  metrics: IMetricsCollector;
}

/**
 * Operation queue item
 */
export interface QueuedOperation {
  id: string;
  type: OperationType;
  payload: any;
  priority: OperationPriority;
  retryPolicy: RetryPolicy;
  status: OperationStatus;
  createdAt: Date;
  scheduledAt: Date;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  attemptCount: number;
  maxAttempts: number;
  errors: OperationError[];
  correlationId: string;
  userId?: string;
  metadata: Record<string, any>;
}

/**
 * Operation execution result
 */
export interface OperationResult {
  operationId: string;
  status: ExecutionStatus;
  result?: any;
  error?: OperationError;
  executionTime: number;
  resourcesUsed: ResourceUsage;
}

/**
 * Operation error details
 */
export interface OperationError {
  code: string;
  message: string;
  timestamp: Date;
  retryable: boolean;
  severity: ErrorSeverity;
  context?: Record<string, any>;
}

/**
 * Resource usage tracking
 */
export interface ResourceUsage {
  cpuTimeMs: number;
  memoryMB: number;
  networkBytes: number;
  storageOperations: number;
}

/**
 * Operation types
 */
export enum OperationType {
  CREDIT_DEDUCTION = 'credit_deduction',
  CREDIT_ADDITION = 'credit_addition',
  AI_CONVERSATION = 'ai_conversation',
  IMAGE_GENERATION = 'image_generation',
  PAYMENT_PROCESSING = 'payment_processing',
  BLOCKCHAIN_LEDGER = 'blockchain_ledger',
  USER_NOTIFICATION = 'user_notification'
}

/**
 * Operation priority levels
 */
export enum OperationPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4,
  URGENT = 5
}

/**
 * Operation status
 */
export enum OperationStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  RETRY_SCHEDULED = 'retry_scheduled',
  DLQ = 'dlq'
}

/**
 * Operation queue manager with exponential backoff and failure recovery
 */
export class OperationQueue {
  private realtimeDB: Database;
  private firestore: Firestore;
  private eventBus: IEventBus;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  
  // Internal state
  private queues: Map<OperationPriority, PriorityQueue> = new Map();
  private processors: Map<OperationType, OperationProcessor> = new Map();
  private retryScheduler: RetryScheduler;
  private dlqManager: DeadLetterQueueManager;
  private isProcessing: boolean = false;
  
  constructor(dependencies: OperationQueueDependencies) {
    this.realtimeDB = dependencies.realtimeDB;
    this.firestore = dependencies.firestore;
    this.eventBus = dependencies.eventBus;
    this.logger = dependencies.logger;
    this.metrics = dependencies.metrics;
    
    this.retryScheduler = new RetryScheduler(dependencies);
    this.dlqManager = new DeadLetterQueueManager(dependencies);
    
    this.initializeQueue();
  }
  
  // ============================================================================
  // Queue Management
  // ============================================================================
  
  /**
   * Add operation to queue
   */
  async enqueue(operation: Omit<QueuedOperation, 'id' | 'status' | 'createdAt' | 'attemptCount' | 'errors'>): Promise<string> {
    const operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const queuedOperation: QueuedOperation = {
        id: operationId,
        ...operation,
        status: OperationStatus.QUEUED,
        createdAt: new Date(),
        attemptCount: 0,
        errors: []
      };
      
      this.logger.info('Enqueuing operation', {
        operationId,
        type: operation.type,
        priority: operation.priority,
        correlationId: operation.correlationId
      });
      
      // Add to appropriate priority queue
      const priorityQueue = this.getOrCreatePriorityQueue(operation.priority);
      await priorityQueue.enqueue(queuedOperation);
      
      // Persist to Firestore
      await this.persistOperation(queuedOperation);
      
      // Store in Realtime Database for real-time updates
      await this.realtimeDB.ref(`operations/queued/${operationId}`).set({
        id: operationId,
        type: operation.type,
        priority: operation.priority,
        status: OperationStatus.QUEUED,
        createdAt: queuedOperation.createdAt.toISOString(),
        correlationId: operation.correlationId
      });
      
      // Update metrics
      this.metrics.counter('operation_queue.enqueued', 1, {
        operation_type: operation.type,
        priority: operation.priority.toString()
      });
      
      this.metrics.gauge('operation_queue.depth', await this.getTotalQueueDepth());
      
      // Trigger processing if not already running
      if (!this.isProcessing) {
        this.startProcessing();
      }
      
      return operationId;
      
    } catch (error) {
      this.logger.error('Failed to enqueue operation', {
        operationId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      this.metrics.counter('operation_queue.enqueue_errors', 1, {
        operation_type: operation.type,
        error_type: this.categorizeError(errorInstance)
      });
      
      throw errorInstance;
    }
  }
  
  /**
   * Get operation status
   */
  async getOperationStatus(operationId: string): Promise<QueuedOperation | null> {
    try {
      // First check active queues
      for (const queue of this.queues.values()) {
        const operation = await queue.findOperation(operationId);
        if (operation) {
          return operation;
        }
      }
      
      // Check persistence
      const doc = await this.firestore.collection('operations').doc(operationId).get();
      if (doc.exists) {
        const data = doc.data()!;
        return {
          ...data,
          createdAt: new Date(data.createdAt),
          scheduledAt: new Date(data.scheduledAt),
          lastAttemptAt: data.lastAttemptAt ? new Date(data.lastAttemptAt) : undefined,
          nextRetryAt: data.nextRetryAt ? new Date(data.nextRetryAt) : undefined,
          errors: data.errors || []
        } as QueuedOperation;
      }
      
      return null;
      
    } catch (error) {
      this.logger.error('Failed to get operation status', {
        operationId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return null;
    }
  }
  
  /**
   * Cancel operation
   */
  async cancelOperation(operationId: string): Promise<boolean> {
    try {
      this.logger.info('Cancelling operation', { operationId });
      
      // Find and remove from queues
      for (const queue of this.queues.values()) {
        const removed = await queue.removeOperation(operationId);
        if (removed) {
          // Update status
          removed.status = OperationStatus.CANCELLED;
          await this.persistOperation(removed);
          
          // Remove from Realtime Database
          await this.realtimeDB.ref(`operations/queued/${operationId}`).remove();
          
          this.metrics.counter('operation_queue.cancelled', 1, {
            operation_type: removed.type
          });
          
          return true;
        }
      }
      
      return false;
      
    } catch (error) {
      this.logger.error('Failed to cancel operation', {
        operationId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return false;
    }
  }
  
  // ============================================================================
  // Operation Processing
  // ============================================================================
  
  /**
   * Start processing operations from queues
   */
  private async startProcessing(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    
    this.isProcessing = true;
    this.logger.info('Starting operation queue processing');
    
    try {
      while (this.isProcessing) {
        const operation = await this.getNextOperation();
        
        if (operation) {
          await this.processOperation(operation);
        } else {
          // No operations available, wait before checking again
          await this.sleep(1000);
        }
      }
    } catch (error) {
      this.logger.error('Operation processing loop failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Get next operation to process (priority-based)
   */
  private async getNextOperation(): Promise<QueuedOperation | null> {
    // Process in priority order (highest first)
    const priorities = [
      OperationPriority.URGENT,
      OperationPriority.CRITICAL,
      OperationPriority.HIGH,
      OperationPriority.NORMAL,
      OperationPriority.LOW
    ];
    
    for (const priority of priorities) {
      const queue = this.queues.get(priority);
      if (queue) {
        const operation = await queue.dequeue();
        if (operation) {
          return operation;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Process individual operation
   */
  private async processOperation(operation: QueuedOperation): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Processing operation', {
        operationId: operation.id,
        type: operation.type,
        attempt: operation.attemptCount + 1
      });
      
      // Update status
      operation.status = OperationStatus.PROCESSING;
      operation.lastAttemptAt = new Date();
      operation.attemptCount++;
      
      await this.persistOperation(operation);
      
      // Update Realtime Database
      await this.realtimeDB.ref(`operations/processing/${operation.id}`).set({
        id: operation.id,
        type: operation.type,
        status: OperationStatus.PROCESSING,
        attemptCount: operation.attemptCount,
        lastAttemptAt: operation.lastAttemptAt.toISOString()
      });
      
      // Get processor for operation type
      const processor = this.processors.get(operation.type);
      if (!processor) {
        throw new Error(`No processor found for operation type: ${operation.type}`);
      }
      
      // Execute operation
      const result = await processor.execute(operation);
      
      // Handle successful execution
      await this.handleOperationSuccess(operation, result, Date.now() - startTime);
      
    } catch (error) {
      // Handle operation failure
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      await this.handleOperationFailure(operation, errorInstance, Date.now() - startTime);
    }
  }
  
  /**
   * Handle successful operation execution
   */
  private async handleOperationSuccess(
    operation: QueuedOperation,
    result: OperationResult,
    executionTime: number
  ): Promise<void> {
    try {
      this.logger.info('Operation completed successfully', {
        operationId: operation.id,
        executionTime
      });
      
      // Update operation status
      operation.status = OperationStatus.COMPLETED;
      await this.persistOperation(operation);
      
      // Move to completed in Realtime Database
      await this.realtimeDB.ref(`operations/processing/${operation.id}`).remove();
      await this.realtimeDB.ref(`operations/completed/${operation.id}`).set({
        id: operation.id,
        type: operation.type,
        status: OperationStatus.COMPLETED,
        completedAt: new Date().toISOString(),
        executionTime
      });
      
      // Publish success event
      await this.eventBus.publish({
        id: `op_success_${operation.id}`,
        type: 'operation.completed',
        data: {
          operationId: operation.id,
          operationType: operation.type,
          result,
          executionTime
        },
        timestamp: new Date(),
        correlationId: operation.correlationId,
        metadata: {
          userId: operation.userId,
          source: 'operation_queue',
          environment: 'production',
          traceId: operation.correlationId,
          spanId: operation.id,
          priority: EventPriority.NORMAL
        }
      });
      
      // Update metrics
      this.metrics.counter('operation_queue.completed', 1, {
        operation_type: operation.type
      });
      
      this.metrics.histogram('operation_queue.execution_time', executionTime, {
        operation_type: operation.type,
        priority: operation.priority.toString()
      });
      
    } catch (error) {
      this.logger.error('Failed to handle operation success', {
        operationId: operation.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Handle operation failure with retry logic
   */
  private async handleOperationFailure(
    operation: QueuedOperation,
    error: Error,
    executionTime: number
  ): Promise<void> {
    try {
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Operation failed', {
        operationId: operation.id,
        attempt: operation.attemptCount,
        error: errorInstance.message,
        executionTime
      });
      
      // Create operation error
      const operationError: OperationError = {
        code: this.getErrorCode(errorInstance),
        message: errorInstance.message,
        timestamp: new Date(),
        retryable: this.isRetryableError(errorInstance),
        severity: this.getErrorSeverity(errorInstance),
        context: {
          attempt: operation.attemptCount,
          executionTime
        }
      };
      
      operation.errors.push(operationError);
      
      // Determine if retry is possible
      const shouldRetry = this.shouldRetryOperation(operation, operationError);
      
      if (shouldRetry) {
        // Schedule retry
        await this.scheduleRetry(operation);
      } else {
        // Send to DLQ or mark as failed
        if (this.isCriticalOperation(operation)) {
          await this.dlqManager.addOperation(operation, operationError);
          operation.status = OperationStatus.DLQ;
        } else {
          operation.status = OperationStatus.FAILED;
        }
        
        await this.persistOperation(operation);
        
        // Remove from processing
        await this.realtimeDB.ref(`operations/processing/${operation.id}`).remove();
        
        // Publish failure event
        await this.eventBus.publish({
          id: `op_failed_${operation.id}`,
          type: 'operation.failed',
          data: {
            operationId: operation.id,
            operationType: operation.type,
            error: operationError,
            finalAttempt: operation.attemptCount
          },
          timestamp: new Date(),
          correlationId: operation.correlationId,
          metadata: {
            userId: operation.userId,
            source: 'operation_queue',
            environment: 'production',
            traceId: operation.correlationId,
            spanId: operation.id,
            priority: EventPriority.HIGH
          }
        });
      }
      
      // Update metrics
      this.metrics.counter('operation_queue.failed', 1, {
        operation_type: operation.type,
        error_type: this.categorizeError(errorInstance),
        retryable: operationError.retryable.toString()
      });
      
    } catch (error) {
      this.logger.error('Failed to handle operation failure', {
        operationId: operation.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Schedule operation retry with exponential backoff
   */
  private async scheduleRetry(operation: QueuedOperation): Promise<void> {
    const retryDelay = this.calculateRetryDelay(operation);
    operation.nextRetryAt = new Date(Date.now() + retryDelay);
    operation.status = OperationStatus.RETRY_SCHEDULED;
    
    this.logger.info('Scheduling operation retry', {
      operationId: operation.id,
      attempt: operation.attemptCount,
      nextRetryAt: operation.nextRetryAt,
      delayMs: retryDelay
    });
    
    await this.persistOperation(operation);
    
    // Schedule with retry scheduler
    await this.retryScheduler.scheduleRetry(operation);
    
    // Remove from processing
    await this.realtimeDB.ref(`operations/processing/${operation.id}`).remove();
    
    this.metrics.counter('operation_queue.retries_scheduled', 1, {
      operation_type: operation.type,
      attempt: operation.attemptCount.toString()
    });
  }
  
  // ============================================================================
  // Helper Methods
  // ============================================================================
  
  private async initializeQueue(): Promise<void> {
    this.logger.info('Initializing operation queue');
    
    // Initialize priority queues
    for (const priority of Object.values(OperationPriority)) {
      if (typeof priority === 'number') {
        this.queues.set(priority, new PriorityQueue(priority));
      }
    }
    
    // Register operation processors
    this.registerOperationProcessors();
    
    // Start retry scheduler
    await this.retryScheduler.start();
    
    // Start DLQ manager
    await this.dlqManager.start();
    
    // Recover pending operations
    await this.recoverPendingOperations();
    
    // Initialize metrics
    this.initializeMetrics();
  }
  
  private registerOperationProcessors(): void {
    this.processors.set(OperationType.CREDIT_DEDUCTION, new CreditDeductionProcessor());
    this.processors.set(OperationType.CREDIT_ADDITION, new CreditAdditionProcessor());
    this.processors.set(OperationType.AI_CONVERSATION, new AIConversationProcessor());
    this.processors.set(OperationType.IMAGE_GENERATION, new ImageGenerationProcessor());
    this.processors.set(OperationType.PAYMENT_PROCESSING, new PaymentProcessingProcessor());
    this.processors.set(OperationType.BLOCKCHAIN_LEDGER, new BlockchainLedgerProcessor());
    this.processors.set(OperationType.USER_NOTIFICATION, new UserNotificationProcessor());
  }
  
  private async recoverPendingOperations(): Promise<void> {
    try {
      this.logger.info('Recovering pending operations');
      
      // Query for operations that were processing when system went down
      const pendingSnapshot = await this.firestore
        .collection('operations')
        .where('status', 'in', [OperationStatus.PROCESSING, OperationStatus.RETRY_SCHEDULED])
        .get();
      
      for (const doc of pendingSnapshot.docs) {
        const operation = this.deserializeOperation(doc.data());
        
        if (operation.status === OperationStatus.PROCESSING) {
          // Re-queue for processing
          const priorityQueue = this.getOrCreatePriorityQueue(operation.priority);
          await priorityQueue.enqueue(operation);
        } else if (operation.status === OperationStatus.RETRY_SCHEDULED) {
          // Re-schedule retry
          await this.retryScheduler.scheduleRetry(operation);
        }
      }
      
      this.logger.info('Operation recovery completed');
      
    } catch (error) {
      this.logger.error('Failed to recover pending operations', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
  
  private getOrCreatePriorityQueue(priority: OperationPriority): PriorityQueue {
    let queue = this.queues.get(priority);
    if (!queue) {
      queue = new PriorityQueue(priority);
      this.queues.set(priority, queue);
    }
    return queue;
  }
  
  private async persistOperation(operation: QueuedOperation): Promise<void> {
    await this.firestore.collection('operations').doc(operation.id).set({
      ...operation,
      createdAt: operation.createdAt.toISOString(),
      scheduledAt: operation.scheduledAt.toISOString(),
      lastAttemptAt: operation.lastAttemptAt?.toISOString(),
      nextRetryAt: operation.nextRetryAt?.toISOString()
    });
  }
  
  private deserializeOperation(data: any): QueuedOperation {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      scheduledAt: new Date(data.scheduledAt),
      lastAttemptAt: data.lastAttemptAt ? new Date(data.lastAttemptAt) : undefined,
      nextRetryAt: data.nextRetryAt ? new Date(data.nextRetryAt) : undefined,
      errors: data.errors || []
    } as QueuedOperation;
  }
  
  private shouldRetryOperation(operation: QueuedOperation, error: OperationError): boolean {
    return error.retryable && 
           operation.attemptCount < operation.maxAttempts &&
           operation.attemptCount < operation.retryPolicy.maxRetries;
  }
  
  private calculateRetryDelay(operation: QueuedOperation): number {
    const { initialDelayMs, maxDelayMs, backoffMultiplier } = operation.retryPolicy;
    const delay = initialDelayMs * Math.pow(backoffMultiplier, operation.attemptCount - 1);
    return Math.min(delay, maxDelayMs);
  }
  
  private isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'NETWORK_ERROR',
      'TIMEOUT_ERROR',
      'TEMPORARY_UNAVAILABLE',
      'RATE_LIMITED',
      'SERVICE_UNAVAILABLE'
    ];
    
    return retryableErrors.some(errorType => error.message.includes(errorType));
  }
  
  private isCriticalOperation(operation: QueuedOperation): boolean {
    const criticalTypes = [
      OperationType.CREDIT_DEDUCTION,
      OperationType.PAYMENT_PROCESSING,
      OperationType.BLOCKCHAIN_LEDGER
    ];
    
    return criticalTypes.includes(operation.type) || 
           operation.priority >= OperationPriority.CRITICAL;
  }
  
  private getErrorCode(error: Error): string {
    // Extract error code from error message or use default
    const match = error.message.match(/^([A-Z_]+):/);
    return match ? match[1] : 'UNKNOWN_ERROR';
  }
  
  private getErrorSeverity(error: Error): ErrorSeverity {
    if (error.message.includes('CRITICAL')) return ErrorSeverity.CRITICAL;
    if (error.message.includes('HIGH')) return ErrorSeverity.HIGH;
    if (error.message.includes('MEDIUM')) return ErrorSeverity.MEDIUM;
    return ErrorSeverity.LOW;
  }
  
  private categorizeError(error: Error): string {
    if (error.message.includes('NETWORK')) return 'network';
    if (error.message.includes('TIMEOUT')) return 'timeout';
    if (error.message.includes('VALIDATION')) return 'validation';
    if (error.message.includes('BUSINESS')) return 'business';
    if (error.message.includes('SYSTEM')) return 'system';
    return 'unknown';
  }
  
  private getTotalQueueDepth(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.size();
    }
    return total;
  }
  
  private initializeMetrics(): void {
    this.metrics.gauge('operation_queue.total_depth', () => this.getTotalQueueDepth());
    this.metrics.gauge('operation_queue.processors_count', () => this.processors.size);
    this.metrics.gauge('operation_queue.priority_queues', () => this.queues.size);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Supporting Classes
// ============================================================================

class PriorityQueue {
  private _priority: OperationPriority; // Stored for potential future use
  private operations: QueuedOperation[] = [];
  
  constructor(priority: OperationPriority) {
    this._priority = priority;
  }
  
  async enqueue(operation: QueuedOperation): Promise<void> {
    this.operations.push(operation);
    // Sort by scheduled time (FIFO within priority)
    this.operations.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  }
  
  async dequeue(): Promise<QueuedOperation | null> {
    return this.operations.shift() || null;
  }
  
  async findOperation(operationId: string): Promise<QueuedOperation | null> {
    return this.operations.find(op => op.id === operationId) || null;
  }
  
  async removeOperation(operationId: string): Promise<QueuedOperation | null> {
    const index = this.operations.findIndex(op => op.id === operationId);
    if (index >= 0) {
      return this.operations.splice(index, 1)[0];
    }
    return null;
  }
  
  size(): number {
    return this.operations.length;
  }
}

class RetryScheduler {
  private dependencies: OperationQueueDependencies;
  private scheduledRetries: Map<string, NodeJS.Timeout> = new Map();
  
  constructor(dependencies: OperationQueueDependencies) {
    this.dependencies = dependencies;
  }
  
  async start(): Promise<void> {
    this.dependencies.logger.info('Starting retry scheduler');
  }
  
  async scheduleRetry(operation: QueuedOperation): Promise<void> {
    if (!operation.nextRetryAt) {
      return;
    }
    
    const delay = operation.nextRetryAt.getTime() - Date.now();
    
    if (delay > 0) {
      const timeout = setTimeout(async () => {
        await this.executeRetry(operation);
        this.scheduledRetries.delete(operation.id);
      }, delay);
      
      this.scheduledRetries.set(operation.id, timeout);
    } else {
      // Immediate retry
      await this.executeRetry(operation);
    }
  }
  
  private async executeRetry(operation: QueuedOperation): Promise<void> {
    this.dependencies.logger.info('Executing scheduled retry', {
      operationId: operation.id,
      attempt: operation.attemptCount + 1
    });
    
    // Re-queue the operation
    operation.status = OperationStatus.QUEUED;
    // This would re-add to the appropriate queue
  }
}

class DeadLetterQueueManager {
  private dependencies: OperationQueueDependencies;
  
  constructor(dependencies: OperationQueueDependencies) {
    this.dependencies = dependencies;
  }
  
  async start(): Promise<void> {
    this.dependencies.logger.info('Starting DLQ manager');
  }
  
  async addOperation(operation: QueuedOperation, error: OperationError): Promise<void> {
    this.dependencies.logger.info('Adding operation to DLQ', {
      operationId: operation.id,
      error: error.message
    });
    
    // Store in DLQ collection
    await this.dependencies.firestore.collection('dlq_operations').doc(operation.id).set({
      ...operation,
      dlqTimestamp: new Date().toISOString(),
      dlqReason: error.message,
      createdAt: operation.createdAt.toISOString(),
      scheduledAt: operation.scheduledAt.toISOString(),
      lastAttemptAt: operation.lastAttemptAt?.toISOString(),
      nextRetryAt: operation.nextRetryAt?.toISOString()
    });
  }
}

// Mock operation processors
interface OperationProcessor {
  execute(operation: QueuedOperation): Promise<OperationResult>;
}

class CreditDeductionProcessor implements OperationProcessor {
  async execute(operation: QueuedOperation): Promise<OperationResult> {
    // Mock implementation
    return {
      operationId: operation.id,
      status: ExecutionStatus.SUCCESS,
      result: { creditsDeducted: operation.payload.amount },
      executionTime: 100,
      resourcesUsed: { cpuTimeMs: 50, memoryMB: 10, networkBytes: 1024, storageOperations: 2 }
    };
  }
}

class CreditAdditionProcessor implements OperationProcessor {
  async execute(operation: QueuedOperation): Promise<OperationResult> {
    return {
      operationId: operation.id,
      status: ExecutionStatus.SUCCESS,
      result: { creditsAdded: operation.payload.amount },
      executionTime: 80,
      resourcesUsed: { cpuTimeMs: 40, memoryMB: 8, networkBytes: 512, storageOperations: 1 }
    };
  }
}

class AIConversationProcessor implements OperationProcessor {
  async execute(operation: QueuedOperation): Promise<OperationResult> {
    return {
      operationId: operation.id,
      status: ExecutionStatus.SUCCESS,
      result: { response: 'AI response generated' },
      executionTime: 2000,
      resourcesUsed: { cpuTimeMs: 1500, memoryMB: 50, networkBytes: 4096, storageOperations: 3 }
    };
  }
}

class ImageGenerationProcessor implements OperationProcessor {
  async execute(operation: QueuedOperation): Promise<OperationResult> {
    return {
      operationId: operation.id,
      status: ExecutionStatus.SUCCESS,
      result: { imageUrl: 'https://example.com/image.jpg' },
      executionTime: 5000,
      resourcesUsed: { cpuTimeMs: 4000, memoryMB: 200, networkBytes: 10240, storageOperations: 5 }
    };
  }
}

class PaymentProcessingProcessor implements OperationProcessor {
  async execute(operation: QueuedOperation): Promise<OperationResult> {
    return {
      operationId: operation.id,
      status: ExecutionStatus.SUCCESS,
      result: { paymentId: 'pay_123', status: 'completed' },
      executionTime: 3000,
      resourcesUsed: { cpuTimeMs: 500, memoryMB: 20, networkBytes: 2048, storageOperations: 4 }
    };
  }
}

class BlockchainLedgerProcessor implements OperationProcessor {
  async execute(operation: QueuedOperation): Promise<OperationResult> {
    return {
      operationId: operation.id,
      status: ExecutionStatus.SUCCESS,
      result: { ledgerEntryId: 'ledger_123', hash: 'abc123' },
      executionTime: 1500,
      resourcesUsed: { cpuTimeMs: 800, memoryMB: 15, networkBytes: 1536, storageOperations: 3 }
    };
  }
}

class UserNotificationProcessor implements OperationProcessor {
  async execute(operation: QueuedOperation): Promise<OperationResult> {
    return {
      operationId: operation.id,
      status: ExecutionStatus.SUCCESS,
      result: { notificationSent: true },
      executionTime: 200,
      resourcesUsed: { cpuTimeMs: 100, memoryMB: 5, networkBytes: 256, storageOperations: 1 }
    };
  }
}