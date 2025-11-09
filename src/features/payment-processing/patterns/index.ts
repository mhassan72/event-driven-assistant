/**
 * Payment Processing Patterns
 * Exports all design patterns for payment processing
 */

// Strategy Pattern
export {
  PaymentStrategy,
  PaymentContext
} from './payment-strategy';

// Factory Pattern
export {
  PaymentStrategyFactory,
  TraditionalPaymentFactory,
  Web3PaymentFactory,
  UnifiedPaymentFactory,
  PaymentStrategyRegistry
} from './payment-factory';

// Observer Pattern
export {
  PaymentEventType,
  PaymentEvent,
  IPaymentObserver,
  IPaymentSubject,
  PaymentEventSubject,
  BasePaymentObserver,
  CreditAllocationObserver,
  EmailNotificationObserver,
  AnalyticsTrackingObserver,
  FraudDetectionObserver
} from './payment-observer';

// Concrete Strategies
export { StripePaymentStrategy } from '../strategies/stripe-payment-strategy';
export { PayPalPaymentStrategy } from '../strategies/paypal-payment-strategy';
export { Web3PaymentStrategy } from '../strategies/web3-payment-strategy';
