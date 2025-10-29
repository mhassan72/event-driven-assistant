/**
 * Payment Webhook Handler
 * Processes webhooks from payment providers and triggers appropriate actions
 */

import { 
  PaymentWebhook, 
  WebhookType, 
  PaymentProvider,
  PaymentStatus
} from '../../../shared/types/payment-system';
import { IStripeService } from './stripe-service';
import { IPayPalService } from './paypal-service';
import { IStructuredLogger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';

export interface IPaymentWebhookHandler {
  // Webhook processing
  processWebhook(provider: PaymentProvider, payload: string, headers: Record<string, string>): Promise<WebhookProcessingResult>;
  validateWebhook(provider: PaymentProvider, payload: string, headers: Record<string, string>): boolean;
  
  // Event handling
  handlePaymentSucceeded(webhook: PaymentWebhook): Promise<void>;
  handlePaymentFailed(webhook: PaymentWebhook): Promise<void>;
  handlePaymentRefunded(webhook: PaymentWebhook): Promise<void>;
  handlePaymentDisputed(webhook: PaymentWebhook): Promise<void>;
}

export interface WebhookProcessingResult {
  webhookId: string;
  provider: PaymentProvider;
  eventType: WebhookType;
  paymentId?: string;
  processed: boolean;
  error?: string;
  processingTime: number;
}

export class PaymentWebhookHandler implements IPaymentWebhookHandler {
  private stripeService: IStripeService;
  private paypalService: IPayPalService;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;

  constructor(
    stripeService: IStripeService,
    paypalService: IPayPalService,
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ) {
    this.stripeService = stripeService;
    this.paypalService = paypalService;
    this.logger = logger;
    this.metrics = metrics;
  }

  async processWebhook(
    provider: PaymentProvider, 
    payload: string, 
    headers: Record<string, string>
  ): Promise<WebhookProcessingResult> {
    const startTime = Date.now();
    const webhookId = this.generateWebhookId(provider);
    
    try {
      this.logger.info('Processing payment webhook', {
        webhookId,
        provider,
        payloadSize: payload.length
      });

      // Validate webhook signature
      const isValid = this.validateWebhook(provider, payload, headers);
      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }

      // Parse webhook data
      const webhookData = JSON.parse(payload);
      const eventType = this.mapProviderEventToWebhookType(provider, webhookData);
      
      const webhook: PaymentWebhook = {
        id: webhookId,
        type: eventType,
        provider,
        paymentId: this.extractPaymentId(provider, webhookData),
        status: this.extractPaymentStatus(provider, webhookData),
        data: webhookData,
        signature: headers['stripe-signature'] || headers['paypal-transmission-sig'] || '',
        timestamp: new Date(),
        processed: false,
        retryCount: 0
      };

      // Process webhook based on event type
      await this.handleWebhookEvent(webhook);

      const result: WebhookProcessingResult = {
        webhookId,
        provider,
        eventType,
        paymentId: webhook.paymentId,
        processed: true,
        processingTime: Date.now() - startTime
      };

      this.metrics.incrementCounter('payment_webhook_processed', {
        provider,
        eventType,
        status: 'success'
      });

      this.logger.info('Payment webhook processed successfully', {
        webhookId,
        provider,
        eventType,
        paymentId: webhook.paymentId,
        processingTime: result.processingTime
      });

      return result;

    } catch (error) {
      const result: WebhookProcessingResult = {
        webhookId,
        provider,
        eventType: WebhookType.PAYMENT_PENDING, // Default
        processed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      };

      this.metrics.incrementCounter('payment_webhook_processed', {
        provider,
        status: 'failed',
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      });

      this.logger.error('Failed to process payment webhook', {
        webhookId,
        provider,
        error: result.error,
        processingTime: result.processingTime
      });

      throw error;
    }
  }

  validateWebhook(provider: PaymentProvider, payload: string, headers: Record<string, string>): boolean {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          const stripeSignature = headers['stripe-signature'];
          if (!stripeSignature) return false;
          return this.stripeService.validateWebhook(payload, stripeSignature);
          
        case PaymentProvider.PAYPAL:
          return this.paypalService.validateWebhook(payload, headers);
          
        default:
          this.logger.warn('Unknown payment provider for webhook validation', { provider });
          return false;
      }
    } catch (error) {
      this.logger.error('Webhook validation error', {
        provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  private async handleWebhookEvent(webhook: PaymentWebhook): Promise<void> {
    switch (webhook.type) {
      case WebhookType.PAYMENT_SUCCEEDED:
        await this.handlePaymentSucceeded(webhook);
        break;
        
      case WebhookType.PAYMENT_FAILED:
        await this.handlePaymentFailed(webhook);
        break;
        
      case WebhookType.PAYMENT_REFUNDED:
        await this.handlePaymentRefunded(webhook);
        break;
        
      case WebhookType.PAYMENT_DISPUTED:
        await this.handlePaymentDisputed(webhook);
        break;
        
      case WebhookType.PAYMENT_CONFIRMED:
        await this.handlePaymentConfirmed(webhook);
        break;
        
      default:
        this.logger.warn('Unhandled webhook event type', {
          webhookId: webhook.id,
          eventType: webhook.type,
          provider: webhook.provider
        });
    }
  }

  async handlePaymentSucceeded(webhook: PaymentWebhook): Promise<void> {
    try {
      this.logger.info('Handling payment succeeded webhook', {
        webhookId: webhook.id,
        paymentId: webhook.paymentId,
        provider: webhook.provider
      });

      // Extract payment details from webhook data
      const paymentDetails = this.extractPaymentDetails(webhook);
      
      // Trigger credit allocation through orchestrator
      // This will be implemented when orchestrator is available
      await this.triggerCreditAllocation(paymentDetails);

      // Update payment status in database
      await this.updatePaymentStatus(webhook.paymentId, PaymentStatus.SUCCEEDED, webhook.data);

      this.metrics.incrementCounter('payment_succeeded_processed', {
        provider: webhook.provider,
        paymentId: webhook.paymentId
      });

    } catch (error) {
      this.logger.error('Failed to handle payment succeeded webhook', {
        webhookId: webhook.id,
        paymentId: webhook.paymentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async handlePaymentFailed(webhook: PaymentWebhook): Promise<void> {
    try {
      this.logger.info('Handling payment failed webhook', {
        webhookId: webhook.id,
        paymentId: webhook.paymentId,
        provider: webhook.provider
      });

      // Extract failure details
      const failureDetails = this.extractFailureDetails(webhook);
      
      // Trigger payment failure cleanup through orchestrator
      await this.triggerPaymentFailureCleanup(webhook.paymentId, failureDetails);

      // Update payment status in database
      await this.updatePaymentStatus(webhook.paymentId, PaymentStatus.FAILED, webhook.data);

      this.metrics.incrementCounter('payment_failed_processed', {
        provider: webhook.provider,
        paymentId: webhook.paymentId,
        failureReason: failureDetails.reason
      });

    } catch (error) {
      this.logger.error('Failed to handle payment failed webhook', {
        webhookId: webhook.id,
        paymentId: webhook.paymentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async handlePaymentRefunded(webhook: PaymentWebhook): Promise<void> {
    try {
      this.logger.info('Handling payment refunded webhook', {
        webhookId: webhook.id,
        paymentId: webhook.paymentId,
        provider: webhook.provider
      });

      // Extract refund details
      const refundDetails = this.extractRefundDetails(webhook);
      
      // Trigger credit deduction through orchestrator
      await this.triggerCreditDeduction(webhook.paymentId, refundDetails);

      // Update payment status in database
      await this.updatePaymentStatus(webhook.paymentId, PaymentStatus.REFUNDED, webhook.data);

      this.metrics.incrementCounter('payment_refunded_processed', {
        provider: webhook.provider,
        paymentId: webhook.paymentId,
        refundAmount: refundDetails.amount.toString()
      });

    } catch (error) {
      this.logger.error('Failed to handle payment refunded webhook', {
        webhookId: webhook.id,
        paymentId: webhook.paymentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async handlePaymentDisputed(webhook: PaymentWebhook): Promise<void> {
    try {
      this.logger.info('Handling payment disputed webhook', {
        webhookId: webhook.id,
        paymentId: webhook.paymentId,
        provider: webhook.provider
      });

      // Extract dispute details
      const disputeDetails = this.extractDisputeDetails(webhook);
      
      // Trigger dispute handling workflow
      await this.triggerDisputeHandling(webhook.paymentId, disputeDetails);

      // Update payment status in database
      await this.updatePaymentStatus(webhook.paymentId, PaymentStatus.DISPUTED, webhook.data);

      this.metrics.incrementCounter('payment_disputed_processed', {
        provider: webhook.provider,
        paymentId: webhook.paymentId,
        disputeReason: disputeDetails.reason
      });

    } catch (error) {
      this.logger.error('Failed to handle payment disputed webhook', {
        webhookId: webhook.id,
        paymentId: webhook.paymentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async handlePaymentConfirmed(webhook: PaymentWebhook): Promise<void> {
    // Similar to handlePaymentSucceeded but for blockchain confirmations
    await this.handlePaymentSucceeded(webhook);
  }

  private generateWebhookId(provider: PaymentProvider): string {
    return `webhook_${provider}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private mapProviderEventToWebhookType(provider: PaymentProvider, webhookData: any): WebhookType {
    switch (provider) {
      case PaymentProvider.STRIPE:
        return this.mapStripeEventType(webhookData.type);
      case PaymentProvider.PAYPAL:
        return this.mapPayPalEventType(webhookData.event_type);
      default:
        return WebhookType.PAYMENT_PENDING;
    }
  }

  private mapStripeEventType(stripeEventType: string): WebhookType {
    switch (stripeEventType) {
      case 'payment_intent.succeeded':
      case 'charge.succeeded':
        return WebhookType.PAYMENT_SUCCEEDED;
      case 'payment_intent.payment_failed':
      case 'charge.failed':
        return WebhookType.PAYMENT_FAILED;
      case 'charge.dispute.created':
        return WebhookType.PAYMENT_DISPUTED;
      case 'charge.refunded':
        return WebhookType.PAYMENT_REFUNDED;
      default:
        return WebhookType.PAYMENT_PENDING;
    }
  }

  private mapPayPalEventType(paypalEventType: string): WebhookType {
    switch (paypalEventType) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        return WebhookType.PAYMENT_SUCCEEDED;
      case 'PAYMENT.CAPTURE.DENIED':
        return WebhookType.PAYMENT_FAILED;
      case 'PAYMENT.CAPTURE.REFUNDED':
        return WebhookType.PAYMENT_REFUNDED;
      default:
        return WebhookType.PAYMENT_PENDING;
    }
  }

  private extractPaymentId(provider: PaymentProvider, webhookData: any): string {
    switch (provider) {
      case PaymentProvider.STRIPE:
        return webhookData.data?.object?.id || webhookData.id || '';
      case PaymentProvider.PAYPAL:
        return webhookData.resource?.id || '';
      default:
        return '';
    }
  }

  private extractPaymentStatus(provider: PaymentProvider, webhookData: any): PaymentStatus {
    // Extract and map provider-specific status to our PaymentStatus enum
    return PaymentStatus.PENDING; // Default implementation
  }

  private extractPaymentDetails(webhook: PaymentWebhook): any {
    // Extract relevant payment details for credit allocation
    return {
      paymentId: webhook.paymentId,
      userId: webhook.data.metadata?.userId || '',
      creditAmount: parseInt(webhook.data.metadata?.creditAmount || '0'),
      amount: webhook.data.amount || 0,
      currency: webhook.data.currency || 'USD'
    };
  }

  private extractFailureDetails(webhook: PaymentWebhook): any {
    // Extract failure reason and details
    return {
      reason: webhook.data.failure_code || webhook.data.failure_message || 'Unknown failure',
      code: webhook.data.failure_code || 'unknown_error'
    };
  }

  private extractRefundDetails(webhook: PaymentWebhook): any {
    // Extract refund amount and details
    return {
      amount: webhook.data.amount_refunded || webhook.data.amount || 0,
      reason: webhook.data.reason || 'Customer request'
    };
  }

  private extractDisputeDetails(webhook: PaymentWebhook): any {
    // Extract dispute reason and details
    return {
      reason: webhook.data.reason || 'Unknown dispute',
      amount: webhook.data.amount || 0,
      evidence: webhook.data.evidence || {}
    };
  }

  private async triggerCreditAllocation(paymentDetails: any): Promise<void> {
    // This will be implemented when orchestrator is available
    this.logger.info('Triggering credit allocation', { paymentDetails });
  }

  private async triggerPaymentFailureCleanup(paymentId: string, failureDetails: any): Promise<void> {
    // This will be implemented when orchestrator is available
    this.logger.info('Triggering payment failure cleanup', { paymentId, failureDetails });
  }

  private async triggerCreditDeduction(paymentId: string, refundDetails: any): Promise<void> {
    // This will be implemented when orchestrator is available
    this.logger.info('Triggering credit deduction for refund', { paymentId, refundDetails });
  }

  private async triggerDisputeHandling(paymentId: string, disputeDetails: any): Promise<void> {
    // This will be implemented when orchestrator is available
    this.logger.info('Triggering dispute handling', { paymentId, disputeDetails });
  }

  private async updatePaymentStatus(paymentId: string, status: PaymentStatus, providerData: any): Promise<void> {
    // This will be implemented when database service is available
    this.logger.info('Updating payment status', { paymentId, status });
  }
}