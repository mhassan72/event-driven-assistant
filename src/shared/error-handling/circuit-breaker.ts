/**
 * Circuit Breaker Implementation
 * Provides fault tolerance and prevents cascading failures
 */

import { IStructuredLogger } from '../observability/logger';
import { IMetricsCollector } from '../observability/metrics';
import { ErrorSeverity, ErrorCategory, CategorizedError } from './error-categories';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failing fast
  HALF_OPEN = 'half_open' // Testing recovery
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  // Failure thresholds
  failureThreshold: number;        // Number of failures to open circuit
  successThreshold: number;        // Number of successes to close circuit
  timeWindow: number;              // Time window for failure counting (ms)
  
  // Timing configuration
  timeout: number;                 // Request timeout (ms)
  resetTimeout: number;            // Time to wait before half-open (ms)
  
  // Monitoring
  monitoringWindow: number;        // Window for success rate calculation (ms)
  minimumThroughput: number;       // Minimum requests before opening circuit
  
  // Fallback configuration
  fallbackEnabled: boolean;
  fallbackFunction?: () => Promise<any>;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  failureRate: number;
  successRate: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  stateChangedAt: Date;
  nextRetryAt?: Date;
}

/**
 * Circuit breaker result
 */
export interface CircuitBreakerResult<T> {
  success: boolean;
  result?: T;
  error?: CategorizedError;
  fromFallback: boolean;
  executionTime: number;
  circuitState: CircuitState;
}

/**
 * Circuit breaker implementation with comprehensive monitoring
 */
export class CircuitBreaker<T = any> {
  private config: CircuitBreakerConfig;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  
  // State management
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private totalRequests: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private stateChangedAt: Date = new Date();
  private nextRetryAt?: Date;
  
  // Request tracking
  private recentRequests: Array<{ timestamp: Date; success: boolean }> = [];
  
  constructor(
    private name: string,
    config: Partial<CircuitBreakerConfig> = {},
    dependencies: {
      logger: IStructuredLogger;
      metrics: IMetricsCollector;
    }
  ) {
    this.config = {
      failureThreshold: 5,
      successThreshold: 3,
      timeWindow: 60000, // 1 minute
      timeout: 30000, // 30 seconds
      resetTimeout: 60000, // 1 minute
      monitoringWindow: 300000, // 5 minutes
      minimumThroughput: 10,
      fallbackEnabled: false,
      ...config
    };
    
    this.logger = dependencies.logger;
    this.metrics = dependencies.metrics;
    
    this.logger.info('Circuit breaker initialized', {
      name: this.name,
      config: this.config
    });
  }
  
  /**
   * Execute function with circuit breaker protection
   */
  async execute<R = T>(fn: () => Promise<R>): Promise<CircuitBreakerResult<R>> {
    const startTime = Date.now();
    
    try {
      // Check circuit state
      if (this.state === CircuitState.OPEN) {
        return await this.handleOpenCircuit<R>();
      }
      
      // Execute function with timeout
      const result = await this.executeWithTimeout(fn);
      
      // Record success
      await this.recordSuccess();
      
      const executionTime = Date.now() - startTime;
      
      this.metrics.histogram('circuit_breaker.execution_time', executionTime, {
        circuit_name: this.name,
        state: this.state,
        success: 'true'
      });
      
      return {
        success: true,
        result,
        fromFallback: false,
        executionTime,
        circuitState: this.state
      };
      
    } catch (error) {
      // Record failure
      await this.recordFailure(error);
      
      const executionTime = Date.now() - startTime;
      
      this.metrics.histogram('circuit_breaker.execution_time', executionTime, {
        circuit_name: this.name,
        state: this.state,
        success: 'false'
      });
      
      // Try fallback if available and circuit is open
      if (this.state === CircuitState.OPEN && this.config.fallbackEnabled && this.config.fallbackFunction) {
        try {
          const fallbackResult = await this.config.fallbackFunction();
          
          this.logger.info('Fallback executed successfully', {
            circuitName: this.name,
            executionTime
          });
          
          return {
            success: true,
            result: fallbackResult,
            fromFallback: true,
            executionTime,
            circuitState: this.state
          };
          
        } catch (fallbackError) {
          this.logger.error('Fallback execution failed', {
            circuitName: this.name,
            error: (fallbackError as Error).message
          });
        }
      }
      
      return {
        success: false,
        error: error as CategorizedError,
        fromFallback: false,
        executionTime,
        circuitState: this.state
      };
    }
  }
  
  /**
   * Execute function with timeout protection
   */
  private async executeWithTimeout<R>(fn: () => Promise<R>): Promise<R> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Circuit breaker timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);
      
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
   * Handle open circuit state
   */
  private async handleOpenCircuit<R>(): Promise<CircuitBreakerResult<R>> {
    const now = new Date();
    
    // Check if we should transition to half-open
    if (this.nextRetryAt && now >= this.nextRetryAt) {
      this.transitionToHalfOpen();
      
      // Allow one request through in half-open state
      throw new Error('Circuit breaker is half-open, allowing test request');
    }
    
    this.logger.warn('Circuit breaker is open, failing fast', {
      circuitName: this.name,
      nextRetryAt: this.nextRetryAt?.toISOString()
    });
    
    this.metrics.increment('circuit_breaker.fast_failures', 1, {
      circuit_name: this.name
    });
    
    const error = new Error(`Circuit breaker '${this.name}' is open`) as CategorizedError;
    error.category = ErrorCategory.EXTERNAL_SERVICE;
    error.severity = ErrorSeverity.HIGH;
    
    return {
      success: false,
      error,
      fromFallback: false,
      executionTime: 0,
      circuitState: this.state
    };
  }
  
  /**
   * Record successful execution
   */
  private async recordSuccess(): Promise<void> {
    this.successCount++;
    this.totalRequests++;
    this.lastSuccessTime = new Date();
    
    // Add to recent requests
    this.recentRequests.push({
      timestamp: new Date(),
      success: true
    });
    
    this.cleanupOldRequests();
    
    // Transition state if needed
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successCount >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
    
    this.metrics.increment('circuit_breaker.successes', 1, {
      circuit_name: this.name,
      state: this.state
    });
    
    this.updateMetrics();
  }
  
  /**
   * Record failed execution
   */
  private async recordFailure(error: any): Promise<void> {
    this.failureCount++;
    this.totalRequests++;
    this.lastFailureTime = new Date();
    
    // Add to recent requests
    this.recentRequests.push({
      timestamp: new Date(),
      success: false
    });
    
    this.cleanupOldRequests();
    
    this.logger.warn('Circuit breaker recorded failure', {
      circuitName: this.name,
      failureCount: this.failureCount,
      error: error.message,
      state: this.state
    });
    
    // Transition state if needed
    if (this.state === CircuitState.CLOSED || this.state === CircuitState.HALF_OPEN) {
      const recentFailures = this.getRecentFailureCount();
      const recentTotal = this.getRecentRequestCount();
      
      if (recentTotal >= this.config.minimumThroughput && 
          recentFailures >= this.config.failureThreshold) {
        this.transitionToOpen();
      }
    }
    
    this.metrics.increment('circuit_breaker.failures', 1, {
      circuit_name: this.name,
      state: this.state,
      error_type: error.name || 'Unknown'
    });
    
    this.updateMetrics();
  }
  
  /**
   * Transition to closed state
   */
  private transitionToClosed(): void {
    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.stateChangedAt = new Date();
    this.failureCount = 0;
    this.successCount = 0;
    this.nextRetryAt = undefined;
    
    this.logger.info('Circuit breaker transitioned to CLOSED', {
      circuitName: this.name,
      previousState,
      stateChangedAt: this.stateChangedAt.toISOString()
    });
    
    this.metrics.increment('circuit_breaker.state_changes', 1, {
      circuit_name: this.name,
      from_state: previousState,
      to_state: this.state
    });
  }
  
  /**
   * Transition to open state
   */
  private transitionToOpen(): void {
    const previousState = this.state;
    this.state = CircuitState.OPEN;
    this.stateChangedAt = new Date();
    this.nextRetryAt = new Date(Date.now() + this.config.resetTimeout);
    
    this.logger.warn('Circuit breaker transitioned to OPEN', {
      circuitName: this.name,
      previousState,
      failureCount: this.failureCount,
      nextRetryAt: this.nextRetryAt.toISOString()
    });
    
    this.metrics.increment('circuit_breaker.state_changes', 1, {
      circuit_name: this.name,
      from_state: previousState,
      to_state: this.state
    });
  }
  
  /**
   * Transition to half-open state
   */
  private transitionToHalfOpen(): void {
    const previousState = this.state;
    this.state = CircuitState.HALF_OPEN;
    this.stateChangedAt = new Date();
    this.successCount = 0;
    this.nextRetryAt = undefined;
    
    this.logger.info('Circuit breaker transitioned to HALF_OPEN', {
      circuitName: this.name,
      previousState,
      stateChangedAt: this.stateChangedAt.toISOString()
    });
    
    this.metrics.increment('circuit_breaker.state_changes', 1, {
      circuit_name: this.name,
      from_state: previousState,
      to_state: this.state
    });
  }
  
  /**
   * Get recent failure count within time window
   */
  private getRecentFailureCount(): number {
    const cutoff = new Date(Date.now() - this.config.timeWindow);
    return this.recentRequests.filter(req => 
      req.timestamp >= cutoff && !req.success
    ).length;
  }
  
  /**
   * Get recent request count within time window
   */
  private getRecentRequestCount(): number {
    const cutoff = new Date(Date.now() - this.config.timeWindow);
    return this.recentRequests.filter(req => req.timestamp >= cutoff).length;
  }
  
  /**
   * Clean up old request records
   */
  private cleanupOldRequests(): void {
    const cutoff = new Date(Date.now() - this.config.monitoringWindow);
    this.recentRequests = this.recentRequests.filter(req => req.timestamp >= cutoff);
  }
  
  /**
   * Update metrics
   */
  private updateMetrics(): void {
    const recentTotal = this.getRecentRequestCount();
    const recentFailures = this.getRecentFailureCount();
    const recentSuccesses = recentTotal - recentFailures;
    
    const failureRate = recentTotal > 0 ? recentFailures / recentTotal : 0;
    const successRate = recentTotal > 0 ? recentSuccesses / recentTotal : 0;
    
    this.metrics.gauge('circuit_breaker.failure_rate', failureRate, {
      circuit_name: this.name
    });
    
    this.metrics.gauge('circuit_breaker.success_rate', successRate, {
      circuit_name: this.name
    });
    
    this.metrics.gauge('circuit_breaker.state', this.getStateValue(), {
      circuit_name: this.name
    });
  }
  
  /**
   * Get numeric value for circuit state (for metrics)
   */
  private getStateValue(): number {
    switch (this.state) {
      case CircuitState.CLOSED: return 0;
      case CircuitState.HALF_OPEN: return 1;
      case CircuitState.OPEN: return 2;
      default: return -1;
    }
  }
  
  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    const recentTotal = this.getRecentRequestCount();
    const recentFailures = this.getRecentFailureCount();
    const recentSuccesses = recentTotal - recentFailures;
    
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      failureRate: recentTotal > 0 ? recentFailures / recentTotal : 0,
      successRate: recentTotal > 0 ? recentSuccesses / recentTotal : 0,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChangedAt: this.stateChangedAt,
      nextRetryAt: this.nextRetryAt
    };
  }
  
  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.totalRequests = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.stateChangedAt = new Date();
    this.nextRetryAt = undefined;
    this.recentRequests = [];
    
    this.logger.info('Circuit breaker reset', {
      circuitName: this.name
    });
    
    this.metrics.increment('circuit_breaker.resets', 1, {
      circuit_name: this.name
    });
  }
  
  /**
   * Force circuit breaker to open state
   */
  forceOpen(): void {
    this.transitionToOpen();
  }
  
  /**
   * Force circuit breaker to closed state
   */
  forceClosed(): void {
    this.transitionToClosed();
  }
}

/**
 * Circuit breaker manager for handling multiple circuit breakers
 */
export class CircuitBreakerManager {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
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
   * Get or create circuit breaker
   */
  getCircuitBreaker(
    name: string, 
    config?: Partial<CircuitBreakerConfig>
  ): CircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      const circuitBreaker = new CircuitBreaker(name, config, {
        logger: this.logger,
        metrics: this.metrics
      });
      
      this.circuitBreakers.set(name, circuitBreaker);
      
      this.logger.info('Created new circuit breaker', { name });
    }
    
    return this.circuitBreakers.get(name)!;
  }
  
  /**
   * Get all circuit breaker statistics
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    
    for (const [name, circuitBreaker] of this.circuitBreakers) {
      stats[name] = circuitBreaker.getStats();
    }
    
    return stats;
  }
  
  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const circuitBreaker of this.circuitBreakers.values()) {
      circuitBreaker.reset();
    }
    
    this.logger.info('Reset all circuit breakers');
  }
  
  /**
   * Remove circuit breaker
   */
  removeCircuitBreaker(name: string): boolean {
    const removed = this.circuitBreakers.delete(name);
    
    if (removed) {
      this.logger.info('Removed circuit breaker', { name });
    }
    
    return removed;
  }
}