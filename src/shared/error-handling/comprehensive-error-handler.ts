/**
 * Comprehensive Error Handler
 * Integrates error classification, circuit breakers, retry mechanisms, and DLQ
 */

import { IStructuredLogger } from '../observability/logger';
import { IMetricsCollector } from '../observability/metrics';
import { 
  CategorizedError, 
  ErrorClassifier, 
  createCategorizedError,
  ErrorSeverity,
  RecoveryStrategy 
} from './error-categories';
import { CircuitBreakerManager, CircuitBreakerConfig } from './circuit-breaker';
import { RetryManager, RetryPolicy, DEFAULT_RETRY_POLICIES } from './retry-mechanism';
import { DeadLetterQueueManager } from './dead-letter-queue';
import { Database } from 'firebase-admin/database';
import { Firestore } from 'firebase-admin/firestore';

/**
 * Error handling configuration
 */
export interface ErrorHandlingConfig {
  // Global settings
  enableCircuitBreakers: boolean;
  enableRetryMechanism: boolean;
  enableDeadLetterQueue: boolean;
  
  // Circuit breaker defaults
  defaultCircuitBreakerConfig: Partial<CircuitBreakerConfig>;
  
  // Retry defaults
  defaultRetryPolicy: Partial<RetryPolicy>;
  
  // DLQ settings
  dlqProcessingInterval: number;
  dlqCleanupInterval: number;
  dlqRetentionDays: number;
  
  // Alerting settings
  alertOnCriticalErrors: boolean;
  alertOnCircuitBreakerOpen: boolean;
  alertOnDLQEscalation: boolean;
  
  // Monitoring settings
  metricsEnabled: boolean;
  detailedLogging: boolean;
}

/**
 * Error handling result
 */
export interface ErrorHandlingResult<T> {
  success: boolean;
  result?: T;
  error?: CategorizedError;
  
  // Execution details
  executionTime: number;
  attempts: number;
  recoveryMethod: RecoveryStrategy;
  
  // Circuit breaker info
  circuitBreakerUsed: boolean;
  circuitBreakerState?: string;
  
  // Retry info
  retryUsed: boolean;
  retryAttempts?: number;
  
  // DLQ info
  sentToDLQ: boolean;
  dlqItemId?: string;
  
  // Metadata
  correlationId?: string;
  context: Record<string, any>;
}

/**
 * Operation context for error handling
 */
export interface OperationContext {
  operationId: string;
  operationType: string;
  userId?: string;
  sessionId?: string;
  correlationId?: string;
  priority?: number;
  timeout?: number;
  metadata: Record<string, any>;
}

/**
 * Comprehensive Error Handler
 */
export class ComprehensiveErrorHandler {
  private config: ErrorHandlingConfig;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  
  // Component managers
  private errorClassifier: ErrorClassifier;
  private circuitBreakerManager: CircuitBreakerManager;
  private retryManager: RetryManager;
  private dlqManager: DeadLetterQueueManager;
  
  // State tracking
  private operationContexts: Map<string, OperationContext> = new Map();
  
  constructor(
    config: Partial<ErrorHandlingConfig> = {},
    dependencies: {
      realtimeDB: Database;
      firestore: Firestore;
      logger: IStructuredLogger;
      metrics: IMetricsCollector;
    }
  ) {
    this.config = {
      enableCircuitBreakers: true,
      enableRetryMechanism: true,
      enableDeadLetterQueue: true,
      defaultCircuitBreakerConfig: {
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 30000,
        resetTimeout: 60000
      },
      defaultRetryPolicy: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitterEnabled: true
      },
      dlqProcessingInterval: 5 * 60 * 1000, // 5 minutes
      dlqCleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
      dlqRetentionDays: 30,
      alertOnCriticalErrors: true,
      alertOnCircuitBreakerOpen: true,
      alertOnDLQEscalation: true,
      metricsEnabled: true,
      detailedLogging: true,
      ...config
    };
    
    this.logger = dependencies.logger;
    this.metrics = dependencies.metrics;
    
    // Initialize components
    this.errorClassifier = new ErrorClassifier();
    this.circuitBreakerManager = new CircuitBreakerManager({
      logger: this.logger,
      metrics: this.metrics
    });
    this.retryManager = new RetryManager({
      logger: this.logger,
      metrics: this.metrics
    });
    this.dlqManager = new DeadLetterQueueManager({
      realtimeDB: dependencies.realtimeDB,
      firestore: dependencies.firestore,
      logger: this.logger,
      metrics: this.metrics
    });
    
    this.logger.info('Comprehensive Error Handler initialized', {
      config: this.config
    });
  }
  
  /**
   * Execute operation with comprehensive error handling
   */
  async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    context: OperationContext
  ): Promise<ErrorHandlingResult<T>> {
    const startTime = Date.now();
    
    // Store operation context
    this.operationContexts.set(context.operationId, context);
    
    try {
      this.logger.info('Starting operation with error handling', {
        operationId: context.operationId,
        operationType: context.operationType,
        correlationId: context.correlationId
      });
      
      // Determine execution strategy based on operation type
      const strategy = this.determineExecutionStrategy(context);
      
      let result: T;
      let executionDetails: Partial<ErrorHandlingResult<T>> = {
        circuitBreakerUsed: false,
        retryUsed: false,
        sentToDLQ: false,
        attempts: 1,
        recoveryMethod: RecoveryStrategy.RETRY
      };
      
      if (strategy.useCircuitBreaker && this.config.enableCircuitBreakers) {
        // Execute with circuit breaker
        result = await this.executeWithCircuitBreaker(operation, context, executionDetails);
      } else if (strategy.useRetry && this.config.enableRetryMechanism) {
        // Execute with retry mechanism
        result = await this.executeWithRetry(operation, context, executionDetails);
      } else {
        // Execute directly
        result = await operation();
      }
      
      const executionTime = Date.now() - startTime;
      
      this.logger.info('Operation completed successfully', {
        operationId: context.operationId,
        executionTime,
        strategy
      });
      
      this.metrics.increment('error_handler.operations_success', 1, {
        operation_type: context.operationType,
        strategy: JSON.stringify(strategy)
      });
      
      this.metrics.histogram('error_handler.execution_time', executionTime, {
        operation_type: context.operationType,
        success: 'true'
      });
      
      return {
        success: true,
        result,
        executionTime,
        correlationId: context.correlationId,
        context: context.metadata,
        ...executionDetails
      };
      
    } catch (error) {
      return await this.handleOperationError(error, context, startTime);
      
    } finally {
      // Cleanup operation context
      this.operationContexts.delete(context.operationId);
    }
  }
  
  /**
   * Handle operation error with comprehensive recovery
   */
  private async handleOperationError(
    error: any,
    context: OperationContext,
    startTime: number
  ): Promise<ErrorHandlingResult<any>> {
    const executionTime = Date.now() - startTime;
    
    // Categorize the error
    const categorizedError = createCategorizedError(error, {
      correlationId: context.correlationId,
      userId: context.userId,
      sessionId: context.sessionId,
      context: context.metadata
    });
    
    this.logger.error('Operation failed with error', {
      operationId: context.operationId,
      operationType: context.operationType,
      errorCode: categorizedError.code,
      errorCategory: categorizedError.category,
      errorSeverity: categorizedError.severity,
      executionTime
    });
    
    // Record error metrics
    this.metrics.increment('error_handler.operations_failed', 1, {
      operation_type: context.operationType,
      error_category: categorizedError.category,
      error_severity: categorizedError.severity
    });
    
    this.metrics.histogram('error_handler.execution_time', executionTime, {
      operation_type: context.operationType,
      success: 'false'
    });
    
    // Handle critical errors with alerting
    if (categorizedError.requiresAlert && this.config.alertOnCriticalErrors) {
      await this.sendCriticalErrorAlert(categorizedError, context);
    }
    
    // Determine if error should go to DLQ
    let sentToDLQ = false;
    let dlqItemId: string | undefined;
    
    if (this.shouldSendToDLQ(categorizedError, context)) {
      try {
        dlqItemId = await this.dlqManager.addToDLQ(
          context.operationId,
          context.operationType,
          context.metadata,
          categorizedError,
          {
            correlationId: context.correlationId,
            userId: context.userId,
            sessionId: context.sessionId,
            context: context.metadata
          }
        );
        
        sentToDLQ = true;
        
        this.logger.warn('Operation sent to Dead Letter Queue', {
          operationId: context.operationId,
          dlqItemId,
          errorCode: categorizedError.code
        });
        
      } catch (dlqError) {
        this.logger.error('Failed to send operation to DLQ', {
          operationId: context.operationId,
          dlqError: dlqError instanceof Error ? dlqError.message : 'Unknown error'
        });
      }
    }
    
    return {
      success: false,
      error: categorizedError,
      executionTime,
      attempts: 1,
      recoveryMethod: categorizedError.recoveryStrategy,
      circuitBreakerUsed: false,
      retryUsed: false,
      sentToDLQ,
      dlqItemId,
      correlationId: context.correlationId,
      context: context.metadata
    };
  }
  
  /**
   * Execute operation with circuit breaker
   */
  private async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    context: OperationContext,
    executionDetails: Partial<ErrorHandlingResult<T>>
  ): Promise<T> {
    const circuitBreakerName = `${context.operationType}_cb`;
    const circuitBreaker = this.circuitBreakerManager.getCircuitBreaker(
      circuitBreakerName,
      this.config.defaultCircuitBreakerConfig
    );
    
    executionDetails.circuitBreakerUsed = true;
    
    const result = await circuitBreaker.execute(operation);
    
    executionDetails.circuitBreakerState = result.circuitState;
    
    if (!result.success) {
      if (result.error) {
        throw result.error;
      }
      throw new Error('Circuit breaker prevented execution');
    }
    
    return result.result!;
  }
  
  /**
   * Execute operation with retry mechanism
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: OperationContext,
    executionDetails: Partial<ErrorHandlingResult<T>>
  ): Promise<T> {
    const retryExecutorName = `${context.operationType}_retry`;
    const policyName = this.getRetryPolicyName(context.operationType);
    
    executionDetails.retryUsed = true;
    
    const result = await this.retryManager.executeWithRetry(
      retryExecutorName,
      operation,
      policyName,
      this.config.defaultRetryPolicy
    );
    
    executionDetails.attempts = result.finalAttempt;
    executionDetails.retryAttempts = result.attempts.length;
    
    if (!result.success) {
      if (result.error) {
        throw result.error;
      }
      throw new Error('Retry execution failed');
    }
    
    return result.result!;
  }
  
  /**
   * Determine execution strategy based on operation context
   */
  private determineExecutionStrategy(context: OperationContext): {
    useCircuitBreaker: boolean;
    useRetry: boolean;
    useDLQ: boolean;
  } {
    const operationType = context.operationType.toLowerCase();
    
    // External service calls should use circuit breakers
    const useCircuitBreaker = operationType.includes('external') || 
                             operationType.includes('api') ||
                             operationType.includes('payment') ||
                             operationType.includes('ai');
    
    // Most operations can benefit from retry
    const useRetry = !operationType.includes('validation') &&
                    !operationType.includes('auth');
    
    // Critical operations should use DLQ
    const useDLQ = operationType.includes('payment') ||
                  operationType.includes('credit') ||
                  operationType.includes('user') ||
                  context.priority && context.priority >= 3;
    
    return {
      useCircuitBreaker,
      useRetry,
      useDLQ
    };
  }
  
  /**
   * Get retry policy name for operation type
   */
  private getRetryPolicyName(operationType: string): keyof typeof DEFAULT_RETRY_POLICIES {
    const type = operationType.toLowerCase();
    
    if (type.includes('network') || type.includes('external')) {
      return 'network';
    }
    if (type.includes('database') || type.includes('firestore')) {
      return 'database';
    }
    if (type.includes('api')) {
      return 'external_api';
    }
    if (type.includes('payment')) {
      return 'payment';
    }
    if (type.includes('ai') || type.includes('model')) {
      return 'ai_inference';
    }
    
    return 'network'; // Default
  }
  
  /**
   * Determine if error should be sent to DLQ
   */
  private shouldSendToDLQ(error: CategorizedError, context: OperationContext): boolean {
    if (!this.config.enableDeadLetterQueue) {
      return false;
    }
    
    // Always send critical and fatal errors to DLQ
    if (error.severity === ErrorSeverity.CRITICAL || error.severity === ErrorSeverity.FATAL) {
      return true;
    }
    
    // Send payment-related errors to DLQ
    if (context.operationType.toLowerCase().includes('payment')) {
      return true;
    }
    
    // Send high-priority operations to DLQ
    if (context.priority && context.priority >= 3) {
      return true;
    }
    
    // Send non-retryable errors to DLQ for manual review
    if (!error.retryable) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Send critical error alert
   */
  private async sendCriticalErrorAlert(
    error: CategorizedError,
    context: OperationContext
  ): Promise<void> {
    try {
      // TODO: Implement actual alerting mechanism (email, Slack, PagerDuty, etc.)
      this.logger.error('CRITICAL ERROR ALERT', {
        operationId: context.operationId,
        operationType: context.operationType,
        errorCode: error.code,
        errorMessage: error.message,
        errorSeverity: error.severity,
        userId: context.userId,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString()
      });
      
      this.metrics.increment('error_handler.critical_alerts', 1, {
        operation_type: context.operationType,
        error_category: error.category
      });
      
    } catch (alertError) {
      this.logger.error('Failed to send critical error alert', {
        alertError: alertError instanceof Error ? alertError.message : 'Unknown error',
        originalError: error.message
      });
    }
  }
  
  /**
   * Get comprehensive error handling statistics
   */
  async getStats(): Promise<{
    circuitBreakers: Record<string, any>;
    retryExecutors: Record<string, any>;
    dlqStats: any;
    errorCounts: Record<string, number>;
  }> {
    const [dlqStats] = await Promise.all([
      this.dlqManager.getStats()
    ]);
    
    return {
      circuitBreakers: this.circuitBreakerManager.getAllStats(),
      retryExecutors: this.retryManager.getAllStats(),
      dlqStats,
      errorCounts: {} // TODO: Implement error counting
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ErrorHandlingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    this.logger.info('Error handling configuration updated', {
      config: this.config
    });
  }
  
  /**
   * Add custom error classification rule
   */
  addErrorClassificationRule(
    pattern: RegExp | string,
    category: string,
    severity: ErrorSeverity,
    retryable: boolean,
    recoveryStrategy: RecoveryStrategy
  ): void {
    this.errorClassifier.addRule({
      pattern,
      category: category as any,
      severity,
      retryable,
      recoveryStrategy
    });
    
    this.logger.info('Added custom error classification rule', {
      pattern: pattern.toString(),
      category,
      severity
    });
  }
  
  /**
   * Register custom DLQ recovery handler
   */
  registerDLQRecoveryHandler(operationType: string, handler: any): void {
    this.dlqManager.registerRecoveryHandler(operationType, handler);
    
    this.logger.info('Registered custom DLQ recovery handler', {
      operationType
    });
  }
  
  /**
   * Force circuit breaker state for testing
   */
  forceCircuitBreakerState(name: string, state: 'open' | 'closed'): void {
    const circuitBreaker = this.circuitBreakerManager.getCircuitBreaker(name);
    
    if (state === 'open') {
      circuitBreaker.forceOpen();
    } else {
      circuitBreaker.forceClosed();
    }
    
    this.logger.info('Forced circuit breaker state', { name, state });
  }
  
  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.dlqManager.stop();
    
    this.logger.info('Comprehensive Error Handler cleaned up');
  }
}

/**
 * Global error handler instance
 */
let globalErrorHandler: ComprehensiveErrorHandler | null = null;

/**
 * Initialize global error handler
 */
export function initializeGlobalErrorHandler(
  config: Partial<ErrorHandlingConfig>,
  dependencies: {
    realtimeDB: Database;
    firestore: Firestore;
    logger: IStructuredLogger;
    metrics: IMetricsCollector;
  }
): ComprehensiveErrorHandler {
  globalErrorHandler = new ComprehensiveErrorHandler(config, dependencies);
  return globalErrorHandler;
}

/**
 * Get global error handler instance
 */
export function getGlobalErrorHandler(): ComprehensiveErrorHandler {
  if (!globalErrorHandler) {
    throw new Error('Global error handler not initialized. Call initializeGlobalErrorHandler first.');
  }
  return globalErrorHandler;
}

/**
 * Utility function for simple error handling
 */
export async function handleWithErrorRecovery<T>(
  operation: () => Promise<T>,
  context: Partial<OperationContext>
): Promise<T> {
  const errorHandler = getGlobalErrorHandler();
  
  const fullContext: OperationContext = {
    operationId: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    operationType: 'generic',
    metadata: {},
    ...context
  };
  
  const result = await errorHandler.executeWithErrorHandling(operation, fullContext);
  
  if (result.success) {
    return result.result!;
  } else {
    throw result.error || new Error('Operation failed');
  }
}