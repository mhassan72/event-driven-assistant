/**
 * Saga Manager Unit Tests
 * Tests for saga pattern implementation in payment processing
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { 
  SagaManager, 
  SagaDefinition, 
  SagaType, 
  StepType, 
  BackoffStrategy 
} from '../../../../src/features/payment-processing/services/saga-manager';
import { SagaStatus, StepStatus } from '../../../../src/features/payment-processing/services/payment-orchestrator';
import { StructuredLogger } from '../../../../src/shared/observability/logger';
import { MetricsCollector } from '../../../../src/shared/observability/metrics';

describe('SagaManager', () => {
  let sagaManager: SagaManager;
  let logger: StructuredLogger;
  let metrics: MetricsCollector;

  beforeEach(() => {
    logger = new StructuredLogger('SagaManagerTest');
    metrics = new MetricsCollector();
    sagaManager = new SagaManager(logger, metrics);
  });

  describe('createSaga', () => {
    it('should create saga successfully', async () => {
      // Arrange
      const sagaDefinition: SagaDefinition = {
        paymentId: 'payment_test_001',
        userId: 'user_test_001',
        type: SagaType.PAYMENT_PROCESSING,
        steps: [
          {
            id: 'validate_payment',
            name: 'validate_payment',
            type: StepType.VALIDATION,
            handler: 'PaymentValidationHandler',
            timeout: 30000,
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: BackoffStrategy.EXPONENTIAL,
              retryableErrors: ['network_error', 'timeout']
            }
          },
          {
            id: 'initiate_payment',
            name: 'initiate_payment',
            type: StepType.PAYMENT_INITIATION,
            handler: 'PaymentInitiationHandler',
            timeout: 60000,
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: BackoffStrategy.EXPONENTIAL,
              retryableErrors: ['network_error', 'provider_error']
            }
          }
        ],
        compensationPlan: [
          {
            stepId: 'initiate_payment',
            handler: 'void_payment_intent',
            parameters: { reason: 'saga_failure' },
            timeout: 30000,
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: BackoffStrategy.FIXED,
              retryableErrors: ['network_error']
            }
          }
        ],
        timeout: 300000,
        retryPolicy: {
          maxRetries: 3,
          backoffStrategy: BackoffStrategy.EXPONENTIAL,
          retryableErrors: ['network_error', 'timeout']
        }
      };

      // Act
      const saga = await sagaManager.createSaga(sagaDefinition);

      // Assert
      expect(saga.id).toBeDefined();
      expect(saga.paymentId).toBe('payment_test_001');
      expect(saga.userId).toBe('user_test_001');
      expect(saga.status).toBe(SagaStatus.STARTED);
      expect(saga.steps.length).toBe(2);
      expect(saga.compensationPlan.length).toBe(1);
      expect(saga.createdAt).toBeDefined();
      expect(saga.expiresAt).toBeDefined();

      // Check steps
      expect(saga.steps[0].id).toBe('validate_payment');
      expect(saga.steps[0].status).toBe(StepStatus.PENDING);
      expect(saga.steps[0].maxRetries).toBe(3);

      expect(saga.steps[1].id).toBe('initiate_payment');
      expect(saga.steps[1].status).toBe(StepStatus.PENDING);
    });

    it('should generate unique saga IDs', async () => {
      // Arrange
      const sagaDefinition: SagaDefinition = {
        paymentId: 'payment_test_002',
        userId: 'user_test_002',
        type: SagaType.PAYMENT_PROCESSING,
        steps: [],
        compensationPlan: [],
        timeout: 300000,
        retryPolicy: {
          maxRetries: 3,
          backoffStrategy: BackoffStrategy.EXPONENTIAL,
          retryableErrors: []
        }
      };

      // Act
      const saga1 = await sagaManager.createSaga(sagaDefinition);
      const saga2 = await sagaManager.createSaga(sagaDefinition);

      // Assert
      expect(saga1.id).not.toBe(saga2.id);
    });
  });

  describe('executeStep', () => {
    it('should execute step successfully', async () => {
      // Arrange
      const sagaDefinition: SagaDefinition = {
        paymentId: 'payment_test_003',
        userId: 'user_test_003',
        type: SagaType.PAYMENT_PROCESSING,
        steps: [
          {
            id: 'validate_payment',
            name: 'validate_payment',
            type: StepType.VALIDATION,
            handler: 'PaymentValidationHandler',
            timeout: 30000,
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: BackoffStrategy.EXPONENTIAL,
              retryableErrors: ['network_error']
            }
          }
        ],
        compensationPlan: [],
        timeout: 300000,
        retryPolicy: {
          maxRetries: 3,
          backoffStrategy: BackoffStrategy.EXPONENTIAL,
          retryableErrors: []
        }
      };

      const saga = await sagaManager.createSaga(sagaDefinition);

      // Act
      const result = await sagaManager.executeStep(saga.id, 'validate_payment', { test: 'input' });

      // Assert
      expect(result.stepId).toBe('validate_payment');
      expect(result.status).toBe(StepStatus.COMPLETED);
      expect(result.output).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.retryCount).toBe(0);

      // Check saga state
      const updatedSaga = await sagaManager.getSaga(saga.id);
      const step = updatedSaga.steps.find(s => s.id === 'validate_payment');
      expect(step?.status).toBe(StepStatus.COMPLETED);
      expect(step?.output).toBeDefined();
      expect(step?.executedAt).toBeDefined();
    });

    it('should handle step execution failure', async () => {
      // Arrange
      const sagaDefinition: SagaDefinition = {
        paymentId: 'payment_test_004',
        userId: 'user_test_004',
        type: SagaType.PAYMENT_PROCESSING,
        steps: [
          {
            id: 'failing_step',
            name: 'non_existent_handler',
            type: StepType.VALIDATION,
            handler: 'NonExistentHandler',
            timeout: 30000,
            retryPolicy: {
              maxRetries: 0, // No retries to force failure
              backoffStrategy: BackoffStrategy.FIXED,
              retryableErrors: []
            }
          }
        ],
        compensationPlan: [],
        timeout: 300000,
        retryPolicy: {
          maxRetries: 0,
          backoffStrategy: BackoffStrategy.FIXED,
          retryableErrors: []
        }
      };

      const saga = await sagaManager.createSaga(sagaDefinition);

      // Act
      const result = await sagaManager.executeStep(saga.id, 'failing_step', {});

      // Assert
      expect(result.stepId).toBe('failing_step');
      expect(result.status).toBe(StepStatus.FAILED);
      expect(result.error).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);

      // Check saga state
      const updatedSaga = await sagaManager.getSaga(saga.id);
      expect(updatedSaga.status).toBe(SagaStatus.FAILED);
    });

    it('should not execute step that is not pending', async () => {
      // Arrange
      const sagaDefinition: SagaDefinition = {
        paymentId: 'payment_test_005',
        userId: 'user_test_005',
        type: SagaType.PAYMENT_PROCESSING,
        steps: [
          {
            id: 'test_step',
            name: 'validate_payment',
            type: StepType.VALIDATION,
            handler: 'PaymentValidationHandler',
            timeout: 30000,
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: BackoffStrategy.EXPONENTIAL,
              retryableErrors: []
            }
          }
        ],
        compensationPlan: [],
        timeout: 300000,
        retryPolicy: {
          maxRetries: 3,
          backoffStrategy: BackoffStrategy.EXPONENTIAL,
          retryableErrors: []
        }
      };

      const saga = await sagaManager.createSaga(sagaDefinition);

      // First execution
      await sagaManager.executeStep(saga.id, 'test_step', {});

      // Act & Assert - Second execution should fail
      await expect(
        sagaManager.executeStep(saga.id, 'test_step', {})
      ).rejects.toThrow('Step test_step is not in pending status');
    });
  });

  describe('completeStep', () => {
    it('should complete step and update saga status', async () => {
      // Arrange
      const sagaDefinition: SagaDefinition = {
        paymentId: 'payment_test_006',
        userId: 'user_test_006',
        type: SagaType.PAYMENT_PROCESSING,
        steps: [
          {
            id: 'step1',
            name: 'validate_payment',
            type: StepType.VALIDATION,
            handler: 'PaymentValidationHandler',
            timeout: 30000,
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: BackoffStrategy.EXPONENTIAL,
              retryableErrors: []
            }
          },
          {
            id: 'step2',
            name: 'initiate_payment',
            type: StepType.PAYMENT_INITIATION,
            handler: 'PaymentInitiationHandler',
            timeout: 60000,
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: BackoffStrategy.EXPONENTIAL,
              retryableErrors: []
            }
          }
        ],
        compensationPlan: [],
        timeout: 300000,
        retryPolicy: {
          maxRetries: 3,
          backoffStrategy: BackoffStrategy.EXPONENTIAL,
          retryableErrors: []
        }
      };

      const saga = await sagaManager.createSaga(sagaDefinition);

      // Act - Complete both steps
      await sagaManager.completeStep(saga.id, 'step1', { result: 'step1_output' });
      await sagaManager.completeStep(saga.id, 'step2', { result: 'step2_output' });

      // Assert
      const completedSaga = await sagaManager.getSaga(saga.id);
      expect(completedSaga.status).toBe(SagaStatus.COMPLETED);
      
      const step1 = completedSaga.steps.find(s => s.id === 'step1');
      const step2 = completedSaga.steps.find(s => s.id === 'step2');
      
      expect(step1?.status).toBe(StepStatus.COMPLETED);
      expect(step1?.output).toEqual({ result: 'step1_output' });
      
      expect(step2?.status).toBe(StepStatus.COMPLETED);
      expect(step2?.output).toEqual({ result: 'step2_output' });
    });
  });

  describe('failStep', () => {
    it('should fail step and trigger compensation when retries exhausted', async () => {
      // Arrange
      const sagaDefinition: SagaDefinition = {
        paymentId: 'payment_test_007',
        userId: 'user_test_007',
        type: SagaType.PAYMENT_PROCESSING,
        steps: [
          {
            id: 'failing_step',
            name: 'validate_payment',
            type: StepType.VALIDATION,
            handler: 'PaymentValidationHandler',
            timeout: 30000,
            retryPolicy: {
              maxRetries: 2,
              backoffStrategy: BackoffStrategy.FIXED,
              retryableErrors: []
            }
          }
        ],
        compensationPlan: [
          {
            stepId: 'failing_step',
            handler: 'cleanup_validation',
            parameters: { reason: 'step_failed' },
            timeout: 30000,
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: BackoffStrategy.FIXED,
              retryableErrors: []
            }
          }
        ],
        timeout: 300000,
        retryPolicy: {
          maxRetries: 3,
          backoffStrategy: BackoffStrategy.EXPONENTIAL,
          retryableErrors: []
        }
      };

      const saga = await sagaManager.createSaga(sagaDefinition);

      // Act - Fail step multiple times to exhaust retries
      await sagaManager.failStep(saga.id, 'failing_step', 'First failure');
      await sagaManager.failStep(saga.id, 'failing_step', 'Second failure');
      await sagaManager.failStep(saga.id, 'failing_step', 'Final failure');

      // Assert
      const failedSaga = await sagaManager.getSaga(saga.id);
      expect(failedSaga.status).toBe(SagaStatus.FAILED);
      
      const step = failedSaga.steps.find(s => s.id === 'failing_step');
      expect(step?.status).toBe(StepStatus.FAILED);
      expect(step?.retryCount).toBe(3);
      expect(step?.error).toBe('Final failure');
    });

    it('should retry step when retries available', async () => {
      // Arrange
      const sagaDefinition: SagaDefinition = {
        paymentId: 'payment_test_008',
        userId: 'user_test_008',
        type: SagaType.PAYMENT_PROCESSING,
        steps: [
          {
            id: 'retry_step',
            name: 'validate_payment',
            type: StepType.VALIDATION,
            handler: 'PaymentValidationHandler',
            timeout: 30000,
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: BackoffStrategy.FIXED,
              retryableErrors: []
            }
          }
        ],
        compensationPlan: [],
        timeout: 300000,
        retryPolicy: {
          maxRetries: 3,
          backoffStrategy: BackoffStrategy.EXPONENTIAL,
          retryableErrors: []
        }
      };

      const saga = await sagaManager.createSaga(sagaDefinition);

      // Act - Fail step once
      await sagaManager.failStep(saga.id, 'retry_step', 'Temporary failure');

      // Assert
      const updatedSaga = await sagaManager.getSaga(saga.id);
      expect(updatedSaga.status).toBe(SagaStatus.STARTED); // Still active
      
      const step = updatedSaga.steps.find(s => s.id === 'retry_step');
      expect(step?.status).toBe(StepStatus.PENDING); // Ready for retry
      expect(step?.retryCount).toBe(1);
    });
  });

  describe('startCompensation', () => {
    it('should execute compensation steps successfully', async () => {
      // Arrange
      const sagaDefinition: SagaDefinition = {
        paymentId: 'payment_test_009',
        userId: 'user_test_009',
        type: SagaType.PAYMENT_PROCESSING,
        steps: [
          {
            id: 'step1',
            name: 'validate_payment',
            type: StepType.VALIDATION,
            handler: 'PaymentValidationHandler',
            timeout: 30000,
            retryPolicy: {
              maxRetries: 0,
              backoffStrategy: BackoffStrategy.FIXED,
              retryableErrors: []
            }
          }
        ],
        compensationPlan: [
          {
            stepId: 'step1',
            handler: 'cancel_payment',
            parameters: { reason: 'compensation_test' },
            timeout: 30000,
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: BackoffStrategy.FIXED,
              retryableErrors: []
            }
          }
        ],
        timeout: 300000,
        retryPolicy: {
          maxRetries: 0,
          backoffStrategy: BackoffStrategy.FIXED,
          retryableErrors: []
        }
      };

      const saga = await sagaManager.createSaga(sagaDefinition);

      // Act
      const compensationResult = await sagaManager.startCompensation(
        saga.id,
        'Test compensation'
      );

      // Assert
      expect(compensationResult.sagaId).toBe(saga.id);
      expect(compensationResult.compensatedSteps).toContain('step1');
      expect(compensationResult.failedCompensations.length).toBe(0);
      expect(compensationResult.finalStatus).toBe(SagaStatus.COMPENSATED);
      expect(compensationResult.completedAt).toBeDefined();

      // Check saga state
      const compensatedSaga = await sagaManager.getSaga(saga.id);
      expect(compensatedSaga.status).toBe(SagaStatus.COMPENSATED);
      
      const compensationStep = compensatedSaga.compensationPlan.find(cs => cs.stepId === 'step1');
      expect(compensationStep?.executed).toBe(true);
      expect(compensationStep?.executedAt).toBeDefined();
    });
  });

  describe('monitorSagas', () => {
    it('should return monitoring statistics', async () => {
      // Arrange - Create multiple sagas in different states
      const sagaDefinitions = Array.from({ length: 5 }, (_, i) => ({
        paymentId: `payment_monitor_${i}`,
        userId: `user_monitor_${i}`,
        type: SagaType.PAYMENT_PROCESSING,
        steps: [
          {
            id: 'step1',
            name: 'validate_payment',
            type: StepType.VALIDATION,
            handler: 'PaymentValidationHandler',
            timeout: 30000,
            retryPolicy: {
              maxRetries: 3,
              backoffStrategy: BackoffStrategy.EXPONENTIAL,
              retryableErrors: []
            }
          }
        ],
        compensationPlan: [],
        timeout: 300000,
        retryPolicy: {
          maxRetries: 3,
          backoffStrategy: BackoffStrategy.EXPONENTIAL,
          retryableErrors: []
        }
      } as SagaDefinition));

      // Create sagas
      const sagas = await Promise.all(
        sagaDefinitions.map(def => sagaManager.createSaga(def))
      );

      // Complete some sagas
      await sagaManager.completeStep(sagas[0].id, 'step1', {});
      await sagaManager.completeStep(sagas[1].id, 'step1', {});

      // Fail some sagas
      await sagaManager.failStep(sagas[2].id, 'step1', 'Test failure');

      // Act
      const monitoringResult = await sagaManager.monitorSagas();

      // Assert
      expect(monitoringResult.totalSagas).toBeGreaterThanOrEqual(5);
      expect(monitoringResult.completedSagas).toBeGreaterThanOrEqual(2);
      expect(monitoringResult.failedSagas).toBeGreaterThanOrEqual(1);
      expect(monitoringResult.activeSagas).toBeGreaterThanOrEqual(0);
      expect(monitoringResult.averageExecutionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('findSagasByStatus', () => {
    it('should find sagas by status', async () => {
      // Arrange
      const sagaDefinition: SagaDefinition = {
        paymentId: 'payment_find_test',
        userId: 'user_find_test',
        type: SagaType.PAYMENT_PROCESSING,
        steps: [],
        compensationPlan: [],
        timeout: 300000,
        retryPolicy: {
          maxRetries: 3,
          backoffStrategy: BackoffStrategy.EXPONENTIAL,
          retryableErrors: []
        }
      };

      const saga = await sagaManager.createSaga(sagaDefinition);

      // Act
      const startedSagas = await sagaManager.findSagasByStatus(SagaStatus.STARTED);

      // Assert
      expect(startedSagas.length).toBeGreaterThan(0);
      expect(startedSagas.some(s => s.id === saga.id)).toBe(true);
    });
  });

  describe('findSagasByUser', () => {
    it('should find sagas by user ID', async () => {
      // Arrange
      const userId = 'user_find_by_user_test';
      const sagaDefinition: SagaDefinition = {
        paymentId: 'payment_find_by_user_test',
        userId,
        type: SagaType.PAYMENT_PROCESSING,
        steps: [],
        compensationPlan: [],
        timeout: 300000,
        retryPolicy: {
          maxRetries: 3,
          backoffStrategy: BackoffStrategy.EXPONENTIAL,
          retryableErrors: []
        }
      };

      const saga = await sagaManager.createSaga(sagaDefinition);

      // Act
      const userSagas = await sagaManager.findSagasByUser(userId);

      // Assert
      expect(userSagas.length).toBeGreaterThan(0);
      expect(userSagas.some(s => s.id === saga.id)).toBe(true);
      expect(userSagas.every(s => s.userId === userId)).toBe(true);
    });
  });

  describe('cleanupExpiredSagas', () => {
    it('should cleanup expired sagas', async () => {
      // Arrange - Create saga with very short timeout
      const sagaDefinition: SagaDefinition = {
        paymentId: 'payment_cleanup_test',
        userId: 'user_cleanup_test',
        type: SagaType.PAYMENT_PROCESSING,
        steps: [],
        compensationPlan: [],
        timeout: 1, // 1ms timeout to force expiration
        retryPolicy: {
          maxRetries: 3,
          backoffStrategy: BackoffStrategy.EXPONENTIAL,
          retryableErrors: []
        }
      };

      const saga = await sagaManager.createSaga(sagaDefinition);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      // Act
      const cleanupResult = await sagaManager.cleanupExpiredSagas();

      // Assert
      expect(cleanupResult.totalCleaned).toBeGreaterThanOrEqual(1);
      expect(cleanupResult.cleanedSagas).toContain(saga.id);
      expect(cleanupResult.errors.length).toBe(0);

      // Verify saga is deleted
      await expect(sagaManager.getSaga(saga.id)).rejects.toThrow('Saga not found');
    });
  });
});