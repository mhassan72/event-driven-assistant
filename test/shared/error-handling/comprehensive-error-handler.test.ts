/**
 * Comprehensive Error Handler Tests
 */

import {
  ComprehensiveErrorHandler,
  ErrorHandlingConfig,
  OperationContext,
  initializeGlobalErrorHandler,
  getGlobalErrorHandler,
  handleWithErrorRecovery
} from '../../../src/shared/error-handling/comprehensive-error-handler';
import { ErrorSeverity, ErrorCategory } from '../../../src/shared/error-handling/error-categories';

// Mock dependencies
const mockRealtimeDB = {
  ref: jest.fn().mockReturnThis(),
  set: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined)
};

const mockFirestore = {
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  set: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue({ exists: false })
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

describe('Comprehensive Error Handler', () => {
  let errorHandler: ComprehensiveErrorHandler;
  let config: ErrorHandlingConfig;
  let operationContext: OperationContext;

  beforeEach(() => {
    jest.clearAllMocks();
    
    config = {
      enableCircuitBreakers: true,
      enableRetryMechanism: true,
      enableDeadLetterQueue: true,
      defaultCircuitBreakerConfig: {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 5000,
        resetTimeout: 10000
      },
      defaultRetryPolicy: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitterEnabled: true
      },
      dlqProcessingInterval: 60000,
      dlqCleanupInterval: 3600000,
      dlqRetentionDays: 30,
      alertOnCriticalErrors: true,
      alertOnCircuitBreakerOpen: true,
      alertOnDLQEscalation: true,
      metricsEnabled: true,
      detailedLogging: true
    };

    errorHandler = new ComprehensiveErrorHandler(config, {
      realtimeDB: mockRealtimeDB as any,
      firestore: mockFirestore as any,
      logger: mockLogger as any,
      metrics: mockMetrics as any
    });

    operationContext = {
      operationId: 'op-123',
      operationType: 'credit_deduction',
      userId: 'user-123',
      correlationId: 'corr-456',
      metadata: { amount: 100 }
    };
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultHandler = new ComprehensiveErrorHandler({}, {
        realtimeDB: mockRealtimeDB as any,
        firestore: mockFirestore as any,
        logger: mockLogger as any,
        metrics: mockMetrics as any
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Comprehensive Error Handler initialized',
        expect.objectContaining({ config: expect.any(Object) })
      );
    });

    it('should merge custom configuration with defaults', () => {
      const customConfig = { enableCircuitBreakers: false };
      
      const customHandler = new ComprehensiveErrorHandler(customConfig, {
        realtimeDB: mockRealtimeDB as any,
        firestore: mockFirestore as any,
        logger: mockLogger as any,
        metrics: mockMetrics as any
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Comprehensive Error Handler initialized',
        expect.objectContaining({
          config: expect.objectContaining({
            enableCircuitBreakers: false
          })
        })
      );
    });
  });

  describe('Operation Execution', () => {
    describe('Successful Operations', () => {
      it('should execute operation successfully', async () => {
        const successOperation = jest.fn().mockResolvedValue('success result');

        const result = await errorHandler.executeWithErrorHandling(
          successOperation,
          operationContext
        );

        expect(result.success).toBe(true);
        expect(result.result).toBe('success result');
        expect(result.attempts).toBe(1);
        expect(result.sentToDLQ).toBe(false);
        expect(successOperation).toHaveBeenCalledTimes(1);
      });

      it('should record success metrics', async () => {
        const successOperation = jest.fn().mockResolvedValue('success');

        await errorHandler.executeWithErrorHandling(successOperation, operationContext);

        expect(mockMetrics.increment).toHaveBeenCalledWith(
          'error_handler.operations_success',
          1,
          expect.objectContaining({
            operation_type: operationContext.operationType
          })
        );

        expect(mockMetrics.histogram).toHaveBeenCalledWith(
          'error_handler.execution_time',
          expect.any(Number),
          expect.objectContaining({
            operation_type: operationContext.operationType,
            success: 'true'
          })
        );
      });
    });

    describe('Failed Operations', () => {
      it('should handle operation failure', async () => {
        const failOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));

        const result = await errorHandler.executeWithErrorHandling(
          failOperation,
          operationContext
        );

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error?.message).toBe('Operation failed');
      });

      it('should record failure metrics', async () => {
        const failOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));

        await errorHandler.executeWithErrorHandling(failOperation, operationContext);

        expect(mockMetrics.increment).toHaveBeenCalledWith(
          'error_handler.operations_failed',
          1,
          expect.objectContaining({
            operation_type: operationContext.operationType
          })
        );
      });

      it('should categorize errors properly', async () => {
        const networkError = new Error('ECONNREFUSED: Connection refused');
        const failOperation = jest.fn().mockRejectedValue(networkError);

        const result = await errorHandler.executeWithErrorHandling(
          failOperation,
          operationContext
        );

        expect(result.error?.category).toBeDefined();
        expect(result.error?.severity).toBeDefined();
      });
    });

    describe('Critical Error Handling', () => {
      it('should send alerts for critical errors', async () => {
        const criticalError = new Error('Critical system failure');
        (criticalError as any).severity = ErrorSeverity.CRITICAL;
        (criticalError as any).requiresAlert = true;

        const failOperation = jest.fn().mockRejectedValue(criticalError);

        await errorHandler.executeWithErrorHandling(failOperation, operationContext);

        expect(mockLogger.error).toHaveBeenCalledWith(
          'CRITICAL ERROR ALERT',
          expect.objectContaining({
            operationId: operationContext.operationId,
            errorSeverity: ErrorSeverity.CRITICAL
          })
        );
      });

      it('should send operations to DLQ when appropriate', async () => {
        const criticalError = new Error('Critical failure');
        (criticalError as any).severity = ErrorSeverity.CRITICAL;

        const failOperation = jest.fn().mockRejectedValue(criticalError);

        const result = await errorHandler.executeWithErrorHandling(
          failOperation,
          operationContext
        );

        expect(result.sentToDLQ).toBe(true);
        expect(result.dlqItemId).toBeDefined();
      });
    });
  });

  describe('Execution Strategy Determination', () => {
    it('should use circuit breaker for external services', async () => {
      const externalContext = {
        ...operationContext,
        operationType: 'external_api_call'
      };

      const operation = jest.fn().mockResolvedValue('result');

      const result = await errorHandler.executeWithErrorHandling(operation, externalContext);

      expect(result.circuitBreakerUsed).toBe(true);
    });

    it('should use retry for network operations', async () => {
      const networkContext = {
        ...operationContext,
        operationType: 'network_request'
      };

      const operation = jest.fn().mockResolvedValue('result');

      const result = await errorHandler.executeWithErrorHandling(operation, networkContext);

      expect(result.retryUsed).toBe(true);
    });

    it('should skip retry for validation operations', async () => {
      const validationContext = {
        ...operationContext,
        operationType: 'validation_check'
      };

      const operation = jest.fn().mockResolvedValue('result');

      const result = await errorHandler.executeWithErrorHandling(operation, validationContext);

      expect(result.retryUsed).toBe(false);
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      const newConfig = { enableCircuitBreakers: false };

      errorHandler.updateConfig(newConfig);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Error handling configuration updated',
        expect.objectContaining({
          config: expect.objectContaining({
            enableCircuitBreakers: false
          })
        })
      );
    });

    it('should add custom error classification rules', () => {
      errorHandler.addErrorClassificationRule(
        /custom.error/i,
        'business_logic',
        ErrorSeverity.HIGH,
        false,
        'manual_intervention' as any
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Added custom error classification rule',
        expect.objectContaining({
          pattern: '/custom.error/i',
          category: 'business_logic'
        })
      );
    });

    it('should register DLQ recovery handlers', () => {
      const mockHandler = { recover: jest.fn() };

      errorHandler.registerDLQRecoveryHandler('test_operation', mockHandler);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered custom DLQ recovery handler',
        { operationType: 'test_operation' }
      );
    });
  });

  describe('Circuit Breaker Management', () => {
    it('should force circuit breaker states', () => {
      errorHandler.forceCircuitBreakerState('test-service', 'open');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Forced circuit breaker state',
        { name: 'test-service', state: 'open' }
      );
    });
  });

  describe('Statistics Collection', () => {
    it('should collect comprehensive statistics', async () => {
      const stats = await errorHandler.getStats();

      expect(stats).toHaveProperty('circuitBreakers');
      expect(stats).toHaveProperty('retryExecutors');
      expect(stats).toHaveProperty('dlqStats');
      expect(stats).toHaveProperty('errorCounts');
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup resources', async () => {
      await errorHandler.cleanup();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Comprehensive Error Handler cleaned up'
      );
    });
  });

  describe('Context Management', () => {
    it('should manage operation contexts properly', async () => {
      const operation1 = jest.fn().mockResolvedValue('result1');
      const operation2 = jest.fn().mockResolvedValue('result2');

      const context1 = { ...operationContext, operationId: 'op-1' };
      const context2 = { ...operationContext, operationId: 'op-2' };

      // Execute operations concurrently
      const [result1, result2] = await Promise.all([
        errorHandler.executeWithErrorHandling(operation1, context1),
        errorHandler.executeWithErrorHandling(operation2, context2)
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.correlationId).toBe(context1.correlationId);
      expect(result2.correlationId).toBe(context2.correlationId);
    });
  });
});

describe('Global Error Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize global error handler', () => {
      const config = { enableCircuitBreakers: true };
      const dependencies = {
        realtimeDB: mockRealtimeDB as any,
        firestore: mockFirestore as any,
        logger: mockLogger as any,
        metrics: mockMetrics as any
      };

      const globalHandler = initializeGlobalErrorHandler(config, dependencies);

      expect(globalHandler).toBeInstanceOf(ComprehensiveErrorHandler);
    });

    it('should get global error handler instance', () => {
      const config = {};
      const dependencies = {
        realtimeDB: mockRealtimeDB as any,
        firestore: mockFirestore as any,
        logger: mockLogger as any,
        metrics: mockMetrics as any
      };

      initializeGlobalErrorHandler(config, dependencies);
      const globalHandler = getGlobalErrorHandler();

      expect(globalHandler).toBeInstanceOf(ComprehensiveErrorHandler);
    });

    it('should throw error when getting uninitialized global handler', () => {
      // Reset global handler
      (global as any).globalErrorHandler = null;

      expect(() => getGlobalErrorHandler()).toThrow(
        'Global error handler not initialized'
      );
    });
  });

  describe('Utility Functions', () => {
    beforeEach(() => {
      const config = {};
      const dependencies = {
        realtimeDB: mockRealtimeDB as any,
        firestore: mockFirestore as any,
        logger: mockLogger as any,
        metrics: mockMetrics as any
      };

      initializeGlobalErrorHandler(config, dependencies);
    });

    it('should handle operations with error recovery', async () => {
      const successOperation = jest.fn().mockResolvedValue('success');

      const result = await handleWithErrorRecovery(successOperation, {
        operationType: 'test_operation'
      });

      expect(result).toBe('success');
      expect(successOperation).toHaveBeenCalledTimes(1);
    });

    it('should throw error when operation fails', async () => {
      const failOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      await expect(handleWithErrorRecovery(failOperation, {
        operationType: 'test_operation'
      })).rejects.toThrow('Operation failed');
    });

    it('should generate operation context automatically', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      await handleWithErrorRecovery(operation, {
        operationType: 'test_operation',
        userId: 'user-123'
      });

      // Should have generated operationId and other context
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});

describe('Error Handler Integration', () => {
  let errorHandler: ComprehensiveErrorHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    
    errorHandler = new ComprehensiveErrorHandler({}, {
      realtimeDB: mockRealtimeDB as any,
      firestore: mockFirestore as any,
      logger: mockLogger as any,
      metrics: mockMetrics as any
    });
  });

  describe('End-to-End Scenarios', () => {
    it('should handle complete failure scenario with DLQ', async () => {
      const criticalContext = {
        operationId: 'critical-op',
        operationType: 'payment_processing',
        userId: 'user-123',
        priority: 5,
        metadata: { amount: 1000 }
      };

      const criticalError = new Error('Payment gateway failure');
      (criticalError as any).severity = ErrorSeverity.CRITICAL;

      const failOperation = jest.fn().mockRejectedValue(criticalError);

      const result = await errorHandler.executeWithErrorHandling(
        failOperation,
        criticalContext
      );

      expect(result.success).toBe(false);
      expect(result.sentToDLQ).toBe(true);
      expect(result.error?.severity).toBe(ErrorSeverity.CRITICAL);
    });

    it('should handle retry success scenario', async () => {
      let attemptCount = 0;
      const eventualSuccessOperation = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('NETWORK_ERROR: Temporary failure');
        }
        return 'eventual success';
      });

      const networkContext = {
        operationId: 'network-op',
        operationType: 'network_request',
        metadata: {}
      };

      const result = await errorHandler.executeWithErrorHandling(
        eventualSuccessOperation,
        networkContext
      );

      expect(result.success).toBe(true);
      expect(result.result).toBe('eventual success');
      expect(result.retryUsed).toBe(true);
    });

    it('should handle circuit breaker scenario', async () => {
      const externalContext = {
        operationId: 'external-op',
        operationType: 'external_api_call',
        metadata: {}
      };

      const operation = jest.fn().mockResolvedValue('api result');

      const result = await errorHandler.executeWithErrorHandling(
        operation,
        externalContext
      );

      expect(result.success).toBe(true);
      expect(result.circuitBreakerUsed).toBe(true);
    });
  });

  describe('Performance and Monitoring', () => {
    it('should track execution times', async () => {
      const slowOperation = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow result'), 100))
      );

      const testContext = {
        operationId: 'perf-test',
        operationType: 'test_operation',
        metadata: {}
      };

      const result = await errorHandler.executeWithErrorHandling(
        slowOperation,
        testContext
      );

      expect(result.executionTime).toBeGreaterThan(90);
      expect(mockMetrics.histogram).toHaveBeenCalledWith(
        'error_handler.execution_time',
        expect.any(Number),
        expect.any(Object)
      );
    });

    it('should handle concurrent operations', async () => {
      const operations = Array.from({ length: 10 }, (_, i) => 
        jest.fn().mockResolvedValue(`result-${i}`)
      );

      const contexts = operations.map((_, i) => ({
        operationId: `op-${i}`,
        operationType: 'concurrent_test',
        metadata: { index: i }
      }));

      const results = await Promise.all(
        operations.map((op, i) => 
          errorHandler.executeWithErrorHandling(op, contexts[i])
        )
      );

      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.result).toBe(`result-${i}`);
      });
    });
  });
});