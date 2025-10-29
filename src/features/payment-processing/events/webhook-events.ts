/**
 * Webhook Event Handlers
 * Handles incoming webhooks from payment providers
 */

import { onRequest } from 'firebase-functions/v2/https';
import { PaymentProvider, PaymentWebhook, WebhookType } from '../../../shared/types/payment-system';
import { WebhookValidator } from '../utils/webhook-validator';

/**
 * Stripe webhook handler
 */
export const stripeWebhookHandler = onRequest(
  {
    region: 'us-central1',
    cors: false, // Disable CORS for webhook endpoints
    memory: '256MiB',
    timeoutSeconds: 30
  },
  async (req, res) => {
    try {
      // Only accept POST requests
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const payload = req.body;
      const signature = req.headers['stripe-signature'] as string;
      
      if (!signature) {
        res.status(400).json({ error: 'Missing Stripe signature' });
        return;
      }

      // Get webhook secret from environment
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error('Missing Stripe webhook secret');
        res.status(500).json({ error: 'Webhook configuration error' });
        return;
      }

      // Validate webhook
      const validation = WebhookValidator.validateWebhook(
        JSON.stringify(payload),
        req.headers as Record<string, string>,
        webhookSecret,
        PaymentProvider.STRIPE
      );

      if (!validation.isValid) {
        console.error('Invalid Stripe webhook:', validation.errors);
        res.status(400).json({ error: 'Invalid webhook signature' });
        return;
      }

      // Process webhook
      await processStripeWebhook(validation.parsedPayload, req.headers as Record<string, string>);

      // Acknowledge receipt
      res.status(200).json({ received: true });

    } catch (error) {
      console.error('Stripe webhook processing failed:', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

/**
 * PayPal webhook handler
 */
export const paypalWebhookHandler = onRequest(
  {
    region: 'us-central1',
    cors: false, // Disable CORS for webhook endpoints
    memory: '256MiB',
    timeoutSeconds: 30
  },
  async (req, res) => {
    try {
      // Only accept POST requests
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const payload = req.body;
      const headers = req.headers as Record<string, string>;
      
      // Get webhook secret from environment
      const webhookSecret = process.env.PAYPAL_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error('Missing PayPal webhook secret');
        res.status(500).json({ error: 'Webhook configuration error' });
        return;
      }

      // Validate webhook
      const validation = WebhookValidator.validateWebhook(
        JSON.stringify(payload),
        headers,
        webhookSecret,
        PaymentProvider.PAYPAL
      );

      if (!validation.isValid) {
        console.error('Invalid PayPal webhook:', validation.errors);
        res.status(400).json({ error: 'Invalid webhook signature' });
        return;
      }

      // Process webhook
      await processPayPalWebhook(validation.parsedPayload, headers);

      // Acknowledge receipt
      res.status(200).json({ received: true });

    } catch (error) {
      console.error('PayPal webhook processing failed:', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

/**
 * Process Stripe webhook events
 */
async function processStripeWebhook(payload: any, headers: Record<string, string>): Promise<void> {
  try {
    console.log('Processing Stripe webhook:', {
      eventId: payload.id,
      eventType: payload.type,
      created: payload.created
    });

    // Check for duplicate webhooks
    const retryInfo = WebhookValidator.extractRetryInfo(headers);
    if (retryInfo.isRetry) {
      console.log('Stripe webhook retry detected:', {
        eventId: payload.id,
        attemptNumber: retryInfo.attemptNumber
      });
    }

    // Create webhook object
    const webhook: PaymentWebhook = {
      id: payload.id,
      type: mapStripeEventType(payload.type),
      provider: PaymentProvider.STRIPE,
      paymentId: extractStripePaymentId(payload),
      status: extractStripePaymentStatus(payload),
      data: payload,
      signature: headers['stripe-signature'] || '',
      timestamp: new Date(payload.created * 1000),
      processed: false,
      retryCount: retryInfo.attemptNumber || 0
    };

    // Process based on event type
    switch (webhook.type) {
      case WebhookType.PAYMENT_SUCCEEDED:
        await handleStripePaymentSucceeded(webhook);
        break;
      case WebhookType.PAYMENT_FAILED:
        await handleStripePaymentFailed(webhook);
        break;
      case WebhookType.PAYMENT_REFUNDED:
        await handleStripePaymentRefunded(webhook);
        break;
      case WebhookType.PAYMENT_DISPUTED:
        await handleStripePaymentDisputed(webhook);
        break;
      default:
        console.log('Unhandled Stripe webhook event:', payload.type);
    }

    // Mark as processed
    webhook.processed = true;

  } catch (error) {
    console.error('Failed to process Stripe webhook:', {
      eventId: payload.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Process PayPal webhook events
 */
async function processPayPalWebhook(payload: any, headers: Record<string, string>): Promise<void> {
  try {
    console.log('Processing PayPal webhook:', {
      eventId: payload.id,
      eventType: payload.event_type,
      createTime: payload.create_time
    });

    // Create webhook object
    const webhook: PaymentWebhook = {
      id: payload.id,
      type: mapPayPalEventType(payload.event_type),
      provider: PaymentProvider.PAYPAL,
      paymentId: extractPayPalPaymentId(payload),
      status: extractPayPalPaymentStatus(payload),
      data: payload,
      signature: headers['paypal-transmission-sig'] || '',
      timestamp: new Date(payload.create_time),
      processed: false,
      retryCount: 0
    };

    // Process based on event type
    switch (webhook.type) {
      case WebhookType.PAYMENT_SUCCEEDED:
        await handlePayPalPaymentSucceeded(webhook);
        break;
      case WebhookType.PAYMENT_FAILED:
        await handlePayPalPaymentFailed(webhook);
        break;
      case WebhookType.PAYMENT_REFUNDED:
        await handlePayPalPaymentRefunded(webhook);
        break;
      default:
        console.log('Unhandled PayPal webhook event:', payload.event_type);
    }

    // Mark as processed
    webhook.processed = true;

  } catch (error) {
    console.error('Failed to process PayPal webhook:', {
      eventId: payload.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Handle Stripe payment succeeded webhook
 */
async function handleStripePaymentSucceeded(webhook: PaymentWebhook): Promise<void> {
  console.log('Handling Stripe payment succeeded:', {
    paymentId: webhook.paymentId,
    amount: webhook.data.data?.object?.amount
  });

  // TODO: Trigger credit allocation through orchestrator
  // This will be implemented when orchestrator integration is ready
}

/**
 * Handle Stripe payment failed webhook
 */
async function handleStripePaymentFailed(webhook: PaymentWebhook): Promise<void> {
  console.log('Handling Stripe payment failed:', {
    paymentId: webhook.paymentId,
    failureCode: webhook.data.data?.object?.last_payment_error?.code
  });

  // TODO: Trigger payment failure cleanup through orchestrator
}

/**
 * Handle Stripe payment refunded webhook
 */
async function handleStripePaymentRefunded(webhook: PaymentWebhook): Promise<void> {
  console.log('Handling Stripe payment refunded:', {
    paymentId: webhook.paymentId,
    refundAmount: webhook.data.data?.object?.amount_refunded
  });

  // TODO: Trigger credit deduction through orchestrator
}

/**
 * Handle Stripe payment disputed webhook
 */
async function handleStripePaymentDisputed(webhook: PaymentWebhook): Promise<void> {
  console.log('Handling Stripe payment disputed:', {
    paymentId: webhook.paymentId,
    disputeReason: webhook.data.data?.object?.reason
  });

  // TODO: Trigger dispute handling workflow
}

/**
 * Handle PayPal payment succeeded webhook
 */
async function handlePayPalPaymentSucceeded(webhook: PaymentWebhook): Promise<void> {
  console.log('Handling PayPal payment succeeded:', {
    paymentId: webhook.paymentId,
    amount: webhook.data.resource?.amount?.value
  });

  // TODO: Trigger credit allocation through orchestrator
}

/**
 * Handle PayPal payment failed webhook
 */
async function handlePayPalPaymentFailed(webhook: PaymentWebhook): Promise<void> {
  console.log('Handling PayPal payment failed:', {
    paymentId: webhook.paymentId
  });

  // TODO: Trigger payment failure cleanup through orchestrator
}

/**
 * Handle PayPal payment refunded webhook
 */
async function handlePayPalPaymentRefunded(webhook: PaymentWebhook): Promise<void> {
  console.log('Handling PayPal payment refunded:', {
    paymentId: webhook.paymentId,
    refundAmount: webhook.data.resource?.amount?.value
  });

  // TODO: Trigger credit deduction through orchestrator
}

/**
 * Map Stripe event types to our webhook types
 */
function mapStripeEventType(stripeEventType: string): WebhookType {
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

/**
 * Map PayPal event types to our webhook types
 */
function mapPayPalEventType(paypalEventType: string): WebhookType {
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

/**
 * Extract payment ID from Stripe webhook
 */
function extractStripePaymentId(payload: any): string {
  return payload.data?.object?.id || payload.id || '';
}

/**
 * Extract payment ID from PayPal webhook
 */
function extractPayPalPaymentId(payload: any): string {
  return payload.resource?.id || '';
}

/**
 * Extract payment status from Stripe webhook
 */
function extractStripePaymentStatus(payload: any): any {
  return payload.data?.object?.status || 'unknown';
}

/**
 * Extract payment status from PayPal webhook
 */
function extractPayPalPaymentStatus(payload: any): any {
  return payload.resource?.status || 'unknown';
}