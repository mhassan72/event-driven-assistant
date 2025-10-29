/**
 * Payment Event Handlers
 * Firebase Functions for handling payment-related events and webhooks
 */

import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { PaymentProvider } from '../shared/types/payment-system';
import { PaymentWebhookHandler } from '../features/payment-processing/services/payment-webhook-handler';
import { PaymentOrchestrator } from '../features/payment-processing/services/payment-orchestrator';
import { Logger } from '../shared/observability/logger';
import { Metrics } from '../shared/observability/metrics';

// Initialize services
const logger = new Logger('PaymentEvents');
const metrics = new Metrics();

/**
 * Stripe webhook endpoint
 */
export const stripeWebhook = onRequest(
  {
    region: 'us-central1',
    cors: false,
    memory: '512MiB',
    timeoutSeconds: 60,
    secrets: ['STRIPE_WEBHOOK_SECRET']
  },
  async (req, res) => {
    try {
      logger.info('Stripe webhook received', {
        method: req.method,
        contentType: req.headers['content-type'],
        userAgent: req.headers['user-agent']
      });

      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const signature = req.headers['stripe-signature'] as string;
      if (!signature) {
        res.status(400).json({ error: 'Missing Stripe signature' });
        return;
      }

      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        logger.error('Missing Stripe webhook secret');
        res.status(500).json({ error: 'Webhook configuration error' });
        return;
      }

      // Get raw body for signature verification
      const payload = JSON.stringify(req.body);
      
      // Initialize webhook handler (would be injected in production)
      const webhookHandler = new PaymentWebhookHandler(
        {} as any, // Stripe service
        {} as any, // PayPal service
        logger,
        metrics
      );

      // Process webhook
      const result = await webhookHandler.processWebhook(
        PaymentProvider.STRIPE,
        payload,
        req.headers as Record<string, string>
      );

      logger.info('Stripe webhook processed successfully', {
        webhookId: result.webhookId,
        eventType: result.eventType,
        paymentId: result.paymentId,
        processingTime: result.processingTime
      });

      res.status(200).json({ 
        received: true,
        webhookId: result.webhookId,
        eventType: result.eventType
      });

    } catch (error) {
      logger.error('Stripe webhook processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      metrics.incrementCounter('stripe_webhook_failed', {
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      });

      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

/**
 * PayPal webhook endpoint
 */
export const paypalWebhook = onRequest(
  {
    region: 'us-central1',
    cors: false,
    memory: '512MiB',
    timeoutSeconds: 60,
    secrets: ['PAYPAL_WEBHOOK_SECRET']
  },
  async (req, res) => {
    try {
      logger.info('PayPal webhook received', {
        method: req.method,
        contentType: req.headers['content-type'],
        eventType: req.body?.event_type
      });

      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const webhookSecret = process.env.PAYPAL_WEBHOOK_SECRET;
      if (!webhookSecret) {
        logger.error('Missing PayPal webhook secret');
        res.status(500).json({ error: 'Webhook configuration error' });
        return;
      }

      const payload = JSON.stringify(req.body);
      
      // Initialize webhook handler
      const webhookHandler = new PaymentWebhookHandler(
        {} as any, // Stripe service
        {} as any, // PayPal service
        logger,
        metrics
      );

      // Process webhook
      const result = await webhookHandler.processWebhook(
        PaymentProvider.PAYPAL,
        payload,
        req.headers as Record<string, string>
      );

      logger.info('PayPal webhook processed successfully', {
        webhookId: result.webhookId,
        eventType: result.eventType,
        paymentId: result.paymentId,
        processingTime: result.processingTime
      });

      res.status(200).json({ 
        received: true,
        webhookId: result.webhookId,
        eventType: result.eventType
      });

    } catch (error) {
      logger.error('PayPal webhook processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      metrics.incrementCounter('paypal_webhook_failed', {
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      });

      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

/**
 * Handle payment document creation in Firestore
 */
export const onPaymentCreated = onDocumentCreated(
  {
    document: 'payments/{paymentId}',
    region: 'us-central1',
    memory: '256MiB'
  },
  async (event) => {
    try {
      const paymentData = event.data?.data();
      if (!paymentData) {
        logger.warn('Payment created event with no data', {
          paymentId: event.params.paymentId
        });
        return;
      }

      logger.info('Payment document created', {
        paymentId: event.params.paymentId,
        userId: paymentData.userId,
        amount: paymentData.amount,
        status: paymentData.status,
        paymentMethod: paymentData.paymentMethod
      });

      // Trigger payment processing workflow if needed
      if (paymentData.status === 'pending') {
        await triggerPaymentProcessing(event.params.paymentId, paymentData);
      }

      metrics.incrementCounter('payment_document_created', {
        paymentMethod: paymentData.paymentMethod,
        status: paymentData.status
      });

    } catch (error) {
      logger.error('Failed to handle payment creation', {
        paymentId: event.params.paymentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Handle payment document updates in Firestore
 */
export const onPaymentUpdated = onDocumentUpdated(
  {
    document: 'payments/{paymentId}',
    region: 'us-central1',
    memory: '256MiB'
  },
  async (event) => {
    try {
      const beforeData = event.data?.before.data();
      const afterData = event.data?.after.data();
      
      if (!beforeData || !afterData) {
        logger.warn('Payment updated event with missing data', {
          paymentId: event.params.paymentId
        });
        return;
      }

      const statusChanged = beforeData.status !== afterData.status;
      
      if (statusChanged) {
        logger.info('Payment status changed', {
          paymentId: event.params.paymentId,
          userId: afterData.userId,
          oldStatus: beforeData.status,
          newStatus: afterData.status,
          amount: afterData.amount
        });

        // Handle status-specific logic
        await handlePaymentStatusChange(
          event.params.paymentId,
          beforeData.status,
          afterData.status,
          afterData
        );

        metrics.incrementCounter('payment_status_changed', {
          oldStatus: beforeData.status,
          newStatus: afterData.status,
          paymentMethod: afterData.paymentMethod
        });
      }

    } catch (error) {
      logger.error('Failed to handle payment update', {
        paymentId: event.params.paymentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Handle payment saga document creation
 */
export const onPaymentSagaCreated = onDocumentCreated(
  {
    document: 'payment_sagas/{sagaId}',
    region: 'us-central1',
    memory: '256MiB'
  },
  async (event) => {
    try {
      const sagaData = event.data?.data();
      if (!sagaData) return;

      logger.info('Payment saga created', {
        sagaId: event.params.sagaId,
        paymentId: sagaData.paymentId,
        userId: sagaData.userId,
        status: sagaData.status,
        stepCount: sagaData.steps?.length || 0
      });

      // Initialize saga monitoring
      await initializeSagaMonitoring(event.params.sagaId, sagaData);

      metrics.incrementCounter('payment_saga_created', {
        status: sagaData.status,
        stepCount: (sagaData.steps?.length || 0).toString()
      });

    } catch (error) {
      logger.error('Failed to handle saga creation', {
        sagaId: event.params.sagaId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Handle payment saga document updates
 */
export const onPaymentSagaUpdated = onDocumentUpdated(
  {
    document: 'payment_sagas/{sagaId}',
    region: 'us-central1',
    memory: '256MiB'
  },
  async (event) => {
    try {
      const beforeData = event.data?.before.data();
      const afterData = event.data?.after.data();
      
      if (!beforeData || !afterData) return;

      const statusChanged = beforeData.status !== afterData.status;
      
      if (statusChanged) {
        logger.info('Payment saga status changed', {
          sagaId: event.params.sagaId,
          paymentId: afterData.paymentId,
          oldStatus: beforeData.status,
          newStatus: afterData.status
        });

        // Handle saga status changes
        await handleSagaStatusChange(
          event.params.sagaId,
          beforeData.status,
          afterData.status,
          afterData
        );

        metrics.incrementCounter('payment_saga_status_changed', {
          oldStatus: beforeData.status,
          newStatus: afterData.status
        });
      }

    } catch (error) {
      logger.error('Failed to handle saga update', {
        sagaId: event.params.sagaId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Helper functions

async function triggerPaymentProcessing(paymentId: string, paymentData: any): Promise<void> {
  try {
    logger.info('Triggering payment processing workflow', {
      paymentId,
      userId: paymentData.userId,
      amount: paymentData.amount
    });

    // This would integrate with the payment orchestrator
    // For now, just log the trigger
    
  } catch (error) {
    logger.error('Failed to trigger payment processing', {
      paymentId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handlePaymentStatusChange(
  paymentId: string,
  oldStatus: string,
  newStatus: string,
  paymentData: any
): Promise<void> {
  try {
    switch (newStatus) {
      case 'succeeded':
        await handlePaymentSucceeded(paymentId, paymentData);
        break;
      case 'failed':
        await handlePaymentFailed(paymentId, paymentData);
        break;
      case 'refunded':
        await handlePaymentRefunded(paymentId, paymentData);
        break;
      case 'disputed':
        await handlePaymentDisputed(paymentId, paymentData);
        break;
    }
  } catch (error) {
    logger.error('Failed to handle payment status change', {
      paymentId,
      oldStatus,
      newStatus,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handlePaymentSucceeded(paymentId: string, paymentData: any): Promise<void> {
  logger.info('Handling successful payment', {
    paymentId,
    userId: paymentData.userId,
    amount: paymentData.amount,
    creditAmount: paymentData.creditAmount
  });

  // Trigger credit allocation
  // Send success notification
  // Update analytics
}

async function handlePaymentFailed(paymentId: string, paymentData: any): Promise<void> {
  logger.info('Handling failed payment', {
    paymentId,
    userId: paymentData.userId,
    amount: paymentData.amount,
    failureReason: paymentData.failureReason
  });

  // Clean up reserved resources
  // Send failure notification
  // Trigger retry if appropriate
}

async function handlePaymentRefunded(paymentId: string, paymentData: any): Promise<void> {
  logger.info('Handling refunded payment', {
    paymentId,
    userId: paymentData.userId,
    refundAmount: paymentData.refundAmount
  });

  // Deduct credits if already allocated
  // Send refund notification
  // Update financial records
}

async function handlePaymentDisputed(paymentId: string, paymentData: any): Promise<void> {
  logger.info('Handling disputed payment', {
    paymentId,
    userId: paymentData.userId,
    disputeReason: paymentData.disputeReason
  });

  // Freeze related credits
  // Notify admin team
  // Prepare dispute response
}

async function initializeSagaMonitoring(sagaId: string, sagaData: any): Promise<void> {
  logger.info('Initializing saga monitoring', {
    sagaId,
    paymentId: sagaData.paymentId,
    expiresAt: sagaData.expiresAt
  });

  // Set up timeout monitoring
  // Initialize step tracking
  // Configure failure detection
}

async function handleSagaStatusChange(
  sagaId: string,
  oldStatus: string,
  newStatus: string,
  sagaData: any
): Promise<void> {
  try {
    switch (newStatus) {
      case 'completed':
        await handleSagaCompleted(sagaId, sagaData);
        break;
      case 'failed':
        await handleSagaFailed(sagaId, sagaData);
        break;
      case 'compensating':
        await handleSagaCompensating(sagaId, sagaData);
        break;
      case 'compensated':
        await handleSagaCompensated(sagaId, sagaData);
        break;
    }
  } catch (error) {
    logger.error('Failed to handle saga status change', {
      sagaId,
      oldStatus,
      newStatus,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleSagaCompleted(sagaId: string, sagaData: any): Promise<void> {
  logger.info('Saga completed successfully', {
    sagaId,
    paymentId: sagaData.paymentId,
    completedSteps: sagaData.steps?.filter((s: any) => s.status === 'completed').length
  });

  // Clean up saga resources
  // Update success metrics
  // Notify completion
}

async function handleSagaFailed(sagaId: string, sagaData: any): Promise<void> {
  logger.error('Saga failed', {
    sagaId,
    paymentId: sagaData.paymentId,
    failedStep: sagaData.steps?.find((s: any) => s.status === 'failed')?.name
  });

  // Trigger compensation if not already started
  // Alert operations team
  // Update failure metrics
}

async function handleSagaCompensating(sagaId: string, sagaData: any): Promise<void> {
  logger.info('Saga compensation started', {
    sagaId,
    paymentId: sagaData.paymentId,
    compensationSteps: sagaData.compensationPlan?.length
  });

  // Monitor compensation progress
  // Set compensation timeout
}

async function handleSagaCompensated(sagaId: string, sagaData: any): Promise<void> {
  logger.info('Saga compensation completed', {
    sagaId,
    paymentId: sagaData.paymentId,
    compensatedSteps: sagaData.compensationPlan?.filter((s: any) => s.executed).length
  });

  // Clean up saga resources
  // Update compensation metrics
  // Notify completion
}