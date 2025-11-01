/**
 * Retry Mechanism Tests
 */

import {
  RetryExecutor,
  RetryManager,
  RetryPolicy,
  DEFAULT_RETRY_POLICIES,
  retryWithBackoff
} from '../../../src/shared/error-handling/retry-mechanism';
import { CircuitBreaker } from '../../../src/shared/error-handling/circuit-breaker';

// Mock dependencies
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

const mockCircuitBreaker = {
  execute: jest.fn()
} as unknown as CircuitBreaker;

describe('Retry Mechanism', () => {
  let retryExecutor: RetryExecutor;
  let retryPolicy: RetryPolicy;

  beforeEach(() => {
    jest.clearAllMocks();
    
    retryPolicy = {
      maxAttempts: 3,
      baseDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitterEnabled: false, // Disable for predictable testing
      jitterRange: 0,
      retryableErrors: ['NETWORK_ERROR', 'TIMEOUT'],
      nonRetryableErrors: ['VALIDATION_ERROR'],
      timeoutPerAttempt: 5000,
      circuitBreakerEnabled: false
    };

    retryExecutor = new RetryExecutor('test-executor', retryPolicy, {
      logger: mockLogger as any,
      metrics: mockMetrics as any
    });
  });

  describe('RetryExecutor', () => {
    describe('Successful Execution', () => {
      it('should execute function successfully on first attempt', async () => {
        const successFunction = jest.fn().mockResolvedValue('success');

        const result = await retryExecutor.execute(successFunction);

        expect(result.success).toBe(true);
        expect(result.result).toBe('success');
        expect(result.attempts).toBe(1);
        expect(result.attempts.length).toBe(1);
        expect(result.exhaustedRetries).toBe(false);
        expect(successFunction).toHaveBeenCalledTimes(1);
      });

      it('should succeed after retries', async () => {
        let attemptCount = 0;
        const eventualSuccessFunction = jest.fn().mockImplementation(() => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('NETWORK_ERROR: Temporary failure');
          }
          return 'success';
        });

        const result = await retryExecutor.execute(eventualSuccessFunction);

        expect(result.success).toBe(true);
        expect(result.result).toBe('success');
        expect(result.attempts).toBe(3);
        expect(eventualSuccessFunction).toHaveBeenCalledTimes(3);
      });
    });

    describe('Failed Execution', () => {
      it('should fail after exhausting all retries', async () => {
        const failFunction = jest.fn().mockRejectedValue(new Error('NETWORK_ERROR: Persistent failure'));

        const result = await retryExecutor.execute(failFunction);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.attempts).toBe(retryPolicy.maxAttempts);
        expect(result.exhaustedRetries).toBe(true);
        expect(failFunction).toHaveBeenCalledTimes(retryPolicy.maxAttempts);
      });

      it('should not retry non-retryable errors', async () => {
        const validationError = jest.fn().mockRejectedValue(new Error('VALIDATION_ERROR: Invalid input'));

        const result = await retryExecutor.execute(validationError);

        expect(result.success).toBe(false);
        expect(result.attempts).toBe(1);
        expect(result.exhaustedRetries).toBe(false);
        expect(validationError).toHaveBeenCalledTimes(1);
      });

      it('should handle timeout errors', async () => {
        const timeoutFunction = jest.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(resolve, retryPolicy.timeoutPerAttempt + 1000))
        );

        const result = await retryExecutor.execute(timeoutFunction);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('timeout');
      });
    });

    describe('Retry Logic', () => {
      it('should calculate exponential backoff delays', async () => {
        const delays: number[] = [];
        const originalSleep = (retryExecutor as any).sleep;
        
        (retryExecutor as any).sleep = jest.fn().mockImplementation((ms: number) => {
          delays.push(ms);
          return Promise.resolve();
        });

        const failFunction = jest.fn().mockRejectedValue(new Error('NETWORK_ERROR: Failure'));

        await retryExecutor.execute(failFunction);

        // Should have delays for attempts 2 and 3
        expect(delays).toHaveLength(2);
        expect(delays[0]).toBe(100); // baseDelay * 2^0
        expect(delays[1]).toBe(200); // baseDelay * 2^1
      });

      it('should respect maximum delay', async () => {
        const shortMaxDelayPolicy = {
          ...retryPolicy,
          maxDelay: 150,
          maxAttempts: 5
        };

        const shortDelayExecutor = new RetryExecutor('short-delay', shortMaxDelayPolicy, {
          logger: mockLogger as any,
          metrics: mockMetrics as any
        });

        const delays: number[] = [];
        (shortDelayExecutor as any).sleep = jest.fn().mockImplementation((ms: number) => {
          delays.push(ms);
          return Promise.resolve();
        });

        const failFunction = jest.fn().mockRejectedValue(new Error('NETWORK_ERROR: Failure'));

        await shortDelayExecutor.execute(failFunction);

        // All delays should be <= maxDelay
        delays.forEach(delay => {
          expect(delay).toBeLessThanOrEqual(shortMaxDelayPolicy.maxDelay);
        });
      });

      it('should use custom retry logic when provided', async () => {
        const customRetryPolicy = {
          ...retryPolicy,
          shouldRetry: jest.fn().mockReturnValue(false) // Never retry
        };

        const customExecutor = new RetryExecutor('custom', customRetryPolicy, {
          logger: mockLogger as any,
          metrics: mockMetrics as any
        });

        const failFunction = jest.fn().mockRejectedValue(new Error('NETWORK_ERROR: Failure'));

        const result = await customExecutor.execute(failFunction);

        expect(result.attempts).toBe(1);
        expect(customRetryPolicy.shouldRetry).toHaveBeenCalled();
      });

      it('should call onRetry callback when provided', async () => {
        const onRetryCallback = jest.fn();
        const callbackPolicy = {
          ...retryPolicy,
          onRetry: onRetryCallback
        };

        const callbackExecutor = new RetryExecutor('callback', callbackPolicy, {
          logger: mockLogger as any,
          metrics: mockMetrics as any
        });

        const failFunction = jest.fn().mockRejectedValue(new Error('NETWORK_ERROR: Failure'));

        await callbackExecutor.execute(failFunction);

        expect(onRetryCallback).toHaveBeenCalledTimes(2); // For attempts 2 and 3
      });
    });

    describe('Circuit Breaker Integration', () => {
      it('should use circuit breaker when enabled', async () => {
        const cbPolicy = {
          ...retryPolicy,
          circuitBreakerEnabled: true
        };

        const cbExecutor = new RetryExecutor('cb-executor', cbPolicy, {
          logger: mockLogger as any,
          metrics: mockMetrics as any,
          circuitBreaker: mockCircuitBreaker
        });

        (mockCircuitBreaker.execute as jest.Mock).mockResolvedValue({
          success: true,
          result: 'cb-result'
        });

        const testFunction = jest.fn().mockResolvedValue('direct-result');

        const result = await cbExecutor.execute(testFunction);

        expect(mockCircuitBreaker.execute).toHaveBeenCalledWith(testFunction);
        expect(result.circuitBreakerTriggered).toBe(false);
      });

      it('should handle circuit breaker failures', async () => {
        const cbPolicy = {
          ...retryPolicy,
          circuitBreakerEnabled: true
        };

        const cbExecutor = new RetryExecutor('cb-executor', cbPolicy, {
          logger: mockLogger as any,
          metrics: mockMetrics as any,
          circuitBreaker: mockCircuitBreaker
        });

        (mockCircuitBreaker.execute as jest.Mock).mockResolvedValue({
          success: false,
          error: new Error('Circuit breaker open')
        });

        const testFunction = jest.fn();

        const result = await cbExecutor.execute(testFunction);

        expect(result.success).toBe(false);
        expect(result.circuitBreakerTriggered).toBe(true);
      });
    });

    describe('Metrics and Logging', () => {
      it('should record success metrics', async () => {
        const successFunction = jest.fn().mockResolvedValue('success');

        await retryExecutor.execute(successFunction);

        expect(mockMetrics.counter).toHaveBeenCalledWith(
          'retry_executor.success',
          1,
          expect.objectContaining({
            executor_name: 'test-executor'
          })
        );
      });

      it('should record failure metrics', async () => {
        const failFunction = jest.fn().mockRejectedValue(new Error('NETWORK_ERROR: Failure'));

        await retryExecutor.execute(failFunction);

        expect(mockMetrics.counter).toHaveBeenCalledWith(
          'retry_executor.failure',
          1,
          expect.objectContaining({
            executor_name: 'test-executor'
          })
        );
      });

      it('should record retry metrics', async () => {
        let attemptCount = 0;
        const eventualSuccessFunction = jest.fn().mockImplementation(() => {
          attemptCount++;
          if (attemptCount < 2) {
            throw new Error('NETWORK_ERROR: Temporary failure');
          }
          return 'success';
        });

        await retryExecutor.execute(eventualSuccessFunction);

        expect(mockMetrics.counter).toHaveBeenCalledWith(
          'retry_executor.retry',
          1,
          expect.objectContaining({
            executor_name: 'test-executor'
          })
        );
      });
    });

    describe('Policy Updates', () => {
      it('should update retry policy', () => {
        const newPolicy = { maxAttempts: 5 };
        
        retryExecutor.updatePolicy(newPolicy);
        
        const stats = retryExecutor.getStats();
        expect(stats.policy.maxAttempts).toBe(5);
      });
    });
  });

  describe('RetryManager', () => {
    let retryManager: RetryManager;

    beforeEach(() => {
      retryManager = new RetryManager({
        logger: mockLogger as any,
        metrics: mockMetrics as any
      });
    });

    describe('Executor Management', () => {
      it('should create and retrieve retry executors', () => {
        const executor = retryManager.getExecutor('test-service', 'network');

        expect(executor).toBeDefined();
        expect(executor.getStats().name).toBe('test-service');
      });

      it('should reuse existing executors', () => {
        const executor1 = retryManager.getExecutor('test-service');
        const executor2 = retryManager.getExecutor('test-service');

        expect(executor1).toBe(executor2);
      });

      it('should create executors with custom policies', () => {
        const customPolicy = { maxAttempts: 10 };
        const executor = retryManager.getExecutor('custom-service', undefined, customPolicy);

        expect(executor.getStats().policy.maxAttempts).toBe(10);
      });

      it('should execute with retry using manager', async () => {
        const successFunction = jest.fn().mockResolvedValue('success');

        const result = await retryManager.executeWithRetry('test-service', successFunction);

        expect(result.success).toBe(true);
        expect(result.result).toBe('success');
      });
    });

    describe('Statistics Collection', () => {
      it('should collect statistics from all executors', () => {
        retryManager.getExecutor('service-1');
        retryManager.getExecutor('service-2');

        const allStats = retryManager.getAllStats();

        expect(Object.keys(allStats)).toHaveLength(2);
        expect(allStats['service-1']).toBeDefined();
        expect(allStats['service-2']).toBeDefined();
      });
    });

    describe('Executor Removal', () => {
      it('should remove executors', () => {
        retryManager.getExecutor('test-service');
        
        const removed = retryManager.removeExecutor('test-service');
        expect(removed).toBe(true);
      });

      it('should return false when removing non-existent executor', () => {
        const removed = retryManager.removeExecutor('non-existent');
        expect(removed).toBe(false);
      });
    });
  });

  describe('DEFAULT_RETRY_POLICIES', () => {
    it('should have predefined retry policies', () => {
      expect(DEFAULT_RETRY_POLICIES.network).toBeDefined();
      expect(DEFAULT_RETRY_POLICIES.database).toBeDefined();
      expect(DEFAULT_RETRY_POLICIES.external_api).toBeDefined();
      expect(DEFAULT_RETRY_POLICIES.payment).toBeDefined();
      expect(DEFAULT_RETRY_POLICIES.ai_inference).toBeDefined();
    });

    it('should have valid policy configurations', () => {
      Object.values(DEFAULT_RETRY_POLICIES).forEach(policy => {
        expect(policy.maxAttempts).toBeGreaterThan(0);
        expect(policy.baseDelay).toBeGreaterThan(0);
        expect(policy.maxDelay).toBeGreaterThanOrEqual(policy.baseDelay);
        expect(policy.backoffMultiplier).toBeGreaterThan(1);
        expect(policy.timeoutPerAttempt).toBeGreaterThan(0);
      });
    });

    it('should have appropriate settings for different scenarios', () => {
      // Network operations should be more aggressive with retries
      expect(DEFAULT_RETRY_POLICIES.network.maxAttempts).toBeGreaterThanOrEqual(3);
      
      // Payment operations should be more conservative
      expect(DEFAULT_RETRY_POLICIES.payment.maxAttempts).toBeLessThanOrEqual(3);
      expect(DEFAULT_RETRY_POLICIES.payment.jitterEnabled).toBe(false);
      
      // AI inference should have longer timeouts
      expect(DEFAULT_RETRY_POLICIES.ai_inference.timeoutPerAttempt).toBeGreaterThan(60000);
    });
  });

  describe('retryWithBackoff utility function', () => {
    it('should retry function with default options', async () => {
      let attemptCount = 0;
      const eventualSuccessFunction = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const result = await retryWithBackoff(eventualSuccessFunction);

      expect(result).toBe('success');
      expect(eventualSuccessFunction).toHaveBeenCalledTimes(2);
    });

    it('should retry function with custom options', async () => {
      const failFunction = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      try {
        await retryWithBackoff(failFunction, { maxAttempts: 2 });
        fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).toBe('Persistent failure');
        expect(failFunction).toHaveBeenCalledTimes(2);
      }
    });

    it('should succeed on first attempt', async () => {
      const successFunction = jest.fn().mockResolvedValue('immediate success');

      const result = await retryWithBackoff(successFunction);

      expect(result).toBe('immediate success');
      expect(successFunction).toHaveBeenCalledTimes(1);
    });
  });
});