/**
 * Retry Mechanism with Exponential Backoff
 * Provides intelligent retry logic with jitter and circuit breaker integration
 */

import { IStructuredLogger } from '../observability/logger';
import { IMetricsCollector } from '../observability/metrics';
import { CategorizedError, ErrorSeverity, RecoveryStrategy } from './error-categories';
import { CircuitBreaker, CircuitBreakerResult } from './circuit-breaker';

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  // Basic retry settings
  maxAttempts: number;
  baseDelay: number;              // Base delay in milliseconds
  maxDelay: number;               // Maximum delay in milliseconds
  
  // Exponential backoff settings
  backoffMultiplier: number;      // Multiplier for exponential backoff
  jitterEnabled: boolean;         // Add randomness to prevent thundering herd
  jitterRange: number;            // Jitter range (0-1)
  
  // Conditional retry settings
  retryableErrors: string[];      // Error codes/types that are retryable
  nonRetryableErrors: string[];   // Error codes/types that are not retryable
  
  // Advanced settings
  timeoutPerAttempt: number;      // Timeout for each attempt
  circuitBreakerEnabled: boolean; // Use circuit breaker
  
  // Custom retry logic
  shouldRetry?: (error: CategorizedError, attempt: number) => boolean;
  onRetry?: (error: CategorizedError, attempt: number, delay: number) => void;
}

/**
 * Retry attempt information
 */
export interface RetryAttempt {
  attemptNumber: number;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  error?: CategorizedError;
  success: boolean;
  delay?: number;
}

/**
 * Retry execution result
 */
export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: CategorizedError;
  attempts: RetryAttempt[];
  totalDuration: number;
  finalAttempt: number;
  exhaustedRetries: boolean;
  circuitBreakerTriggered: boolean;
}

/**
 * Default retry policies for different scenarios
 */
export const DEFAULT_RETRY_POLICIES: Record<string, RetryPolicy> = {
  // Network operations
  network: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitterEnabled: true,
    jitterRange: 0.1,
    retryableErrors: ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'],
    nonRetryableErrors: ['UNAUTHORIZED', 'FORBIDDEN'],
    timeoutPerAttempt: 30000,
    circuitBreakerEnabled: true
  },
  
  // Database operations
  database: {
    maxAttempts: 2,
    baseDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitterEnabled: true,
    jitterRange: 0.2,
    retryableErrors: ['ECONNREFUSED', 'TIMEOUT', 'DEADLOCK'],
    nonRetryableErrors: ['VALIDATION_ERROR', 'CONSTRAINT_VIOLATION'],
    timeoutPerAttempt: 10000,
    circuitBreakerEnabled: false
  },
  
  // External API calls
  external_api: {
    maxAttempts: 5,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 1.5,
    jitterEnabled: true,
    jitterRange: 0.15,
    retryableErrors: ['RATE_LIMIT', 'SERVICE_UNAVAILABLE', 'TIMEOUT'],
    nonRetryableErrors: ['INVALID_API_KEY', 'QUOTA_EXCEEDED'],
    timeoutPerAttempt: 60000,
    circuitBreakerEnabled: true
  },
  
  // Payment processing
  payment: {
    maxAttempts: 2,
    baseDelay: 3000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitterEnabled: false, // No jitter for payments
    jitterRange: 0,
    retryableErrors: ['NETWORK_ERROR', 'TIMEOUT'],
    nonRetryableErrors: ['INSUFFICIENT_FUNDS', 'INVALID_CARD', 'FRAUD_DETECTED'],
    timeoutPerAttempt: 30000,
    circuitBreakerEnabled: false
  },
  
  // AI model inference
  ai_inference: {
    maxAttempts: 3,
    baseDelay: 1500,
    maxDelay: 15000,
    backoffMultiplier: 2,
    jitterEnabled: true,
    jitterRange: 0.1,
    retryableErrors: ['MODEL_BUSY', 'RATE_LIMIT', 'TIMEOUT'],
    nonRetryableErrors: ['INVALID_INPUT', 'CONTENT_POLICY_VIOLATION'],
    timeoutPerAttempt: 120000, // 2 minutes for AI inference
    circuitBreakerEnabled: true
  }
};

/**
 * Retry executor with exponential backoff and circuit breaker integration
 */
export class RetryExecutor {
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  private circuitBreaker?: CircuitBreaker;
  
  constructor(
    private name: string,
    private policy: RetryPolicy,
    dependencies: {
      logger: IStructuredLogger;
      metrics: IMetricsCollector;
      circuitBreaker?: CircuitBreaker;
    }
  ) {
    this.logger = dependencies.logger;
    this.metrics = dependencies.metrics;
    this.circuitBreaker = dependencies.circuitBreaker;
    
    this.logger.info('Retry executor initialized', {
      name: this.name,
      policy: this.policy
    });
  }
  
  /**
   * Execute function with retry logic
   */
  async execute<T>(fn: () => Promise<T>): Promise<RetryResult<T>> {
    const startTime = Date.now();
    const attempts: RetryAttempt[] = [];
    let lastError: CategorizedError | undefined;
    let circuitBreakerTriggered = false;
    
    for (let attempt = 1; attempt <= this.policy.maxAttempts; attempt++) {
      const attemptStart = new Date();
      
      try {
        this.logger.debug('Executing retry attempt', {
          executor: this.name,
          attempt,
          maxAttempts: this.policy.maxAttempts
        });
        
        // Execute with circuit breaker if enabled
        let result: T;
        if (this.policy.circuitBreakerEnabled && this.circuitBreaker) {
          const cbResult = await this.circuitBreaker.execute(fn);
          if (!cbResult.success) {
            if (cbResult.error) {
              throw cbResult.error;
            }
            circuitBreakerTriggered = true;
            throw new Error('Circuit breaker prevented execution');
          }
          result = cbResult.result!;
        } else {
          result = await this.executeWithTimeout(fn, this.policy.timeoutPerAttempt);
        }
        
        // Success - record attempt and return
        const attemptEnd = new Date();
        attempts.push({
          attemptNumber: attempt,
          startTime: attemptStart,
          endTime: attemptEnd,
          duration: attemptEnd.getTime() - attemptStart.getTime(),
          success: true
        });
        
        const totalDuration = Date.now() - startTime;
        
        this.logger.info('Retry execution succeeded', {
          executor: this.name,
          attempt,
          totalDuration,
          totalAttempts: attempts.length
        });
        
        this.metrics.increment('retry_executor.success', 1, {
          executor_name: this.name,
          final_attempt: attempt.toString()
        });
        
        this.metrics.histogram('retry_executor.total_duration', totalDuration, {
          executor_name: this.name,
          success: 'true'
        });
        
        return {
          success: true,
          result,
          attempts,
          totalDuration,
          finalAttempt: attempt,
          exhaustedRetries: false,
          circuitBreakerTriggered
        };
        
      } catch (error) {
        const attemptEnd = new Date();
        const categorizedError = this.categorizeCaughtError(error);
        lastError = categorizedError;
        
        const attemptInfo: RetryAttempt = {
          attemptNumber: attempt,
          startTime: attemptStart,
          endTime: attemptEnd,
          duration: attemptEnd.getTime() - attemptStart.getTime(),
          error: categorizedError,
          success: false
        };
        
        attempts.push(attemptInfo);
        
        this.logger.warn('Retry attempt failed', {
          executor: this.name,
          attempt,
          error: categorizedError.message,
          errorCode: categorizedError.code,
          duration: attemptInfo.duration
        });
        
        // Check if we should retry
        if (attempt < this.policy.maxAttempts && this.shouldRetry(categorizedError, attempt)) {
          const delay = this.calculateDelay(attempt);
          attemptInfo.delay = delay;
          
          // Call custom retry callback if provided
          if (this.policy.onRetry) {
            this.policy.onRetry(categorizedError, attempt, delay);
          }
          
          this.logger.info('Retrying after delay', {
            executor: this.name,
            attempt,
            nextAttempt: attempt + 1,
            delay
          });
          
          this.metrics.increment('retry_executor.retry', 1, {
            executor_name: this.name,
            attempt: attempt.toString(),
            error_code: categorizedError.code
          });
          
          // Wait before next attempt
          await this.sleep(delay);
          
        } else {
          // No more retries or error is not retryable
          break;
        }
      }
    }
    
    // All retries exhausted or error not retryable
    const totalDuration = Date.now() - startTime;
    
    this.logger.error('Retry execution failed after all attempts', {
      executor: this.name,
      totalAttempts: attempts.length,
      totalDuration,
      finalError: lastError?.message
    });
    
    this.metrics.increment('retry_executor.failure', 1, {
      executor_name: this.name,
      total_attempts: attempts.length.toString(),
      final_error: lastError?.code || 'unknown'
    });
    
    this.metrics.histogram('retry_executor.total_duration', totalDuration, {
      executor_name: this.name,
      success: 'false'
    });
    
    return {
      success: false,
      error: lastError,
      attempts,
      totalDuration,
      finalAttempt: attempts.length,
      exhaustedRetries: attempts.length >= this.policy.maxAttempts,
      circuitBreakerTriggered
    };
  }
  
  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timeout after ${timeout}ms`));
      }, timeout);
      
      fn()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }
  
  /**
   * Determine if error should be retried
   */
  private shouldRetry(error: CategorizedError, attempt: number): boolean {
    // Use custom retry logic if provided
    if (this.policy.shouldRetry) {
      return this.policy.shouldRetry(error, attempt);
    }
    
    // Check non-retryable errors first
    if (this.policy.nonRetryableErrors.some(code => 
      error.code.includes(code) || error.message.includes(code)
    )) {
      return false;
    }
    
    // Check if error is explicitly retryable
    if (this.policy.retryableErrors.length > 0) {
      return this.policy.retryableErrors.some(code => 
        error.code.includes(code) || error.message.includes(code)
      );
    }
    
    // Default: retry based on error properties
    return error.retryable && error.severity !== ErrorSeverity.FATAL;
  }
  
  /**
   * Calculate delay for next retry attempt
   */
  private calculateDelay(attempt: number): number {
    // Calculate exponential backoff
    let delay = this.policy.baseDelay * Math.pow(this.policy.backoffMultiplier, attempt - 1);
    
    // Apply maximum delay limit
    delay = Math.min(delay, this.policy.maxDelay);
    
    // Add jitter if enabled
    if (this.policy.jitterEnabled) {
      const jitter = delay * this.policy.jitterRange * (Math.random() - 0.5) * 2;
      delay += jitter;
    }
    
    // Ensure delay is not negative
    return Math.max(delay, 0);
  }
  
  /**
   * Categorize caught error
   */
  private categorizeCaughtError(error: any): CategorizedError {
    if (error.category && error.severity) {
      return error as CategorizedError;
    }
    
    // Create categorized error from regular error
    const categorizedError: CategorizedError = {
      id: `retry_err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: error.name || 'Error',
      message: error.message || 'Unknown error',
      code: error.code || 'UNKNOWN_ERROR',
      category: error.category || this.inferErrorCategory(error),
      severity: error.severity || ErrorSeverity.MEDIUM,
      timestamp: new Date(),
      retryable: error.retryable ?? true,
      recoveryStrategy: error.recoveryStrategy || RecoveryStrategy.RETRY,
      context: {},
      tags: [],
      isOperational: error.isOperational ?? true,
      requiresAlert: false,
      requiresEscalation: false,
      originalError: error,
      stackTrace: error.stack
    };
    
    return categorizedError;
  }
  
  /**
   * Infer error category from error properties
   */
  private inferErrorCategory(error: any): string {
    const message = error.message?.toLowerCase() || '';
    const name = error.name?.toLowerCase() || '';
    
    if (message.includes('timeout') || name.includes('timeout')) {
      return 'timeout';
    }
    if (message.includes('network') || message.includes('econnrefused')) {
      return 'network';
    }
    if (message.includes('unauthorized') || message.includes('forbidden')) {
      return 'authentication';
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return 'validation';
    }
    
    return 'system_failure';
  }
  
  /**
   * Sleep for specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Update retry policy
   */
  updatePolicy(newPolicy: Partial<RetryPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
    
    this.logger.info('Retry policy updated', {
      executor: this.name,
      policy: this.policy
    });
  }
  
  /**
   * Get retry statistics
   */
  getStats(): {
    name: string;
    policy: RetryPolicy;
  } {
    return {
      name: this.name,
      policy: this.policy
    };
  }
}

/**
 * Retry manager for handling multiple retry executors
 */
export class RetryManager {
  private executors: Map<string, RetryExecutor> = new Map();
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  
  constructor(dependencies: {
    logger: IStructuredLogger;
    metrics: IMetricsCollector;
  }) {
    this.logger = dependencies.logger;
    this.metrics = dependencies.metrics;
  }
  
  /**
   * Get or create retry executor
   */
  getExecutor(
    name: string,
    policyName?: keyof typeof DEFAULT_RETRY_POLICIES,
    customPolicy?: Partial<RetryPolicy>,
    circuitBreaker?: CircuitBreaker
  ): RetryExecutor {
    if (!this.executors.has(name)) {
      let policy: RetryPolicy;
      
      if (customPolicy) {
        // Use custom policy
        policy = {
          ...DEFAULT_RETRY_POLICIES.network, // Default base
          ...customPolicy
        };
      } else if (policyName && DEFAULT_RETRY_POLICIES[policyName]) {
        // Use predefined policy
        policy = DEFAULT_RETRY_POLICIES[policyName];
      } else {
        // Use default network policy
        policy = DEFAULT_RETRY_POLICIES.network;
      }
      
      const executor = new RetryExecutor(name, policy, {
        logger: this.logger,
        metrics: this.metrics,
        circuitBreaker
      });
      
      this.executors.set(name, executor);
      
      this.logger.info('Created new retry executor', { name, policyName });
    }
    
    return this.executors.get(name)!;
  }
  
  /**
   * Execute function with retry using named executor
   */
  async executeWithRetry<T>(
    executorName: string,
    fn: () => Promise<T>,
    policyName?: keyof typeof DEFAULT_RETRY_POLICIES,
    customPolicy?: Partial<RetryPolicy>
  ): Promise<RetryResult<T>> {
    const executor = this.getExecutor(executorName, policyName, customPolicy);
    return executor.execute(fn);
  }
  
  /**
   * Get all executor statistics
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [name, executor] of this.executors) {
      stats[name] = executor.getStats();
    }
    
    return stats;
  }
  
  /**
   * Remove executor
   */
  removeExecutor(name: string): boolean {
    const removed = this.executors.delete(name);
    
    if (removed) {
      this.logger.info('Removed retry executor', { name });
    }
    
    return removed;
  }
}

/**
 * Utility function for simple retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryPolicy> = {}
): Promise<T> {
  const policy: RetryPolicy = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitterEnabled: true,
    jitterRange: 0.1,
    retryableErrors: [],
    nonRetryableErrors: [],
    timeoutPerAttempt: 30000,
    circuitBreakerEnabled: false,
    ...options
  };
  
  // Create temporary executor
  const executor = new RetryExecutor('temp', policy, {
    logger: console as any, // Simple console logger
    metrics: { counter: () => {}, histogram: () => {}, gauge: () => {} } as any
  });
  
  const result = await executor.execute(fn);
  
  if (result.success) {
    return result.result!;
  } else {
    throw result.error || new Error('Retry execution failed');
  }
}