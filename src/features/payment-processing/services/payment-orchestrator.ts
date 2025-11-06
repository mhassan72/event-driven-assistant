/**
 * Payment Orchestrator Service
 * Coordinates payment processing workflows, saga patterns, and error recovery
 */

import { 
  PaymentRequest,
  TraditionalPaymentRequest,
  Web3PaymentRequest,
  PaymentResult,
  PaymentStatus,
  PaymentMethod,
  PaymentError,
  PaymentErrorType
} from '../../../shared/types/payment-system';
import { ITraditionalPaymentService, PaymentInitiationResult, PaymentConfirmationData } from './traditional-payments';
import { IPaymentValidator, ValidationResult } from './payment-validator';
import { IPaymentWebhookHandler } from './payment-webhook-handler';
import { IStructuredLogger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';

export interface IPaymentOrchestrator {
  // Payment processing workflows
  processPayment(request: PaymentRequest): Promise<PaymentProcessingResult>;
  confirmPayment(paymentId: string, confirmationData: any): Promise<PaymentResult>;
  
  // Saga pattern operations
  startPaymentSaga(request: PaymentRequest): Promise<PaymentSaga>;
  compensatePaymentSaga(sagaId: string, reason: string): Promise<CompensationResult>;
  
  // Error recovery and retry
  retryFailedPayment(paymentId: string): Promise<PaymentResult>;
  handlePaymentFailure(paymentId: string, error: PaymentError): Promise<FailureHandlingResult>;
  
  // Status and monitoring
  getPaymentStatus(paymentId: string): Promise<PaymentStatusResult>;
  getPaymentHistory(userId: string, limit?: number): Promise<PaymentHistoryResult>;
  
  // Reconciliation and audit
  reconcilePayments(startDate: Date, endDate: Date): Promise<ReconciliationResult>;
  auditPaymentIntegrity(): Promise<AuditResult>;
}

export interface PaymentProcessingResult {
  paymentId: string;
  sagaId: string;
  status: PaymentProcessingStatus;
  validationResult: ValidationResult;
  initiationResult?: PaymentInitiationResult;
  error?: PaymentError;
  nextSteps: string[];
  estimatedCompletionTime?: Date;
}

export interface PaymentSaga {
  id: string;
  paymentId: string;
  userId: string;
  status: SagaStatus;
  steps: SagaStep[];
  compensationPlan: CompensationStep[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface SagaStep {
  id: string;
  name: string;
  status: StepStatus;
  input: any;
  output?: any;
  error?: string;
  retryCount: number;
  maxRetries: number;
  executedAt?: Date;
  compensated: boolean;
}

export interface CompensationStep {
  stepId: string;
  action: string;
  parameters: any;
  executed: boolean;
  executedAt?: Date;
}

export interface CompensationResult {
  sagaId: string;
  compensatedSteps: string[];
  failedCompensations: string[];
  finalStatus: SagaStatus;
  completedAt: Date;
}

export interface FailureHandlingResult {
  paymentId: string;
  handlingStrategy: FailureStrategy;
  retryScheduled: boolean;
  retryAt?: Date;
  compensationRequired: boolean;
  userNotified: boolean;
}

export interface PaymentStatusResult {
  paymentId: string;
  status: PaymentStatus;
  amount: number;
  creditAmount: number;
  provider?: string;
  createdAt: Date;
  updatedAt: Date;
  estimatedCompletion?: Date;
  failureReason?: string;
}

export interface PaymentHistoryResult {
  payments: PaymentStatusResult[];
  totalCount: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface ReconciliationResult {
  period: { startDate: Date; endDate: Date };
  totalPayments: number;
  reconciledPayments: number;
  discrepancies: PaymentDiscrepancy[];
  totalAmount: number;
  totalCreditsIssued: number;
  reconciliationAccuracy: number;
}

export interface PaymentDiscrepancy {
  paymentId: string;
  type: DiscrepancyType;
  description: string;
  expectedValue: any;
  actualValue: any;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface AuditResult {
  totalPayments: number;
  integrityScore: number;
  issues: AuditIssue[];
  recommendations: string[];
  auditedAt: Date;
}

export interface AuditIssue {
  type: string;
  description: string;
  affectedPayments: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

export enum PaymentProcessingStatus {
  VALIDATING = 'validating',
  VALIDATED = 'validated',
  INITIATING = 'initiating',
  AWAITING_CONFIRMATION = 'awaiting_confirmation',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum SagaStatus {
  STARTED = 'started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  COMPENSATING = 'compensating',
  COMPENSATED = 'compensated'
}

export enum StepStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  COMPENSATED = 'compensated'
}

export enum FailureStrategy {
  RETRY = 'retry',
  COMPENSATE = 'compensate',
  MANUAL_REVIEW = 'manual_review',
  CANCEL = 'cancel'
}

export enum DiscrepancyType {
  AMOUNT_MISMATCH = 'amount_mismatch',
  STATUS_MISMATCH = 'status_mismatch',
  MISSING_PAYMENT = 'missing_payment',
  DUPLICATE_PAYMENT = 'duplicate_payment',
  CREDIT_ALLOCATION_ERROR = 'credit_allocation_error'
}

export class PaymentOrchestrator implements IPaymentOrchestrator {
  private traditionalPaymentService: ITraditionalPaymentService;
  private paymentValidator: IPaymentValidator;
  private _webhookHandler: IPaymentWebhookHandler;
  private logger: IStructuredLogger;
  private _metrics: IMetricsCollector;
  private activeSagas: Map<string, PaymentSaga> = new Map();

  constructor(
    traditionalPaymentService: ITraditionalPaymentService,
    paymentValidator: IPaymentValidator,
    webhookHandler: IPaymentWebhookHandler,
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ) {
    this.traditionalPaymentService = traditionalPaymentService;
    this.paymentValidator = paymentValidator;
    this._webhookHandler = webhookHandler;
    this.logger = logger;
    this.metrics = metrics;
  }

  async processPayment(request: PaymentRequest): Promise<PaymentProcessingResult> {
    const startTime = Date.now();
    const paymentId = this.generatePaymentId();
    const sagaId = this.generateSagaId();
    
    try {
      this.logger.info('Starting payment processing', {
        paymentId,
        sagaId,
        userId: request.userId,
        amount: request.amount,
        paymentMethod: request.paymentMethod,
        correlationId: request.correlationId
      });

      // Step 1: Validate payment request
      const validationResult = await this.paymentValidator.validatePaymentRequest(request);
      
      if (!validationResult.isValid) {
        const result: PaymentProcessingResult = {
          paymentId,
          sagaId,
          status: PaymentProcessingStatus.FAILED,
          validationResult,
          error: validationResult.errors[0],
          nextSteps: ['Fix validation errors and retry']
        };

        this.metrics.incrementCounter('payment_processing_failed', {
          userId: request.userId,
          reason: 'validation_failed',
          paymentMethod: request.paymentMethod
        });

        return result;
      }

      // Step 2: Start payment saga
      const saga = await this.startPaymentSaga(request);
      
      // Step 3: Initiate payment based on method
      let initiationResult: PaymentInitiationResult | undefined;
      
      if (this.isTraditionalPaymentMethod(request.paymentMethod)) {
        initiationResult = await this.traditionalPaymentService.initiatePayment(request as TraditionalPaymentRequest);
      } else {
        // Web3 payments will be handled in task 9.2
        throw new Error('Web3 payments not yet implemented');
      }

      // Step 4: Update saga with initiation result
      await this.updateSagaStep(saga.id, 'initiate_payment', StepStatus.COMPLETED, initiationResult);

      const result: PaymentProcessingResult = {
        paymentId: initiationResult.paymentId,
        sagaId,
        status: PaymentProcessingStatus.AWAITING_CONFIRMATION,
        validationResult,
        initiationResult,
        nextSteps: this.generateNextSteps(initiationResult),
        estimatedCompletionTime: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      };

      this.metrics.incrementCounter('payment_processing_initiated', {
        userId: request.userId,
        paymentMethod: request.paymentMethod,
        provider: initiationResult.provider,
        amount: request.amount.toString()
      });

      this.logger.info('Payment processing initiated successfully', {
        paymentId: result.paymentId,
        sagaId,
        userId: request.userId,
        provider: initiationResult.provider,
        processingTime: Date.now() - startTime
      });

      return result;

    } catch (error) {
      this.logger.error('Payment processing failed', {
        paymentId,
        sagaId,
        userId: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });

      this.metrics.incrementCounter('payment_processing_failed', {
        userId: request.userId,
        reason: 'processing_error',
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      });

      // Start compensation if saga was created
      if (this.activeSagas.has(sagaId)) {
        await this.compensatePaymentSaga(sagaId, 'Processing failed');
      }

      throw error;
    }
  }

  async confirmPayment(paymentId: string, confirmationData: any): Promise<PaymentResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Confirming payment', {
        paymentId,
        provider: confirmationData.provider
      });

      // Find associated saga
      const saga = this.findSagaByPaymentId(paymentId);
      if (saga) {
        await this.updateSagaStep(saga.id, 'confirm_payment', StepStatus.EXECUTING);
      }

      let result: PaymentResult;

      if (confirmationData.provider === 'stripe' || confirmationData.provider === 'paypal') {
        result = await this.traditionalPaymentService.confirmPayment(paymentId, confirmationData);
      } else {
        throw new Error(`Unsupported payment provider: ${confirmationData.provider}`);
      }

      // Update saga on success
      if (saga) {
        await this.updateSagaStep(saga.id, 'confirm_payment', StepStatus.COMPLETED, result);
        await this.updateSagaStep(saga.id, 'allocate_credits', StepStatus.EXECUTING);
        
        // Trigger credit allocation (will be implemented when credit service is available)
        await this.allocateCredits(result);
        
        await this.updateSagaStep(saga.id, 'allocate_credits', StepStatus.COMPLETED);
        saga.status = SagaStatus.COMPLETED;
      }

      this.metrics.incrementCounter('payment_confirmed', {
        paymentId,
        provider: confirmationData.provider,
        status: result.status,
        amount: result.amount.toString()
      });

      this.logger.info('Payment confirmed successfully', {
        paymentId: result.id,
        originalPaymentId: paymentId,
        provider: confirmationData.provider,
        amount: result.amount,
        creditAmount: result.creditAmount,
        processingTime: Date.now() - startTime
      });

      return result;

    } catch (error) {
      this.logger.error('Payment confirmation failed', {
        paymentId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });

      // Handle failure in saga
      const saga = this.findSagaByPaymentId(paymentId);
      if (saga) {
        await this.updateSagaStep(saga.id, 'confirm_payment', StepStatus.FAILED, null, error instanceof Error ? error.message : 'Unknown error');
        await this.compensatePaymentSaga(saga.id, 'Payment confirmation failed');
      }

      throw error;
    }
  }

  async startPaymentSaga(request: PaymentRequest): Promise<PaymentSaga> {
    const sagaId = this.generateSagaId();
    
    const saga: PaymentSaga = {
      id: sagaId,
      paymentId: '', // Will be set after initiation
      userId: request.userId,
      status: SagaStatus.STARTED,
      steps: [
        {
          id: 'validate_request',
          name: 'Validate Payment Request',
          status: StepStatus.COMPLETED,
          input: request,
          retryCount: 0,
          maxRetries: 0,
          compensated: false
        },
        {
          id: 'initiate_payment',
          name: 'Initiate Payment',
          status: StepStatus.PENDING,
          input: request,
          retryCount: 0,
          maxRetries: 3,
          compensated: false
        },
        {
          id: 'confirm_payment',
          name: 'Confirm Payment',
          status: StepStatus.PENDING,
          input: null,
          retryCount: 0,
          maxRetries: 3,
          compensated: false
        },
        {
          id: 'allocate_credits',
          name: 'Allocate Credits',
          status: StepStatus.PENDING,
          input: null,
          retryCount: 0,
          maxRetries: 5,
          compensated: false
        }
      ],
      compensationPlan: [
        {
          stepId: 'allocate_credits',
          action: 'deduct_credits',
          parameters: { reason: 'payment_failed' },
          executed: false
        },
        {
          stepId: 'confirm_payment',
          action: 'cancel_payment',
          parameters: { reason: 'saga_compensation' },
          executed: false
        },
        {
          stepId: 'initiate_payment',
          action: 'void_payment_intent',
          parameters: { reason: 'saga_compensation' },
          executed: false
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    };

    this.activeSagas.set(sagaId, saga);
    
    this.logger.info('Payment saga started', {
      sagaId,
      userId: request.userId,
      stepCount: saga.steps.length
    });

    return saga;
  }

  async compensatePaymentSaga(sagaId: string, reason: string): Promise<CompensationResult> {
    const startTime = Date.now();
    
    try {
      const saga = this.activeSagas.get(sagaId);
      if (!saga) {
        throw new Error(`Saga not found: ${sagaId}`);
      }

      this.logger.info('Starting saga compensation', {
        sagaId,
        reason,
        stepCount: saga.compensationPlan.length
      });

      saga.status = SagaStatus.COMPENSATING;
      const compensatedSteps: string[] = [];
      const failedCompensations: string[] = [];

      // Execute compensation steps in reverse order
      for (const compensationStep of saga.compensationPlan.reverse()) {
        try {
          await this.executeCompensationStep(compensationStep, saga);
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
      saga.updatedAt = new Date();

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
        failedCompensations: failedCompensations.length.toString(),
        finalStatus: saga.status
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

  async retryFailedPayment(paymentId: string): Promise<PaymentResult> {
    // Implementation for retrying failed payments
    throw new Error('Retry failed payment not yet implemented');
  }

  async handlePaymentFailure(paymentId: string, error: PaymentError): Promise<FailureHandlingResult> {
    // Implementation for handling payment failures
    throw new Error('Handle payment failure not yet implemented');
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatusResult> {
    // Mock implementation - would query actual database
    return {
      paymentId,
      status: PaymentStatus.PENDING,
      amount: 24.00,
      creditAmount: 1000,
      provider: 'stripe',
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  async getPaymentHistory(userId: string, limit: number = 10): Promise<PaymentHistoryResult> {
    // Mock implementation - would query actual database
    return {
      payments: [],
      totalCount: 0,
      hasMore: false
    };
  }

  async reconcilePayments(startDate: Date, endDate: Date): Promise<ReconciliationResult> {
    // Implementation for payment reconciliation
    throw new Error('Payment reconciliation not yet implemented');
  }

  async auditPaymentIntegrity(): Promise<AuditResult> {
    // Implementation for payment integrity audit
    throw new Error('Payment integrity audit not yet implemented');
  }

  private generatePaymentId(): string {
    return `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSagaId(): string {
    return `saga_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isTraditionalPaymentMethod(method: PaymentMethod): boolean {
    return [
      PaymentMethod.CREDIT_CARD,
      PaymentMethod.DEBIT_CARD,
      PaymentMethod.PAYPAL,
      PaymentMethod.APPLE_PAY,
      PaymentMethod.GOOGLE_PAY,
      PaymentMethod.BANK_TRANSFER
    ].includes(method);
  }

  private generateNextSteps(initiationResult: PaymentInitiationResult): string[] {
    const steps: string[] = [];
    
    if (initiationResult.clientSecret) {
      steps.push('Complete payment using Stripe client secret');
    }
    
    if (initiationResult.approvalUrl) {
      steps.push('Redirect user to PayPal approval URL');
    }
    
    steps.push('Wait for payment confirmation');
    steps.push('Credits will be allocated upon successful payment');
    
    return steps;
  }

  private findSagaByPaymentId(paymentId: string): PaymentSaga | undefined {
    for (const saga of this.activeSagas.values()) {
      if (saga.paymentId === paymentId) {
        return saga;
      }
    }
    return undefined;
  }

  private async updateSagaStep(
    sagaId: string, 
    stepId: string, 
    status: StepStatus, 
    output?: any, 
    error?: string
  ): Promise<void> {
    const saga = this.activeSagas.get(sagaId);
    if (!saga) return;

    const step = saga.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = status;
    step.output = output;
    step.error = error;
    step.executedAt = new Date();
    
    if (status === StepStatus.FAILED) {
      step.retryCount++;
    }

    saga.updatedAt = new Date();
  }

  private async executeCompensationStep(compensationStep: CompensationStep, saga: PaymentSaga): Promise<void> {
    this.logger.info('Executing compensation step', {
      sagaId: saga.id,
      stepId: compensationStep.stepId,
      action: compensationStep.action
    });

    switch (compensationStep.action) {
      case 'deduct_credits':
        await this.compensateCredits(saga.userId, compensationStep.parameters);
        break;
      case 'cancel_payment':
        await this.cancelPayment(saga.paymentId, compensationStep.parameters);
        break;
      case 'void_payment_intent':
        await this.voidPaymentIntent(saga.paymentId, compensationStep.parameters);
        break;
      default:
        this.logger.warn('Unknown compensation action', {
          action: compensationStep.action,
          sagaId: saga.id
        });
    }
  }

  private async allocateCredits(paymentResult: PaymentResult): Promise<void> {
    // This will be implemented when credit service is available
    this.logger.info('Allocating credits', {
      userId: paymentResult.userId,
      creditAmount: paymentResult.creditAmount,
      paymentId: paymentResult.id
    });
  }

  private async compensateCredits(userId: string, parameters: any): Promise<void> {
    // This will be implemented when credit service is available
    this.logger.info('Compensating credits', { userId, parameters });
  }

  private async cancelPayment(paymentId: string, parameters: any): Promise<void> {
    // This will be implemented with actual payment cancellation
    this.logger.info('Cancelling payment', { paymentId, parameters });
  }

  private async voidPaymentIntent(paymentId: string, parameters: any): Promise<void> {
    // This will be implemented with actual payment intent voiding
    this.logger.info('Voiding payment intent', { paymentId, parameters });
  }
}