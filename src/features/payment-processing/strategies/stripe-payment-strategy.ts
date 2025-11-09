/**
 * Stripe Payment Strategy
 * Concrete implementation of payment strategy for Stripe payments
 */

import {
  PaymentRequest,
  PaymentResult,
  PaymentMethod,
  PaymentStatus,
  TraditionalPaymentRequest,
  PaymentProvider
} from '../../../shared/types/payment-system';
import { PaymentStrategy } from '../patterns/payment-strategy';
import { IStructuredLogger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';

/**
 * Stripe payment strategy implementation
 */
export class StripePaymentStrategy extends PaymentStrategy {
  protected strategyName = 'StripePaymentStrategy';
  private supportedMethods: PaymentMethod[] = [
    PaymentMethod.CREDIT_CARD,
    PaymentMethod.DEBIT_CARD,
    PaymentMethod.APPLE_PAY,
    PaymentMethod.GOOGLE_PAY
  ];

  constructor(logger: IStructuredLogger, metrics: IMetricsCollector) {
    super(logger, metrics);
  }

  public supportsPaymentMethod(method: PaymentMethod): boolean {
    return this.supportedMethods.includes(method);
  }

  protected async validateRequest(request: PaymentRequest): Promise<void> {
    // Call parent validation
    await super.validateRequest(request);

    // Stripe-specific validation
    const traditionalRequest = request as TraditionalPaymentRequest;

    if (traditionalRequest.cardToken && traditionalRequest.cardToken.trim().length === 0) {
      throw new Error('Card token is required for Stripe payments');
    }

    if (traditionalRequest.cardLast4) {
      if (traditionalRequest.cardLast4.length !== 4 || !/^\d{4}$/.test(traditionalRequest.cardLast4)) {
        throw new Error('Invalid card last 4 digits');
      }
    }
  }

  protected async preProcessPayment(request: PaymentRequest): Promise<void> {
    this.logger.debug('Pre-processing Stripe payment', {
      userId: request.userId,
      amount: request.amount
    });

    // Stripe-specific pre-processing
    // Could include customer creation, payment method validation, etc.
  }

  protected async executePayment(request: PaymentRequest): Promise<PaymentResult> {
    const traditionalRequest = request as TraditionalPaymentRequest;

    this.logger.info('Executing Stripe payment', {
      userId: request.userId,
      amount: request.amount,
      paymentMethod: request.paymentMethod
    });

    try {
      // Mock Stripe payment processing
      // In production, this would integrate with actual Stripe SDK
      const paymentIntentId = await this.createStripePaymentIntent(traditionalRequest);
      const confirmedPayment = await this.confirmStripePayment(paymentIntentId, traditionalRequest);

      const result: PaymentResult = {
        id: confirmedPayment.id,
        requestId: request.id,
        userId: request.userId,
        status: PaymentStatus.COMPLETED,
        amount: request.amount,
        creditAmount: request.creditAmount,
        paymentMethod: request.paymentMethod,
        providerId: PaymentProvider.STRIPE,
        providerTransactionId: confirmedPayment.id,
        providerResponse: confirmedPayment,
        processedAt: new Date(),
        retryCount: 0,
        processingDuration: 0,
        providerLatency: 1500,
        fees: [
          {
            type: 'PROCESSING_FEE' as any,
            amount: request.amount * 0.029 + 0.30,
            currency: request.currency,
            description: 'Stripe processing fee',
            provider: 'stripe'
          }
        ],
        netAmount: request.amount - (request.amount * 0.029 + 0.30)
      };

      return result;

    } catch (error) {
      this.logger.error('Stripe payment execution failed', {
        userId: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  protected async postProcessPayment(result: PaymentResult): Promise<void> {
    this.logger.debug('Post-processing Stripe payment', {
      paymentId: result.id,
      status: result.status
    });

    // Stripe-specific post-processing
    // Could include receipt generation, webhook setup, etc.
  }

  /**
   * Create Stripe payment intent
   */
  private async createStripePaymentIntent(request: TraditionalPaymentRequest): Promise<string> {
    // Mock implementation - would use actual Stripe SDK
    this.logger.debug('Creating Stripe payment intent', {
      amount: request.amount,
      currency: request.currency
    });

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));

    return `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Confirm Stripe payment
   */
  private async confirmStripePayment(
    paymentIntentId: string,
    request: TraditionalPaymentRequest
  ): Promise<any> {
    // Mock implementation - would use actual Stripe SDK
    this.logger.debug('Confirming Stripe payment', {
      paymentIntentId,
      userId: request.userId
    });

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      id: paymentIntentId,
      status: 'succeeded',
      amount: request.amount * 100, // Stripe uses cents
      currency: request.currency.toLowerCase(),
      payment_method: request.cardToken,
      created: Math.floor(Date.now() / 1000)
    };
  }
}
