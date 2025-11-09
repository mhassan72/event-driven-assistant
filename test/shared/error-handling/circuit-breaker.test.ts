/**
 * Circuit Breaker Tests
 */

import {
  CircuitBreaker,
  CircuitBreakerManager,
  CircuitState,
  CircuitBreakerConfig
} from '../../../src/shared/error-handling/circuit-breaker';

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

describe('Circuit Breaker', () => {
  let circuitBreaker: CircuitBreaker;
  let config: CircuitBreakerConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    
    config = {
      failureThreshold: 3,
      successThreshold: 2,
      timeWindow: 10000,
      timeout: 5000,
      resetTimeout: 10000,
      monitoringWindow: 60000,
      minimumThroughput: 5,
      fallbackEnabled: false
    };

    circuitBreaker = new CircuitBreaker('test-circuit', config, {
      logger: mockLogger as any,
      metrics: mockMetrics as any
    });
  });

  describe('Circuit States', () => {
    it('should start in CLOSED state', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    it('should transition to OPEN after failure threshold', async () => {
      const failingFunction = jest.fn().mockRejectedValue(new Error('Test failure'));

      // Execute failing function enough times to meet minimumThroughput and exceed failureThreshold
      // minimumThroughput is 5, failureThreshold is 3
      for (let i = 0; i < config.minimumThroughput; i++) {
        try {
          await circuitBreaker.execute(failingFunction);
        } catch (error) {
          // Expected to fail
        }
      }

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      // Force circuit to OPEN state
      circuitBreaker.forceOpen();
      expect(circuitBreaker.getStats().state).toBe(CircuitState.OPEN);

      // Wait for reset timeout (simulate with shorter timeout for testing)
      const shortConfig = { ...config, resetTimeout: 100 };
      const shortCircuit = new CircuitBreaker('short-circuit', shortConfig, {
        logger: mockLogger as any,
        metrics: mockMetrics as any
      });

      shortCircuit.forceOpen();
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Next execution should attempt to transition to HALF_OPEN
      const successFunction = jest.fn().mockResolvedValue('success');
      try {
        await shortCircuit.execute(successFunction);
      } catch (error) {
        // May fail due to half-open transition
      }

      // The circuit should have attempted to transition
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('transitioned'),
        expect.any(Object)
      );
    });

    it('should transition to CLOSED after successful executions in HALF_OPEN', async () => {
      const successFunction = jest.fn().mockResolvedValue('success');

      // Force to HALF_OPEN state
      circuitBreaker['state'] = CircuitState.HALF_OPEN;

      // Execute successful functions
      for (let i = 0; i < config.successThreshold; i++) {
        await circuitBreaker.execute(successFunction);
      }

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('Function Execution', () => {
    it('should execute function successfully when circuit is CLOSED', async () => {
      const successFunction = jest.fn().mockResolvedValue('test result');

      const result = await circuitBreaker.execute(successFunction);

      expect(result.success).toBe(true);
      expect(result.result).toBe('test result');
      expect(result.fromFallback).toBe(false);
      expect(successFunction).toHaveBeenCalledTimes(1);
    });

    it('should fail fast when circuit is OPEN', async () => {
      const testFunction = jest.fn().mockResolvedValue('result');

      // Force circuit to OPEN state
      circuitBreaker.forceOpen();

      const result = await circuitBreaker.execute(testFunction);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Circuit breaker');
      expect(testFunction).not.toHaveBeenCalled();
    });

    it('should handle function timeout', async () => {
      const slowFunction = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, config.timeout + 1000))
      );

      const result = await circuitBreaker.execute(slowFunction);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timeout');
    });

    it('should record execution metrics', async () => {
      const successFunction = jest.fn().mockResolvedValue('success');

      await circuitBreaker.execute(successFunction);

      expect(mockMetrics.histogram).toHaveBeenCalledWith(
        'circuit_breaker.execution_time',
        expect.any(Number),
        expect.objectContaining({
          circuit_name: 'test-circuit',
          success: 'true'
        })
      );
    });
  });

  describe('Fallback Mechanism', () => {
    it('should execute fallback when circuit is OPEN and fallback is enabled', async () => {
      const fallbackResult = 'fallback result';
      const fallbackConfig = {
        ...config,
        fallbackEnabled: true,
        fallbackFunction: jest.fn().mockResolvedValue(fallbackResult)
      };

      const fallbackCircuit = new CircuitBreaker('fallback-circuit', fallbackConfig, {
        logger: mockLogger as any,
        metrics: mockMetrics as any
      });

      // Force circuit to OPEN
      fallbackCircuit.forceOpen();

      const testFunction = jest.fn().mockRejectedValue(new Error('Test error'));
      const result = await fallbackCircuit.execute(testFunction);

      expect(result.success).toBe(true);
      expect(result.result).toBe(fallbackResult);
      expect(result.fromFallback).toBe(true);
    });

    it('should handle fallback function failure', async () => {
      const fallbackConfig = {
        ...config,
        fallbackEnabled: true,
        fallbackFunction: jest.fn().mockRejectedValue(new Error('Fallback failed'))
      };

      const fallbackCircuit = new CircuitBreaker('fallback-circuit', fallbackConfig, {
        logger: mockLogger as any,
        metrics: mockMetrics as any
      });

      // Force circuit to OPEN
      fallbackCircuit.forceOpen();

      const testFunction = jest.fn().mockRejectedValue(new Error('Test error'));
      const result = await fallbackCircuit.execute(testFunction);

      expect(result.success).toBe(false);
      expect(result.fromFallback).toBe(false);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track success and failure counts', async () => {
      const successFunction = jest.fn().mockResolvedValue('success');
      const failFunction = jest.fn().mockRejectedValue(new Error('failure'));

      // Execute some successful and failed operations
      await circuitBreaker.execute(successFunction);
      await circuitBreaker.execute(successFunction);
      
      try {
        await circuitBreaker.execute(failFunction);
      } catch (error) {
        // Expected
      }

      const stats = circuitBreaker.getStats();
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.totalRequests).toBe(3);
    });

    it('should calculate failure and success rates', async () => {
      const successFunction = jest.fn().mockResolvedValue('success');
      const failFunction = jest.fn().mockRejectedValue(new Error('failure'));

      // Execute operations to get meaningful rates
      await circuitBreaker.execute(successFunction);
      await circuitBreaker.execute(successFunction);
      
      try {
        await circuitBreaker.execute(failFunction);
      } catch (error) {
        // Expected
      }

      const stats = circuitBreaker.getStats();
      expect(stats.successRate).toBeCloseTo(0.67, 1); // 2/3
      expect(stats.failureRate).toBeCloseTo(0.33, 1); // 1/3
    });

    it('should track state change timestamps', () => {
      const initialStats = circuitBreaker.getStats();
      const initialStateTime = initialStats.stateChangedAt;

      // Force state change
      circuitBreaker.forceOpen();

      const newStats = circuitBreaker.getStats();
      expect(newStats.stateChangedAt.getTime()).toBeGreaterThan(initialStateTime.getTime());
    });
  });

  describe('Circuit Breaker Reset', () => {
    it('should reset circuit breaker to initial state', async () => {
      const failFunction = jest.fn().mockRejectedValue(new Error('failure'));

      // Execute some failures
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failFunction);
        } catch (error) {
          // Expected
        }
      }

      // Reset circuit breaker
      circuitBreaker.reset();

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('Force State Changes', () => {
    it('should force circuit to OPEN state', () => {
      circuitBreaker.forceOpen();
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
    });

    it('should force circuit to CLOSED state', () => {
      circuitBreaker.forceOpen();
      circuitBreaker.forceClosed();
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
    });
  });
});

describe('Circuit Breaker Manager', () => {
  let circuitBreakerManager: CircuitBreakerManager;

  beforeEach(() => {
    jest.clearAllMocks();
    
    circuitBreakerManager = new CircuitBreakerManager({
      logger: mockLogger as any,
      metrics: mockMetrics as any
    });
  });

  describe('Circuit Breaker Management', () => {
    it('should create and retrieve circuit breakers', () => {
      const config = { failureThreshold: 5 };
      const circuitBreaker = circuitBreakerManager.getCircuitBreaker('test-service', config);

      expect(circuitBreaker).toBeDefined();
      expect(circuitBreaker.getStats().state).toBe(CircuitState.CLOSED);
    });

    it('should reuse existing circuit breakers', () => {
      const circuitBreaker1 = circuitBreakerManager.getCircuitBreaker('test-service');
      const circuitBreaker2 = circuitBreakerManager.getCircuitBreaker('test-service');

      expect(circuitBreaker1).toBe(circuitBreaker2);
    });

    it('should create different circuit breakers for different names', () => {
      const circuitBreaker1 = circuitBreakerManager.getCircuitBreaker('service-1');
      const circuitBreaker2 = circuitBreakerManager.getCircuitBreaker('service-2');

      expect(circuitBreaker1).not.toBe(circuitBreaker2);
    });
  });

  describe('Statistics Collection', () => {
    it('should collect statistics from all circuit breakers', () => {
      // Create multiple circuit breakers
      circuitBreakerManager.getCircuitBreaker('service-1');
      circuitBreakerManager.getCircuitBreaker('service-2');
      circuitBreakerManager.getCircuitBreaker('service-3');

      const allStats = circuitBreakerManager.getAllStats();

      expect(Object.keys(allStats)).toHaveLength(3);
      expect(allStats['service-1']).toBeDefined();
      expect(allStats['service-2']).toBeDefined();
      expect(allStats['service-3']).toBeDefined();
    });

    it('should reset all circuit breakers', () => {
      // Create and modify circuit breakers
      const cb1 = circuitBreakerManager.getCircuitBreaker('service-1');
      const cb2 = circuitBreakerManager.getCircuitBreaker('service-2');

      cb1.forceOpen();
      cb2.forceOpen();

      // Reset all
      circuitBreakerManager.resetAll();

      expect(cb1.getStats().state).toBe(CircuitState.CLOSED);
      expect(cb2.getStats().state).toBe(CircuitState.CLOSED);
    });
  });

  describe('Circuit Breaker Removal', () => {
    it('should remove circuit breakers', () => {
      circuitBreakerManager.getCircuitBreaker('test-service');
      
      const removed = circuitBreakerManager.removeCircuitBreaker('test-service');
      expect(removed).toBe(true);

      // Should create a new instance when requested again
      const newCircuitBreaker = circuitBreakerManager.getCircuitBreaker('test-service');
      expect(newCircuitBreaker).toBeDefined();
    });

    it('should return false when removing non-existent circuit breaker', () => {
      const removed = circuitBreakerManager.removeCircuitBreaker('non-existent');
      expect(removed).toBe(false);
    });
  });
});