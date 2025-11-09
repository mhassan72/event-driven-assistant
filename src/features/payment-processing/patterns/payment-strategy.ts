/**
 * Payment Strategy Pattern
 * Defines a family of payment processing algorithms and makes them interchangeable
 */

import {
  PaymentRequest,
  PaymentResult,
  PaymentMethod,
  PaymentStatus
} from '../../../shared/types/payment-system';
import { IStructuredLogger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';

/**
 * Abstract base class for payment strategies
 * Implements Template Method pattern for common payment workflow
 */
export abstract class PaymentStrategy {
  protected logger: IStructuredLogger;
  protected metrics: IMetricsCollector;
  protected abstract strategyName: string;

  constructor(logger: IStructuredLogger, metrics: IMetricsCollector) {
    this.logger = logger;
    this.metrics = metrics;
  }

  /**
   * Template method defining the payment processing workflow
   * Subclasses cannot override this method
   */
  public async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info(`Processing payment with ${this.strategyName} strategy`, {
        userId: request.userId,
        amount: request.amount,
        correlationId: request.correlationId
      });

      // Step 1: Validate request (hook method)
      await this.validateRequest(request);

      // Step 2: Pre-process payment (hook method)
      await this.preProcessPayment(request);

      // Step 3: Execute payment (abstract method - must be implemented)
      const result = await this.executePayment(request);

      // Step 4: Post-process payment (hook method)
      await this.postProcessPayment(result);

      // Step 5: Record metrics
      this.recordSuccessMetrics(request, result, Date.now() - startTime);

      this.logger.info(`Payment processed successfully with ${this.strategyName}`, {
        paymentId: result.id,
        userId: request.userId,
        status: result.status,
        processingTime: Date.now() - startTime
      });

      return result;

    } catch (error) {
      this.recordFailureMetrics(request, error, Date.now() - startTime);
      
      this.logger.error(`Payment processing failed with ${this.strategyName}`, {
        userId: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Hook method: Validate payment request
   * Can be overridden by subclasses for custom validation
   */
  protected async validateRequest(request: PaymentRequest): Promise<void> {
    if (!request.userId || request.userId.trim().length === 0) {
      throw new Error('User ID is required');
    }

    if (!request.amount || request.amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    if (!request.currency || request.currency.length !== 3) {
      throw new Error('Valid 3-letter currency code is required');
    }
  }

  /**
   * Hook method: Pre-process payment
   * Can be overridden by subclasses for custom pre-processing
   */
  protected async preProcessPayment(request: PaymentRequest): Promise<void> {
    // Default implementation does nothing
    // Subclasses can override for custom behavior
  }

  /**
   * Abstract method: Execute payment
   * Must be implemented by concrete strategy classes
   */
  protected abstract executePayment(request: PaymentRequest): Promise<PaymentResult>;

  /**
   * Hook method: Post-process payment
   * Can be overridden by subclasses for custom post-processing
   */
  protected async postProcessPayment(result: PaymentResult): Promise<void> {
    // Default implementation does nothing
    // Subclasses can override for custom behavior
  }

  /**
   * Record success metrics
   */
  protected recordSuccessMetrics(
    request: PaymentRequest,
    result: PaymentResult,
    processingTime: number
  ): void {
    this.metrics.incrementCounter('payment_processed', {
      strategy: this.strategyName,
      paymentMethod: request.paymentMethod,
      status: result.status,
      userId: request.userId
    });

    this.metrics.recordValue('payment_processing_time', processingTime, {
      strategy: this.strategyName,
      paymentMethod: request.paymentMethod
    });

    this.metrics.recordValue('payment_amount', result.amount, {
      strategy: this.strategyName,
      currency: request.currency
    });
  }

  /**
   * Record failure metrics
   */
  protected recordFailureMetrics(
    request: PaymentRequest,
    error: unknown,
    processingTime: number
  ): void {
    this.metrics.incrementCounter('payment_processing_failed', {
      strategy: this.strategyName,
      paymentMethod: request.paymentMethod,
      errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
      userId: request.userId
    });

    this.metrics.recordValue('payment_failure_time', processingTime, {
      strategy: this.strategyName,
      paymentMethod: request.paymentMethod
    });
  }

  /**
   * Get strategy name
   */
  public getStrategyName(): string {
    return this.strategyName;
  }

  /**
   * Check if this strategy supports the given payment method
   */
  public abstract supportsPaymentMethod(method: PaymentMethod): boolean;
}

/**
 * Context class that uses a payment strategy
 * Implements Strategy pattern
 */
export class PaymentContext {
  private strategy: PaymentStrategy;
  private logger: IStructuredLogger;

  constructor(strategy: PaymentStrategy, logger: IStructuredLogger) {
    this.strategy = strategy;
    this.logger = logger;
  }

  /**
   * Set a new payment strategy
   */
  public setStrategy(strategy: PaymentStrategy): void {
    this.logger.debug('Switching payment strategy', {
      from: this.strategy.getStrategyName(),
      to: strategy.getStrategyName()
    });
    this.strategy = strategy;
  }

  /**
   * Execute payment using the current strategy
   */
  public async executePayment(request: PaymentRequest): Promise<PaymentResult> {
    if (!this.strategy.supportsPaymentMethod(request.paymentMethod)) {
      throw new Error(
        `Payment method ${request.paymentMethod} is not supported by ${this.strategy.getStrategyName()}`
      );
    }

    return this.strategy.processPayment(request);
  }

  /**
   * Get current strategy name
   */
  public getCurrentStrategy(): string {
    return this.strategy.getStrategyName();
  }
}
