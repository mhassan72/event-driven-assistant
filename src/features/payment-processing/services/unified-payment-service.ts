/**
 * Unified Payment Service
 * Orchestrates payment processing using Strategy, Factory, and Observer patterns
 * Follows OOP principles: SRP, OCP, LSP, ISP, DIP
 */

import {
  PaymentRequest,
  PaymentResult,
  PaymentMethod
} from '../../../shared/types/payment-system';
import { IStructuredLogger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';
import {
  PaymentContext,
  UnifiedPaymentFactory,
  PaymentEventSubject,
  PaymentEventType,
  CreditAllocationObserver,
  EmailNotificationObserver,
  AnalyticsTrackingObserver,
  FraudDetectionObserver
} from '../patterns';

/**
 * Unified payment service interface
 * Follows Interface Segregation Principle
 */
export interface IUnifiedPaymentService {
  /**
   * Process a payment using appropriate strategy
   */
  processPayment(request: PaymentRequest): Promise<PaymentResult>;

  /**
   * Get supported payment methods
   */
  getSupportedPaymentMethods(): PaymentMethod[];

  /**
   * Check if payment method is supported
   */
  isPaymentMethodSupported(method: PaymentMethod): boolean;
}

/**
 * Unified payment service implementation
 * Demonstrates proper use of design patterns and OOP principles
 */
export class UnifiedPaymentService implements IUnifiedPaymentService {
  private factory: UnifiedPaymentFactory;
  private eventSubject: PaymentEventSubject;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;

  constructor(logger: IStructuredLogger, metrics: IMetricsCollector) {
    this.logger = logger;
    this.metrics = metrics;
    
    // Initialize factory (Factory Pattern)
    this.factory = UnifiedPaymentFactory.getInstance(logger);
    
    // Initialize event subject (Observer Pattern)
    this.eventSubject = new PaymentEventSubject(logger);
    
    // Register observers
    this.registerObservers();
  }

  /**
   * Process payment using Strategy Pattern
   * Follows Open/Closed Principle - open for extension, closed for modification
   */
  public async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    const startTime = Date.now();

    try {
      this.logger.info('Processing payment with unified service', {
        userId: request.userId,
        paymentMethod: request.paymentMethod,
        amount: request.amount,
        correlationId: request.correlationId
      });

      // Validate payment method is supported
      if (!this.isPaymentMethodSupported(request.paymentMethod)) {
        throw new Error(`Unsupported payment method: ${request.paymentMethod}`);
      }

      // Notify observers: Payment initiated
      await this.notifyObservers(PaymentEventType.PAYMENT_INITIATED, {
        id: request.id,
        requestId: request.id,
        userId: request.userId,
        status: 'PENDING' as any,
        amount: request.amount,
        creditAmount: request.creditAmount,
        paymentMethod: request.paymentMethod,
        providerId: 'pending' as any,
        processedAt: new Date(),
        retryCount: 0,
        processingDuration: 0,
        providerLatency: 0,
        fees: [],
        netAmount: request.amount
      });

      // Create appropriate strategy using Factory Pattern
      const strategy = this.factory.createStrategy(request.paymentMethod, this.metrics);
      
      // Create payment context with strategy
      const context = new PaymentContext(strategy, this.logger);
      
      // Execute payment using Strategy Pattern
      const result = await context.executePayment(request);

      // Notify observers based on result status
      const eventType = result.status === 'COMPLETED' 
        ? PaymentEventType.PAYMENT_COMPLETED 
        : PaymentEventType.PAYMENT_FAILED;
      
      await this.notifyObservers(eventType, result);

      // Record metrics
      this.recordMetrics(request, result, Date.now() - startTime);

      this.logger.info('Payment processed successfully', {
        paymentId: result.id,
        userId: request.userId,
        status: result.status,
        strategy: strategy.getStrategyName(),
        processingTime: Date.now() - startTime
      });

      return result;

    } catch (error) {
      this.logger.error('Payment processing failed', {
        userId: request.userId,
        paymentMethod: request.paymentMethod,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });

      // Notify observers of failure
      await this.notifyObservers(PaymentEventType.PAYMENT_FAILED, {
        id: request.id,
        requestId: request.id,
        userId: request.userId,
        status: 'FAILED' as any,
        amount: request.amount,
        creditAmount: request.creditAmount,
        paymentMethod: request.paymentMethod,
        providerId: 'error' as any,
        processedAt: new Date(),
        retryCount: 0,
        processingDuration: Date.now() - startTime,
        providerLatency: 0,
        fees: [],
        netAmount: 0
      });

      throw error;
    }
  }

  /**
   * Get all supported payment methods
   */
  public getSupportedPaymentMethods(): PaymentMethod[] {
    return this.factory.getAllSupportedMethods();
  }

  /**
   * Check if payment method is supported
   */
  public isPaymentMethodSupported(method: PaymentMethod): boolean {
    return this.factory.isPaymentMethodSupported(method);
  }

  /**
   * Register observers for payment events
   * Demonstrates Observer Pattern
   */
  private registerObservers(): void {
    this.logger.debug('Registering payment observers');

    // Register credit allocation observer
    const creditObserver = new CreditAllocationObserver(this.logger);
    this.eventSubject.attach(creditObserver);

    // Register email notification observer
    const emailObserver = new EmailNotificationObserver(this.logger);
    this.eventSubject.attach(emailObserver);

    // Register analytics tracking observer
    const analyticsObserver = new AnalyticsTrackingObserver(this.logger);
    this.eventSubject.attach(analyticsObserver);

    // Register fraud detection observer
    const fraudObserver = new FraudDetectionObserver(this.logger);
    this.eventSubject.attach(fraudObserver);

    this.logger.info('Payment observers registered', {
      observerCount: this.eventSubject.getObserverCount()
    });
  }

  /**
   * Notify observers of payment event
   */
  private async notifyObservers(
    eventType: PaymentEventType,
    paymentResult: PaymentResult
  ): Promise<void> {
    try {
      await this.eventSubject.notify({
        type: eventType,
        paymentResult,
        timestamp: new Date()
      });
    } catch (error) {
      // Log error but don't throw - observer failures shouldn't break payment flow
      this.logger.error('Failed to notify observers', {
        eventType,
        paymentId: paymentResult.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Record payment metrics
   */
  private recordMetrics(
    request: PaymentRequest,
    result: PaymentResult,
    processingTime: number
  ): void {
    this.metrics.incrementCounter('unified_payment_processed', {
      paymentMethod: request.paymentMethod,
      status: result.status,
      userId: request.userId
    });

    this.metrics.recordValue('unified_payment_processing_time', processingTime, {
      paymentMethod: request.paymentMethod
    });

    this.metrics.recordValue('unified_payment_amount', result.amount, {
      currency: request.currency,
      paymentMethod: request.paymentMethod
    });
  }
}

/**
 * Payment service builder for flexible configuration
 * Demonstrates Builder Pattern
 */
export class PaymentServiceBuilder {
  private logger?: IStructuredLogger;
  private metrics?: IMetricsCollector;
  private customObservers: any[] = [];

  public setLogger(logger: IStructuredLogger): PaymentServiceBuilder {
    this.logger = logger;
    return this;
  }

  public setMetrics(metrics: IMetricsCollector): PaymentServiceBuilder {
    this.metrics = metrics;
    return this;
  }

  public addCustomObserver(observer: any): PaymentServiceBuilder {
    this.customObservers.push(observer);
    return this;
  }

  public build(): UnifiedPaymentService {
    if (!this.logger) {
      throw new Error('Logger is required');
    }
    if (!this.metrics) {
      throw new Error('Metrics collector is required');
    }

    const service = new UnifiedPaymentService(this.logger, this.metrics);
    
    // Attach custom observers if any
    // This would require exposing the event subject, which we'll skip for now
    
    return service;
  }
}
