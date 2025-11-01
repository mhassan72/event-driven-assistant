/**
 * Error Handling Module Integration Tests
 */

import {
  ErrorSeverity,
  ErrorCategory,
  RecoveryStrategy,
  createCategorizedError,
  CircuitBreaker,
  RetryExecutor,
  DeadLetterQueueManager,
  ComprehensiveErrorHandler
} from '../../../src/shared/error-handling';

// Mock dependencies
const mockDependencies = {
  realtimeDB: {
    ref: jest.fn().mockReturnThis(),
    set: jest.fn().mockResolvedValue(undefined),
    once: jest.fn().mockResolvedValue({ val: () => null }),
    transaction: jest.fn()
  } as any,
  firestore: {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    set: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue({ exists: false })
  } as any,
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  } as any,
  metrics: {
    increment: jest.fn(),
    histogram: jest.fn(),
    gauge: jest.fn()
  } as any
};

describe('Error Handling Module Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Module Exports', () => {
    it('should export all error handling components', () => {
      expect(ErrorSeverity).toBeDefined();
      expect(ErrorCategory).toBeDefined();
      expect(RecoveryStrategy).toBeDefined();
      expect(createCategorizedError).toBeDefined();
      expect(CircuitBreaker).toBeDefined();
      expect(RetryExecutor).toBeDefined();
      expect(DeadLetterQueueManager).toBeDefined();
      expect(ComprehensiveErrorHandler).toBeDefined();
    });

    it('should have consistent error severity levels', () => {
      const severityLevels = Object.values(ErrorSeverity);
      expect(severityLevels).toContain('low');
      expect(severityLevels).toContain('medium');
      expect(severityLevels).toContain('high');
      expect(severityLevels).toContain('critical');
      expect(severityLevels).toContain('fatal');
    });

    it('should have comprehensive error categories', () => {
      const categories = Object.values(ErrorCategory);
      expect(categories.length).toBeGreaterThan(10);
      expect(categories).toContain('system_failure');
      expect(categories).toContain('network');
      expect(categories).toContain('authentication');
      expect(categories).toContain('validation');
    });

    it('should have all recovery strategies', () => {
      const strategies = Object.values(RecoveryStrategy);
      expect(strategies).toContain('retry');
      expect(strategies).toContain('fallback');
      expect(strategies).toContain('circuit_breaker');
      expect(strategies).toContain('compensation');
      expect(strategies).toContain('manual_intervention');
      expect(strategies).toContain('graceful_degradation');
      expect(strategies).toContain('fail_fast');
    });
  });

  describe('Component Integration', () => {
    it('should integrate error classification with circuit breaker', async () => {
      const circuitBreaker = new CircuitBreaker('integration-test', {}, mockDependencies);
      
      const networkError = createCategorizedError('ECONNREFUSED: Connection refused');
      const failingFunction = jest.fn().mockRejectedValue(networkError);

      const result = await circuitBreaker.execute(failingFunction);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should integrate error classification with retry mechanism', async () => {
      const retryExecutor = new RetryExecutor('integration-test', {
        maxAttempts: 2,
        baseDelay: 10,
        maxDelay: 100,
        backoffMultiplier: 2,
        jitterEnabled: false,
        jitterRange: 0,
        retryableErrors: ['NETWORK'],
        nonRetryableErrors: ['VALIDATION'],
        timeoutPerAttempt: 5000,
        circuitBreakerEnabled: false
      }, mockDependencies);

      const retryableError = createCategorizedError('NETWORK_ERROR: Temporary failure');
      retryableError.retryable = true;

      const failingFunction = jest.fn().mockRejectedValue(retryableError);

      const result = await retryExecutor.execute(failingFunction);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(2); // Should retry once
    });

    it('should integrate error classification with DLQ', async () => {
      const dlqManager = new DeadLetterQueueManager(mockDependencies);
      
      const criticalError = createCategorizedError('Critical system failure', {
        severity: ErrorSeverity.CRITICAL,
        category: ErrorCategory.SYSTEM_FAILURE
      });

      const dlqId = await dlqManager.addToDLQ(
        'operation-123',
        'critical_operation',
        { data: 'test' },
        criticalError
      );

      expect(dlqId).toBeDefined();
      expect(dlqId).toMatch(/^dlq_/);
    });

    it('should integrate all components in comprehensive error handler', async () => {
      const errorHandler = new ComprehensiveErrorHandler({
        enableCircuitBreakers: true,
        enableRetryMechanism: true,
        enableDeadLetterQueue: true
      }, mockDependencies);

      const operationContext = {
        operationId: 'integration-test',
        operationType: 'external_api_call',
        metadata: {}
      };

      const successFunction = jest.fn().mockResolvedValue('success');

      const result = await errorHandler.executeWithErrorHandling(
        successFunction,
        operationContext
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
    });
  });

  describe('Error Flow Integration', () => {
    it('should handle complete error flow from classification to recovery', async () => {
      const errorHandler = new ComprehensiveErrorHandler({}, mockDependencies);

      // Simulate a payment operation that fails with a retryable error
      let attemptCount = 0;
      const paymentOperation = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          const error = new Error('NETWORK_ERROR: Payment gateway timeout');
          throw error;
        }
        return { paymentId: 'pay-123', status: 'completed' };
      });

      const paymentContext = {
        operationId: 'payment-op-123',
        operationType: 'payment_processing',
        userId: 'user-123',
        metadata: { amount: 100, currency: 'USD' }
      };

      const result = await errorHandler.executeWithErrorHandling(
        paymentOperation,
        paymentContext
      );

      expect(result.success).toBe(true);
      expect((result.result as any).paymentId).toBe('pay-123');
      expect(paymentOperation).toHaveBeenCalledTimes(3);
    });

    it('should escalate to DLQ when retries are exhausted', async () => {
      const errorHandler = new ComprehensiveErrorHandler({
        defaultRetryPolicy: { maxAttempts: 2 }
      }, mockDependencies);

      const persistentFailureOperation = jest.fn().mockRejectedValue(
        new Error('CRITICAL_ERROR: Database corruption detected')
      );

      const criticalContext = {
        operationId: 'critical-op-123',
        operationType: 'data_integrity_check',
        priority: 5,
        metadata: { table: 'credit_transactions' }
      };

      const result = await errorHandler.executeWithErrorHandling(
        persistentFailureOperation,
        criticalContext
      );

      expect(result.success).toBe(false);
      expect(result.sentToDLQ).toBe(true);
      expect(result.dlqItemId).toBeDefined();
    });

    it('should handle circuit breaker integration with retry', async () => {
      const errorHandler = new ComprehensiveErrorHandler({
        enableCircuitBreakers: true,
        enableRetryMechanism: true
      }, mockDependencies);

      const externalServiceOperation = jest.fn().mockResolvedValue('external data');

      const externalContext = {
        operationId: 'external-op-123',
        operationType: 'external_api_call',
        metadata: { endpoint: 'https://api.example.com/data' }
      };

      const result = await errorHandler.executeWithErrorHandling(
        externalServiceOperation,
        externalContext
      );

      expect(result.success).toBe(true);
      expect(result.circuitBreakerUsed).toBe(true);
    });
  });

  describe('Configuration Integration', () => {
    it('should respect configuration flags', async () => {
      const disabledFeaturesHandler = new ComprehensiveErrorHandler({
        enableCircuitBreakers: false,
        enableRetryMechanism: false,
        enableDeadLetterQueue: false
      }, mockDependencies);

      const operation = jest.fn().mockResolvedValue('result');
      const context = {
        operationId: 'test-op',
        operationType: 'external_api_call',
        metadata: {}
      };

      const result = await disabledFeaturesHandler.executeWithErrorHandling(
        operation,
        context
      );

      expect(result.success).toBe(true);
      expect(result.circuitBreakerUsed).toBe(false);
      expect(result.retryUsed).toBe(false);
      expect(result.sentToDLQ).toBe(false);
    });

    it('should use custom configuration values', async () => {
      const customHandler = new ComprehensiveErrorHandler({
        defaultRetryPolicy: {
          maxAttempts: 5,
          baseDelay: 500
        },
        defaultCircuitBreakerConfig: {
          failureThreshold: 10,
          timeout: 30000
        }
      }, mockDependencies);

      // Configuration should be applied to internal components
      expect(customHandler).toBeDefined();
    });
  });

  describe('Metrics and Observability Integration', () => {
    it('should emit metrics across all components', async () => {
      const errorHandler = new ComprehensiveErrorHandler({}, mockDependencies);

      const operation = jest.fn().mockResolvedValue('success');
      const context = {
        operationId: 'metrics-test',
        operationType: 'test_operation',
        metadata: {}
      };

      await errorHandler.executeWithErrorHandling(operation, context);

      // Should have emitted success metrics
      expect(mockDependencies.metrics.counter).toHaveBeenCalledWith(
        'error_handler.operations_success',
        1,
        expect.any(Object)
      );

      expect(mockDependencies.metrics.histogram).toHaveBeenCalledWith(
        'error_handler.execution_time',
        expect.any(Number),
        expect.any(Object)
      );
    });

    it('should log consistently across components', async () => {
      const errorHandler = new ComprehensiveErrorHandler({}, mockDependencies);

      const operation = jest.fn().mockResolvedValue('success');
      const context = {
        operationId: 'logging-test',
        operationType: 'test_operation',
        metadata: {}
      };

      await errorHandler.executeWithErrorHandling(operation, context);

      // Should have logged operation start and completion
      expect(mockDependencies.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting operation'),
        expect.any(Object)
      );

      expect(mockDependencies.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Operation completed'),
        expect.any(Object)
      );
    });
  });

  describe('Error Propagation and Context', () => {
    it('should maintain error context across components', async () => {
      const errorHandler = new ComprehensiveErrorHandler({}, mockDependencies);

      const contextualError = createCategorizedError('Test error', {
        userId: 'user-123',
        correlationId: 'corr-456',
        sessionId: 'session-789'
      });

      const failingOperation = jest.fn().mockRejectedValue(contextualError);

      const context = {
        operationId: 'context-test',
        operationType: 'test_operation',
        userId: 'user-123',
        correlationId: 'corr-456',
        metadata: {}
      };

      const result = await errorHandler.executeWithErrorHandling(
        failingOperation,
        context
      );

      expect(result.error?.userId).toBe('user-123');
      expect(result.error?.correlationId).toBe('corr-456');
      expect(result.correlationId).toBe('corr-456');
    });

    it('should enrich errors with operation context', async () => {
      const errorHandler = new ComprehensiveErrorHandler({}, mockDependencies);

      const simpleError = new Error('Simple error message');
      const failingOperation = jest.fn().mockRejectedValue(simpleError);

      const context = {
        operationId: 'enrichment-test',
        operationType: 'test_operation',
        userId: 'user-123',
        correlationId: 'corr-456',
        metadata: { key: 'value' }
      };

      const result = await errorHandler.executeWithErrorHandling(
        failingOperation,
        context
      );

      expect(result.error?.correlationId).toBe('corr-456');
      expect(result.error?.userId).toBe('user-123');
    });
  });
});