/**
 * Traditional Payment Service
 * Orchestrates traditional payment methods (Stripe, PayPal, etc.)
 */

import { 
  TraditionalPaymentRequest, 
  PaymentResult, 
  PaymentMethod,
  PaymentStatus,
  PaymentError,
  PaymentErrorType
} from '../../../shared/types/payment-system';
import { IStripeService, StripePaymentIntent, CreditPackage, PricingCalculation } from './stripe-service';
import { IPayPalService, PayPalOrder } from './paypal-service';
import { IStructuredLogger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';

export interface ITraditionalPaymentService {
  // Payment processing
  initiatePayment(request: TraditionalPaymentRequest): Promise<PaymentInitiationResult>;
  confirmPayment(paymentId: string, confirmationData: PaymentConfirmationData): Promise<PaymentResult>;
  
  // Refunds and disputes
  processRefund(paymentId: string, amount?: number, reason?: string): Promise<RefundResult>;
  handleDispute(disputeId: string, evidence?: any): Promise<DisputeResult>;
  
  // Pricing and packages
  getCreditPackages(): Promise<CreditPackage[]>;
  calculatePricing(creditAmount: number): Promise<PricingCalculation>;
  
  // Customer management
  createCustomer(userId: string, email: string, name: string): Promise<CustomerResult>;
  
  // Payment methods
  getPaymentMethods(userId: string): Promise<PaymentMethodResult[]>;
  addPaymentMethod(userId: string, paymentMethodData: any): Promise<PaymentMethodResult>;
  removePaymentMethod(paymentMethodId: string): Promise<void>;
}

export interface PaymentInitiationResult {
  paymentId: string;
  provider: string;
  clientSecret?: string; // For Stripe
  approvalUrl?: string; // For PayPal
  status: string;
  expiresAt: Date;
  metadata: Record<string, any>;
}

export interface PaymentConfirmationData {
  provider: string;
  paymentMethodId?: string; // For Stripe
  payerId?: string; // For PayPal
  additionalData?: Record<string, any>;
}

export interface RefundResult {
  refundId: string;
  paymentId: string;
  amount: number;
  status: string;
  provider: string;
  processedAt: Date;
}

export interface DisputeResult {
  disputeId: string;
  paymentId: string;
  status: string;
  provider: string;
  evidence?: any;
  processedAt: Date;
}

export interface CustomerResult {
  customerId: string;
  userId: string;
  provider: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface PaymentMethodResult {
  id: string;
  type: string;
  provider: string;
  displayName: string;
  isDefault: boolean;
  metadata: Record<string, any>;
}

export class TraditionalPaymentService implements ITraditionalPaymentService {
  private stripeService: IStripeService;
  private paypalService: IPayPalService;
  private logger: IStructuredLogger;
  private _metrics: IMetricsCollector;

  constructor(
    stripeService: IStripeService,
    paypalService: IPayPalService,
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ) {
    this._stripeService = stripeService;
    this.paypalService = paypalService;
    this.logger = logger;
    this.metrics = metrics;
  }

  async initiatePayment(request: TraditionalPaymentRequest): Promise<PaymentInitiationResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Initiating traditional payment', {
        userId: request.userId,
        paymentMethod: request.paymentMethod,
        amount: request.amount,
        creditAmount: request.creditAmount,
        correlationId: request.correlationId
      });

      let result: PaymentInitiationResult;

      switch (request.paymentMethod) {
        case PaymentMethod.CREDIT_CARD:
        case PaymentMethod.DEBIT_CARD:
        case PaymentMethod.APPLE_PAY:
        case PaymentMethod.GOOGLE_PAY:
          result = await this.initiateStripePayment(request);
          break;
          
        case PaymentMethod.PAYPAL:
          result = await this.initiatePayPalPayment(request);
          break;
          
        default:
          throw new Error(`Unsupported payment method: ${request.paymentMethod}`);
      }

      this.metrics.incrementCounter('traditional_payment_initiated', {
        userId: request.userId,
        paymentMethod: request.paymentMethod,
        provider: result.provider,
        amount: request.amount.toString()
      });

      this.logger.info('Traditional payment initiated successfully', {
        paymentId: result.paymentId,
        userId: request.userId,
        provider: result.provider,
        processingTime: Date.now() - startTime
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to initiate traditional payment', {
        userId: request.userId,
        paymentMethod: request.paymentMethod,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });

      this.metrics.incrementCounter('traditional_payment_initiation_failed', {
        userId: request.userId,
        paymentMethod: request.paymentMethod,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      });

      throw error;
    }
  }

  private async initiateStripePayment(request: TraditionalPaymentRequest): Promise<PaymentInitiationResult> {
    const paymentIntent = await this._stripeService.createPaymentIntent(request);
    
    return {
      paymentId: paymentIntent.id,
      provider: 'stripe',
      clientSecret: paymentIntent.clientSecret,
      status: paymentIntent.status,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      metadata: {
        paymentIntentId: paymentIntent.id,
        userId: request.userId,
        creditAmount: request.creditAmount
      }
    };
  }

  private async initiatePayPalPayment(request: TraditionalPaymentRequest): Promise<PaymentInitiationResult> {
    const order = await this.paypalService.createOrder(request);
    
    return {
      paymentId: order.id,
      provider: 'paypal',
      approvalUrl: order.approvalUrl,
      status: order.status,
      expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000), // 3 hours
      metadata: {
        orderId: order.id,
        userId: request.userId,
        creditAmount: request.creditAmount
      }
    };
  }

  async confirmPayment(paymentId: string, confirmationData: PaymentConfirmationData): Promise<PaymentResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Confirming traditional payment', {
        paymentId,
        provider: confirmationData.provider
      });

      let result: PaymentResult;

      switch (confirmationData.provider) {
        case 'stripe':
          if (!confirmationData.paymentMethodId) {
            throw new Error('Payment method ID required for Stripe confirmation');
          }
          result = await this._stripeService.confirmPaymentIntent(paymentId, confirmationData.paymentMethodId);
          break;
          
        case 'paypal':
          result = await this.paypalService.captureOrder(paymentId);
          break;
          
        default:
          throw new Error(`Unsupported payment provider: ${confirmationData.provider}`);
      }

      this.metrics.incrementCounter('traditional_payment_confirmed', {
        paymentId,
        provider: confirmationData.provider,
        status: result.status,
        amount: result.amount.toString()
      });

      this.logger.info('Traditional payment confirmed successfully', {
        paymentId: result.id,
        originalPaymentId: paymentId,
        provider: confirmationData.provider,
        amount: result.amount,
        creditAmount: result.creditAmount,
        processingTime: Date.now() - startTime
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to confirm traditional payment', {
        paymentId,
        provider: confirmationData.provider,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });

      this.metrics.incrementCounter('traditional_payment_confirmation_failed', {
        paymentId,
        provider: confirmationData.provider,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      });

      throw error;
    }
  }

  async processRefund(paymentId: string, amount?: number, reason?: string): Promise<RefundResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Processing traditional payment refund', {
        paymentId,
        amount,
        reason
      });

      // Determine provider from payment ID format
      const provider = this.determineProviderFromPaymentId(paymentId);
      
      let refundId: string;
      let status: string;

      switch (provider) {
        case 'stripe':
          const stripeRefund = await this._stripeService.createRefund(paymentId, amount, reason);
          refundId = stripeRefund.id;
          status = stripeRefund.status;
          break;
          
        case 'paypal':
          const paypalRefund = await this.paypalService.createRefund(paymentId, amount, reason);
          refundId = paypalRefund.id;
          status = paypalRefund.status;
          break;
          
        default:
          throw new Error(`Cannot determine provider for payment ID: ${paymentId}`);
      }

      const result: RefundResult = {
        refundId,
        paymentId,
        amount: amount || 0,
        status,
        provider,
        processedAt: new Date()
      };

      this.metrics.incrementCounter('traditional_payment_refunded', {
        paymentId,
        provider,
        amount: (amount || 0).toString()
      });

      this.logger.info('Traditional payment refund processed successfully', {
        refundId: result.refundId,
        paymentId,
        provider,
        amount: result.amount,
        processingTime: Date.now() - startTime
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to process traditional payment refund', {
        paymentId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });

      throw error;
    }
  }

  async handleDispute(disputeId: string, evidence?: any): Promise<DisputeResult> {
    // Implementation will be added when dispute handling is required
    throw new Error('Dispute handling not yet implemented');
  }

  async getCreditPackages(): Promise<CreditPackage[]> {
    // Use Stripe service for credit packages (could be configurable)
    return this._stripeService.getCreditPackages();
  }

  async calculatePricing(creditAmount: number): Promise<PricingCalculation> {
    // Use Stripe service for pricing calculation (could be configurable)
    return this._stripeService.calculatePricing(creditAmount);
  }

  async createCustomer(userId: string, email: string, name: string): Promise<CustomerResult> {
    try {
      // Create customer in primary provider (Stripe)
      const stripeCustomer = await this._stripeService.createCustomer(userId, email, name);
      
      return {
        customerId: stripeCustomer.id,
        userId,
        provider: 'stripe',
        email,
        name,
        createdAt: stripeCustomer.createdAt
      };

    } catch (error) {
      this.logger.error('Failed to create customer', {
        userId,
        email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getPaymentMethods(userId: string): Promise<PaymentMethodResult[]> {
    // Implementation will retrieve saved payment methods
    return [];
  }

  async addPaymentMethod(userId: string, paymentMethodData: any): Promise<PaymentMethodResult> {
    // Implementation will add new payment method
    throw new Error('Add payment method not yet implemented');
  }

  async removePaymentMethod(paymentMethodId: string): Promise<void> {
    // Implementation will remove payment method
    throw new Error('Remove payment method not yet implemented');
  }

  private determineProviderFromPaymentId(paymentId: string): string {
    if (paymentId.startsWith('pi_') || paymentId.startsWith('ch_')) {
      return 'stripe';
    } else if (paymentId.startsWith('PAYPAL_') || paymentId.includes('PAYPAL')) {
      return 'paypal';
    } else {
      throw new Error(`Cannot determine provider from payment ID: ${paymentId}`);
    }
  }
}