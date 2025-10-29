/**
 * Saga Manager Service
 * Manages distributed payment workflows with saga patterns
 */

import { 
  PaymentSaga, 
  SagaStep, 
  CompensationStep, 
  SagaStatus, 
  StepStatus,
  CompensationResult
} from './payment-orchestrator';
import { IStructuredLogger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';

export interface ISagaManager {
  // Saga lifecycle management
  createSaga(sagaDefinition: SagaDefinition): Promise<PaymentSaga>;
  getSaga(sagaId: string): Promise<PaymentSaga>;
  updateSaga(sagaId: string, updates: Partial<PaymentSaga>): Promise<PaymentSaga>;
  deleteSaga(sagaId: string): Promise<void>;
  
  // Step execution
  executeStep(sagaId: string, stepId: string, input: any): Promise<StepExecutionResult>;
  completeStep(sagaId: string, stepId: string, output: any): Promise<void>;
  failStep(sagaId: string, stepId: string, error: string): Promise<void>;
  
  // Compensation management
  startCompensation(sagaId: string, reason: string): Promise<CompensationResult>;
  executeCompensationStep(sagaId: string, stepId: string): Promise<void>;
  
  // Monitoring and recovery
  monitorSagas(): Promise<SagaMonitoringResult>;
  recoverFailedSagas(): Promise<SagaRecoveryResult>;
  cleanupExpiredSagas(): Promise<SagaCleanupResult>;
  
  // Saga queries
  findSagasByStatus(status: SagaStatus): Promise<PaymentSaga[]>;
  findSagasByUser(userId: string): Promise<PaymentSaga[]>;
  findExpiredSagas(): Promise<PaymentSaga[]>;
}

export interface SagaDefinition {
  id?: string;
  paymentId: string;
  userId: string;
  type: SagaType;
  steps: SagaStepDefinition[];
  compensationPlan: CompensationStepDefinition[];
  timeout: number; // in milliseconds
  retryPolicy: RetryPolicy;
  metadata?: Record<string, any>;
}

export interface SagaStepDefinition {
  id: string;
  name: string;
  type: StepType;
  handler: string;
  input?: any;
  dependencies?: string[];
  timeout: number;
  retryPolicy: RetryPolicy;
  compensationHandler?: string;
}

export interface CompensationStepDefinition {
  stepId: string;
  handler: string;
  parameters: any;
  timeout: number;
  retryPolicy: RetryPolicy;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffStrategy: BackoffStrategy;
  retryableErrors: string[];
}

export interface StepExecutionResult {
  stepId: string;
  status: StepStatus;
  output?: any;
  error?: string;
  executionTime: number;
  retryCount: number;
}

export interface SagaMonitoringResult {
  totalSagas: number;
  activeSagas: number;
  completedSagas: number;
  failedSagas: number;
  compensatingSagas: number;
  expiredSagas: number;
  averageExecutionTime: number;
}

export interface SagaRecoveryResult {
  recoveredSagas: string[];
  failedRecoveries: string[];
  totalProcessed: number;
}

export interface SagaCleanupResult {
  cleanedSagas: string[];
  totalCleaned: number;
  errors: string[];
}

export enum SagaType {
  PAYMENT_PROCESSING = 'payment_processing',
  REFUND_PROCESSING = 'refund_processing',
  DISPUTE_HANDLING = 'dispute_handling',
  CREDIT_ALLOCATION = 'credit_allocation'
}

export enum StepType {
  VALIDATION = 'validation',
  PAYMENT_INITIATION = 'payment_initiation',
  PAYMENT_CONFIRMATION = 'payment_confirmation',
  CREDIT_ALLOCATION = 'credit_allocation',
  NOTIFICATION = 'notification',
  CLEANUP = 'cleanup'
}

export enum BackoffStrategy {
  FIXED = 'fixed',
  LINEAR = 'linear',
  EXPONENTIAL = 'exponential',
  FIBONACCI = 'fibonacci'
}

export class SagaManager implements ISagaManager {
  private sagas: Map<string, PaymentSaga> = new Map();
  private stepHandlers: Map<string, StepHandler> = new Map();
  private compensationHandlers: Map<string, CompensationHandler> = new Map();
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;

  constructor(
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.initializeHandlers();
  }

  async createSaga(sagaDefinition: SagaDefinition): Promise<PaymentSaga> {
    const startTime = Date.now();
    
    try {
      const sagaId = sagaDefinition.id || this.generateSagaId();
      
      this.logger.info('Creating saga', {
        sagaId,
        type: sagaDefinition.type,
        paymentId: sagaDefinition.paymentId,
        userId: sagaDefinition.userId,
        stepCount: sagaDefinition.steps.length
      });

      // Convert definition to saga
      const saga: PaymentSaga = {
        id: sagaId,
        paymentId: sagaDefinition.paymentId,
        userId: sagaDefinition.userId,
        status: SagaStatus.STARTED,
        steps: sagaDefinition.steps.map(stepDef => ({
          id: stepDef.id,
          name: stepDef.name,
          status: StepStatus.PENDING,
          input: stepDef.input,
          retryCount: 0,
          maxRetries: stepDef.retryPolicy.maxRetries,
          compensated: false
        })),
        compensationPlan: sagaDefinition.compensationPlan.map(compDef => ({
          stepId: compDef.stepId,
          action: compDef.handler,
          parameters: compDef.parameters,
          executed: false
        })),
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + sagaDefinition.timeout)
      };

      // Store saga
      this.sagas.set(sagaId, saga);

      this.metrics.incrementCounter('saga_created', {
        type: sagaDefinition.type,
        stepCount: sagaDefinition.steps.length.toString()
      });

      this.logger.info('Saga created successfully', {
        sagaId,
        type: sagaDefinition.type,
        processingTime: Date.now() - startTime
      });

      return saga;

    } catch (error) {
      this.logger.error('Failed to create saga', {
        type: sagaDefinition.type,
        paymentId: sagaDefinition.paymentId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });

      this.metrics.incrementCounter('saga_creation_failed', {
        type: sagaDefinition.type,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      });

      throw error;
    }
  }

  async getSaga(sagaId: string): Promise<PaymentSaga> {
    const saga = this.sagas.get(sagaId);
    if (!saga) {
      throw new Error(`Saga not found: ${sagaId}`);
    }
    return saga;
  }

  async updateSaga(sagaId: string, updates: Partial<PaymentSaga>): Promise<PaymentSaga> {
    const saga = await this.getSaga(sagaId);
    const updatedSaga = { ...saga, ...updates, updatedAt: new Date() };
    this.sagas.set(sagaId, updatedSaga);
    return updatedSaga;
  }

  async deleteSaga(sagaId: string): Promise<void> {
    const saga = await this.getSaga(sagaId);
    this.sagas.delete(sagaId);
    
    this.logger.info('Saga deleted', {
      sagaId,
      status: saga.status,
      paymentId: saga.paymentId
    });
  }

  async executeStep(sagaId: string, stepId: string, input: any): Promise<StepExecutionResult> {
    const startTime = Date.now();
    
    try {
      const saga = await this.getSaga(sagaId);
      const step = saga.steps.find(s => s.id === stepId);
      
      if (!step) {
        throw new Error(`Step not found: ${stepId}`);
      }

      if (step.status !== StepStatus.PENDING) {
        throw new Error(`Step ${stepId} is not in pending status: ${step.status}`);
      }

      this.logger.info('Executing saga step', {
        sagaId,
        stepId,
        stepName: step.name,
        retryCount: step.retryCount
      });

      // Update step status
      step.status = StepStatus.EXECUTING;
      step.executedAt = new Date();
      await this.updateSaga(sagaId, saga);

      // Execute step handler
      const handler = this.stepHandlers.get(step.name);
      if (!handler) {
        throw new Error(`No handler found for step: ${step.name}`);
      }

      const output = await handler.execute(input, saga);

      // Complete step
      await this.completeStep(sagaId, stepId, output);

      const result: StepExecutionResult = {
        stepId,
        status: StepStatus.COMPLETED,
        output,
        executionTime: Date.now() - startTime,
        retryCount: step.retryCount
      };

      this.metrics.incrementCounter('saga_step_executed', {
        sagaId,
        stepId,
        status: 'completed'
      });

      this.logger.info('Saga step executed successfully', {
        sagaId,
        stepId,
        stepName: step.name,
        executionTime: result.executionTime
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error('Saga step execution failed', {
        sagaId,
        stepId,
        error: errorMessage,
        executionTime: Date.now() - startTime
      });

      await this.failStep(sagaId, stepId, errorMessage);

      this.metrics.incrementCounter('saga_step_executed', {
        sagaId,
        stepId,
        status: 'failed'
      });

      return {
        stepId,
        status: StepStatus.FAILED,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        retryCount: 0
      };
    }
  }

  async completeStep(sagaId: string, stepId: string, output: any): Promise<void> {
    const saga = await this.getSaga(sagaId);
    const step = saga.steps.find(s => s.id === stepId);
    
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }

    step.status = StepStatus.COMPLETED;
    step.output = output;
    step.executedAt = new Date();

    // Check if all steps are completed
    const allCompleted = saga.steps.every(s => s.status === StepStatus.COMPLETED);
    if (allCompleted) {
      saga.status = SagaStatus.COMPLETED;
    }

    await this.updateSaga(sagaId, saga);
  }

  async failStep(sagaId: string, stepId: string, error: string): Promise<void> {
    const saga = await this.getSaga(sagaId);
    const step = saga.steps.find(s => s.id === stepId);
    
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }

    step.status = StepStatus.FAILED;
    step.error = error;
    step.retryCount++;

    // Check if step should be retried
    if (step.retryCount < step.maxRetries) {
      step.status = StepStatus.PENDING;
      this.logger.info('Scheduling step retry', {
        sagaId,
        stepId,
        retryCount: step.retryCount,
        maxRetries: step.maxRetries
      });
    } else {
      // Mark saga as failed and start compensation
      saga.status = SagaStatus.FAILED;
      this.logger.error('Step failed permanently, starting compensation', {
        sagaId,
        stepId,
        retryCount: step.retryCount
      });
      
      // Start compensation asynchronously
      this.startCompensation(sagaId, `Step ${stepId} failed: ${error}`);
    }

    await this.updateSaga(sagaId, saga);
  }

  async startCompensation(sagaId: string, reason: string): Promise<CompensationResult> {
    const startTime = Date.now();
    
    try {
      const saga = await this.getSaga(sagaId);
      
      this.logger.info('Starting saga compensation', {
        sagaId,
        reason,
        compensationSteps: saga.compensationPlan.length
      });

      saga.status = SagaStatus.COMPENSATING;
      await this.updateSaga(sagaId, saga);

      const compensatedSteps: string[] = [];
      const failedCompensations: string[] = [];

      // Execute compensation steps in reverse order
      for (const compensationStep of saga.compensationPlan.reverse()) {
        try {
          await this.executeCompensationStep(sagaId, compensationStep.stepId);
          compensationStep.executed = true;
          compensationStep.executedAt = new Date();
          compensatedSteps.push(compensationStep.stepId);
        } catch (error) {
          this.logger.error('Compensation step failed', {
            sagaId,
            stepId: compensationStep.stepId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          failedCompensations.push(compensationStep.stepId);
        }
      }

      saga.status = failedCompensations.length === 0 ? SagaStatus.COMPENSATED : SagaStatus.FAILED;
      await this.updateSaga(sagaId, saga);

      const result: CompensationResult = {
        sagaId,
        compensatedSteps,
        failedCompensations,
        finalStatus: saga.status,
        completedAt: new Date()
      };

      this.metrics.incrementCounter('saga_compensation_completed', {
        sagaId,
        compensatedSteps: compensatedSteps.length.toString(),
        failedCompensations: failedCompensations.length.toString()
      });

      this.logger.info('Saga compensation completed', {
        sagaId,
        compensatedSteps: compensatedSteps.length,
        failedCompensations: failedCompensations.length,
        finalStatus: saga.status,
        processingTime: Date.now() - startTime
      });

      return result;

    } catch (error) {
      this.logger.error('Saga compensation failed', {
        sagaId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });

      throw error;
    }
  }

  async executeCompensationStep(sagaId: string, stepId: string): Promise<void> {
    const saga = await this.getSaga(sagaId);
    const compensationStep = saga.compensationPlan.find(cs => cs.stepId === stepId);
    
    if (!compensationStep) {
      throw new Error(`Compensation step not found: ${stepId}`);
    }

    const handler = this.compensationHandlers.get(compensationStep.action);
    if (!handler) {
      throw new Error(`No compensation handler found: ${compensationStep.action}`);
    }

    await handler.execute(compensationStep.parameters, saga);
  }

  async monitorSagas(): Promise<SagaMonitoringResult> {
    const allSagas = Array.from(this.sagas.values());
    
    const totalSagas = allSagas.length;
    const activeSagas = allSagas.filter(s => s.status === SagaStatus.IN_PROGRESS).length;
    const completedSagas = allSagas.filter(s => s.status === SagaStatus.COMPLETED).length;
    const failedSagas = allSagas.filter(s => s.status === SagaStatus.FAILED).length;
    const compensatingSagas = allSagas.filter(s => s.status === SagaStatus.COMPENSATING).length;
    const expiredSagas = allSagas.filter(s => s.expiresAt < new Date()).length;
    
    const completedSagasWithTime = allSagas.filter(s => 
      s.status === SagaStatus.COMPLETED && s.updatedAt && s.createdAt
    );
    
    const averageExecutionTime = completedSagasWithTime.length > 0
      ? completedSagasWithTime.reduce((sum, s) => 
          sum + (s.updatedAt!.getTime() - s.createdAt.getTime()), 0
        ) / completedSagasWithTime.length
      : 0;

    return {
      totalSagas,
      activeSagas,
      completedSagas,
      failedSagas,
      compensatingSagas,
      expiredSagas,
      averageExecutionTime
    };
  }

  async recoverFailedSagas(): Promise<SagaRecoveryResult> {
    const failedSagas = await this.findSagasByStatus(SagaStatus.FAILED);
    const recoveredSagas: string[] = [];
    const failedRecoveries: string[] = [];

    for (const saga of failedSagas) {
      try {
        // Attempt to recover saga by retrying failed steps
        const failedSteps = saga.steps.filter(s => s.status === StepStatus.FAILED);
        
        for (const step of failedSteps) {
          if (step.retryCount < step.maxRetries) {
            step.status = StepStatus.PENDING;
            step.retryCount = 0; // Reset retry count for recovery
          }
        }

        saga.status = SagaStatus.IN_PROGRESS;
        await this.updateSaga(saga.id, saga);
        recoveredSagas.push(saga.id);

      } catch (error) {
        this.logger.error('Failed to recover saga', {
          sagaId: saga.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        failedRecoveries.push(saga.id);
      }
    }

    return {
      recoveredSagas,
      failedRecoveries,
      totalProcessed: failedSagas.length
    };
  }

  async cleanupExpiredSagas(): Promise<SagaCleanupResult> {
    const expiredSagas = await this.findExpiredSagas();
    const cleanedSagas: string[] = [];
    const errors: string[] = [];

    for (const saga of expiredSagas) {
      try {
        // Start compensation for expired sagas if not already done
        if (saga.status !== SagaStatus.COMPENSATED && saga.status !== SagaStatus.COMPENSATING) {
          await this.startCompensation(saga.id, 'Saga expired');
        }
        
        // Clean up saga after compensation
        await this.deleteSaga(saga.id);
        cleanedSagas.push(saga.id);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${saga.id}: ${errorMessage}`);
      }
    }

    return {
      cleanedSagas,
      totalCleaned: cleanedSagas.length,
      errors
    };
  }

  async findSagasByStatus(status: SagaStatus): Promise<PaymentSaga[]> {
    return Array.from(this.sagas.values()).filter(saga => saga.status === status);
  }

  async findSagasByUser(userId: string): Promise<PaymentSaga[]> {
    return Array.from(this.sagas.values()).filter(saga => saga.userId === userId);
  }

  async findExpiredSagas(): Promise<PaymentSaga[]> {
    const now = new Date();
    return Array.from(this.sagas.values()).filter(saga => saga.expiresAt < now);
  }

  private generateSagaId(): string {
    return `saga_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeHandlers(): void {
    // Initialize step handlers
    this.stepHandlers.set('validate_payment', new PaymentValidationHandler());
    this.stepHandlers.set('initiate_payment', new PaymentInitiationHandler());
    this.stepHandlers.set('confirm_payment', new PaymentConfirmationHandler());
    this.stepHandlers.set('allocate_credits', new CreditAllocationHandler());
    this.stepHandlers.set('send_notification', new NotificationHandler());

    // Initialize compensation handlers
    this.compensationHandlers.set('cancel_payment', new PaymentCancellationHandler());
    this.compensationHandlers.set('deduct_credits', new CreditDeductionHandler());
    this.compensationHandlers.set('void_payment_intent', new PaymentVoidHandler());
  }
}

// Handler interfaces and implementations

interface StepHandler {
  execute(input: any, saga: PaymentSaga): Promise<any>;
}

interface CompensationHandler {
  execute(parameters: any, saga: PaymentSaga): Promise<void>;
}

class PaymentValidationHandler implements StepHandler {
  async execute(input: any, saga: PaymentSaga): Promise<any> {
    // Mock validation logic
    return { validated: true, validationId: `val_${Date.now()}` };
  }
}

class PaymentInitiationHandler implements StepHandler {
  async execute(input: any, saga: PaymentSaga): Promise<any> {
    // Mock payment initiation
    return { paymentIntentId: `pi_${Date.now()}`, clientSecret: `secret_${Date.now()}` };
  }
}

class PaymentConfirmationHandler implements StepHandler {
  async execute(input: any, saga: PaymentSaga): Promise<any> {
    // Mock payment confirmation
    return { confirmed: true, transactionId: `txn_${Date.now()}` };
  }
}

class CreditAllocationHandler implements StepHandler {
  async execute(input: any, saga: PaymentSaga): Promise<any> {
    // Mock credit allocation
    return { allocated: true, creditTransactionId: `credit_${Date.now()}` };
  }
}

class NotificationHandler implements StepHandler {
  async execute(input: any, saga: PaymentSaga): Promise<any> {
    // Mock notification sending
    return { sent: true, notificationId: `notif_${Date.now()}` };
  }
}

class PaymentCancellationHandler implements CompensationHandler {
  async execute(parameters: any, saga: PaymentSaga): Promise<void> {
    // Mock payment cancellation
    console.log('Cancelling payment for saga:', saga.id);
  }
}

class CreditDeductionHandler implements CompensationHandler {
  async execute(parameters: any, saga: PaymentSaga): Promise<void> {
    // Mock credit deduction
    console.log('Deducting credits for saga:', saga.id);
  }
}

class PaymentVoidHandler implements CompensationHandler {
  async execute(parameters: any, saga: PaymentSaga): Promise<void> {
    // Mock payment intent voiding
    console.log('Voiding payment intent for saga:', saga.id);
  }
}