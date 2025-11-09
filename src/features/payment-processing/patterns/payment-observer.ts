/**
 * Payment Observer Pattern
 * Implements observer pattern for payment event notifications
 */

import { PaymentResult, PaymentStatus } from '../../../shared/types/payment-system';
import { IStructuredLogger } from '../../../shared/observability/logger';

/**
 * Payment event types
 */
export enum PaymentEventType {
  PAYMENT_INITIATED = 'payment_initiated',
  PAYMENT_PROCESSING = 'payment_processing',
  PAYMENT_COMPLETED = 'payment_completed',
  PAYMENT_FAILED = 'payment_failed',
  PAYMENT_REFUNDED = 'payment_refunded',
  PAYMENT_DISPUTED = 'payment_disputed'
}

/**
 * Payment event data
 */
export interface PaymentEvent {
  type: PaymentEventType;
  paymentResult: PaymentResult;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Observer interface for payment events
 */
export interface IPaymentObserver {
  /**
   * Update method called when payment event occurs
   */
  update(event: PaymentEvent): Promise<void>;

  /**
   * Get observer name for identification
   */
  getName(): string;

  /**
   * Get event types this observer is interested in
   */
  getInterestedEvents(): PaymentEventType[];
}

/**
 * Subject interface for payment events
 */
export interface IPaymentSubject {
  /**
   * Attach an observer
   */
  attach(observer: IPaymentObserver): void;

  /**
   * Detach an observer
   */
  detach(observer: IPaymentObserver): void;

  /**
   * Notify all observers of an event
   */
  notify(event: PaymentEvent): Promise<void>;
}

/**
 * Concrete implementation of payment subject
 */
export class PaymentEventSubject implements IPaymentSubject {
  private observers: Set<IPaymentObserver> = new Set();
  private logger: IStructuredLogger;

  constructor(logger: IStructuredLogger) {
    this.logger = logger;
  }

  public attach(observer: IPaymentObserver): void {
    this.observers.add(observer);
    this.logger.debug('Observer attached to payment events', {
      observerName: observer.getName(),
      interestedEvents: observer.getInterestedEvents()
    });
  }

  public detach(observer: IPaymentObserver): void {
    this.observers.delete(observer);
    this.logger.debug('Observer detached from payment events', {
      observerName: observer.getName()
    });
  }

  public async notify(event: PaymentEvent): Promise<void> {
    this.logger.info('Notifying observers of payment event', {
      eventType: event.type,
      paymentId: event.paymentResult.id,
      observerCount: this.observers.size
    });

    const notificationPromises: Promise<void>[] = [];

    for (const observer of this.observers) {
      // Only notify if observer is interested in this event type
      if (observer.getInterestedEvents().includes(event.type)) {
        notificationPromises.push(
          this.notifyObserver(observer, event)
        );
      }
    }

    // Wait for all notifications to complete
    await Promise.allSettled(notificationPromises);
  }

  private async notifyObserver(observer: IPaymentObserver, event: PaymentEvent): Promise<void> {
    try {
      await observer.update(event);
      this.logger.debug('Observer notified successfully', {
        observerName: observer.getName(),
        eventType: event.type
      });
    } catch (error) {
      this.logger.error('Failed to notify observer', {
        observerName: observer.getName(),
        eventType: event.type,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw - continue notifying other observers
    }
  }

  /**
   * Get count of attached observers
   */
  public getObserverCount(): number {
    return this.observers.size;
  }

  /**
   * Clear all observers
   */
  public clearObservers(): void {
    this.observers.clear();
    this.logger.debug('All observers cleared');
  }
}

/**
 * Abstract base class for payment observers
 * Implements common functionality
 */
export abstract class BasePaymentObserver implements IPaymentObserver {
  protected logger: IStructuredLogger;
  protected abstract observerName: string;
  protected abstract interestedEvents: PaymentEventType[];

  constructor(logger: IStructuredLogger) {
    this.logger = logger;
  }

  public abstract update(event: PaymentEvent): Promise<void>;

  public getName(): string {
    return this.observerName;
  }

  public getInterestedEvents(): PaymentEventType[] {
    return this.interestedEvents;
  }

  /**
   * Helper method to check if event should be processed
   */
  protected shouldProcessEvent(event: PaymentEvent): boolean {
    return this.interestedEvents.includes(event.type);
  }
}

/**
 * Credit allocation observer
 * Allocates credits when payment is completed
 */
export class CreditAllocationObserver extends BasePaymentObserver {
  protected observerName = 'CreditAllocationObserver';
  protected interestedEvents = [PaymentEventType.PAYMENT_COMPLETED];

  public async update(event: PaymentEvent): Promise<void> {
    if (!this.shouldProcessEvent(event)) {
      return;
    }

    this.logger.info('Allocating credits for completed payment', {
      paymentId: event.paymentResult.id,
      userId: event.paymentResult.userId,
      creditAmount: event.paymentResult.creditAmount
    });

    try {
      // Credit allocation logic would go here
      // This is a placeholder for the actual implementation
      await this.allocateCredits(
        event.paymentResult.userId,
        event.paymentResult.creditAmount
      );

      this.logger.info('Credits allocated successfully', {
        paymentId: event.paymentResult.id,
        userId: event.paymentResult.userId,
        creditAmount: event.paymentResult.creditAmount
      });
    } catch (error) {
      this.logger.error('Failed to allocate credits', {
        paymentId: event.paymentResult.id,
        userId: event.paymentResult.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async allocateCredits(userId: string, creditAmount: number): Promise<void> {
    // Placeholder for actual credit allocation logic
    // Would integrate with credit system service
    this.logger.debug('Credit allocation placeholder', { userId, creditAmount });
  }
}

/**
 * Email notification observer
 * Sends email notifications for payment events
 */
export class EmailNotificationObserver extends BasePaymentObserver {
  protected observerName = 'EmailNotificationObserver';
  protected interestedEvents = [
    PaymentEventType.PAYMENT_COMPLETED,
    PaymentEventType.PAYMENT_FAILED,
    PaymentEventType.PAYMENT_REFUNDED
  ];

  public async update(event: PaymentEvent): Promise<void> {
    if (!this.shouldProcessEvent(event)) {
      return;
    }

    this.logger.info('Sending email notification for payment event', {
      eventType: event.type,
      paymentId: event.paymentResult.id,
      userId: event.paymentResult.userId
    });

    try {
      await this.sendEmailNotification(event);

      this.logger.info('Email notification sent successfully', {
        eventType: event.type,
        paymentId: event.paymentResult.id
      });
    } catch (error) {
      this.logger.error('Failed to send email notification', {
        eventType: event.type,
        paymentId: event.paymentResult.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw - email failure shouldn't break payment flow
    }
  }

  private async sendEmailNotification(event: PaymentEvent): Promise<void> {
    // Placeholder for actual email sending logic
    // Would integrate with email service
    this.logger.debug('Email notification placeholder', {
      eventType: event.type,
      userId: event.paymentResult.userId
    });
  }
}

/**
 * Analytics tracking observer
 * Tracks payment events for analytics
 */
export class AnalyticsTrackingObserver extends BasePaymentObserver {
  protected observerName = 'AnalyticsTrackingObserver';
  protected interestedEvents = [
    PaymentEventType.PAYMENT_INITIATED,
    PaymentEventType.PAYMENT_COMPLETED,
    PaymentEventType.PAYMENT_FAILED
  ];

  public async update(event: PaymentEvent): Promise<void> {
    if (!this.shouldProcessEvent(event)) {
      return;
    }

    this.logger.info('Tracking payment event for analytics', {
      eventType: event.type,
      paymentId: event.paymentResult.id,
      amount: event.paymentResult.amount
    });

    try {
      await this.trackEvent(event);

      this.logger.debug('Payment event tracked successfully', {
        eventType: event.type,
        paymentId: event.paymentResult.id
      });
    } catch (error) {
      this.logger.error('Failed to track payment event', {
        eventType: event.type,
        paymentId: event.paymentResult.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw - analytics failure shouldn't break payment flow
    }
  }

  private async trackEvent(event: PaymentEvent): Promise<void> {
    // Placeholder for actual analytics tracking logic
    // Would integrate with analytics service
    this.logger.debug('Analytics tracking placeholder', {
      eventType: event.type,
      paymentId: event.paymentResult.id
    });
  }
}

/**
 * Fraud detection observer
 * Monitors payment events for fraud patterns
 */
export class FraudDetectionObserver extends BasePaymentObserver {
  protected observerName = 'FraudDetectionObserver';
  protected interestedEvents = [
    PaymentEventType.PAYMENT_INITIATED,
    PaymentEventType.PAYMENT_COMPLETED,
    PaymentEventType.PAYMENT_FAILED
  ];

  public async update(event: PaymentEvent): Promise<void> {
    if (!this.shouldProcessEvent(event)) {
      return;
    }

    this.logger.info('Analyzing payment for fraud patterns', {
      eventType: event.type,
      paymentId: event.paymentResult.id,
      userId: event.paymentResult.userId
    });

    try {
      const isSuspicious = await this.analyzeFraudPatterns(event);

      if (isSuspicious) {
        this.logger.warn('Suspicious payment pattern detected', {
          paymentId: event.paymentResult.id,
          userId: event.paymentResult.userId,
          eventType: event.type
        });
        // Would trigger fraud investigation workflow
      }
    } catch (error) {
      this.logger.error('Failed to analyze payment for fraud', {
        eventType: event.type,
        paymentId: event.paymentResult.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw - fraud detection failure shouldn't break payment flow
    }
  }

  private async analyzeFraudPatterns(event: PaymentEvent): Promise<boolean> {
    // Placeholder for actual fraud detection logic
    // Would integrate with fraud detection service
    this.logger.debug('Fraud detection placeholder', {
      paymentId: event.paymentResult.id
    });
    return false; // No fraud detected in placeholder
  }
}
