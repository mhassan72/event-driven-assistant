/**
 * Payment Factory Pattern
 * Creates appropriate payment strategy instances based on payment method
 */

import { PaymentMethod } from '../../../shared/types/payment-system';
import { IStructuredLogger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';
import { PaymentStrategy } from './payment-strategy';
import { StripePaymentStrategy } from '../strategies/stripe-payment-strategy';
import { PayPalPaymentStrategy } from '../strategies/paypal-payment-strategy';
import { Web3PaymentStrategy } from '../strategies/web3-payment-strategy';

/**
 * Abstract Factory for creating payment strategies
 */
export abstract class PaymentStrategyFactory {
  /**
   * Factory method to create payment strategy
   */
  public abstract createStrategy(
    paymentMethod: PaymentMethod,
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ): PaymentStrategy;

  /**
   * Get all supported payment methods
   */
  public abstract getSupportedMethods(): PaymentMethod[];
}

/**
 * Concrete factory for traditional payment strategies
 */
export class TraditionalPaymentFactory extends PaymentStrategyFactory {
  private static instance: TraditionalPaymentFactory;

  private constructor() {
    super();
  }

  /**
   * Singleton pattern for factory instance
   */
  public static getInstance(): TraditionalPaymentFactory {
    if (!TraditionalPaymentFactory.instance) {
      TraditionalPaymentFactory.instance = new TraditionalPaymentFactory();
    }
    return TraditionalPaymentFactory.instance;
  }

  public createStrategy(
    paymentMethod: PaymentMethod,
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ): PaymentStrategy {
    switch (paymentMethod) {
      case PaymentMethod.CREDIT_CARD:
      case PaymentMethod.DEBIT_CARD:
      case PaymentMethod.APPLE_PAY:
      case PaymentMethod.GOOGLE_PAY:
        return new StripePaymentStrategy(logger, metrics);

      case PaymentMethod.PAYPAL:
        return new PayPalPaymentStrategy(logger, metrics);

      default:
        throw new Error(`Unsupported traditional payment method: ${paymentMethod}`);
    }
  }

  public getSupportedMethods(): PaymentMethod[] {
    return [
      PaymentMethod.CREDIT_CARD,
      PaymentMethod.DEBIT_CARD,
      PaymentMethod.APPLE_PAY,
      PaymentMethod.GOOGLE_PAY,
      PaymentMethod.PAYPAL
    ];
  }
}

/**
 * Concrete factory for Web3 payment strategies
 */
export class Web3PaymentFactory extends PaymentStrategyFactory {
  private static instance: Web3PaymentFactory;

  private constructor() {
    super();
  }

  /**
   * Singleton pattern for factory instance
   */
  public static getInstance(): Web3PaymentFactory {
    if (!Web3PaymentFactory.instance) {
      Web3PaymentFactory.instance = new Web3PaymentFactory();
    }
    return Web3PaymentFactory.instance;
  }

  public createStrategy(
    paymentMethod: PaymentMethod,
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ): PaymentStrategy {
    switch (paymentMethod) {
      case PaymentMethod.BITCOIN:
      case PaymentMethod.ETHEREUM:
      case PaymentMethod.USDC:
      case PaymentMethod.USDT:
      case PaymentMethod.POLYGON:
      case PaymentMethod.BINANCE_SMART_CHAIN:
        return new Web3PaymentStrategy(logger, metrics);

      default:
        throw new Error(`Unsupported Web3 payment method: ${paymentMethod}`);
    }
  }

  public getSupportedMethods(): PaymentMethod[] {
    return [
      PaymentMethod.BITCOIN,
      PaymentMethod.ETHEREUM,
      PaymentMethod.USDC,
      PaymentMethod.USDT,
      PaymentMethod.POLYGON,
      PaymentMethod.BINANCE_SMART_CHAIN
    ];
  }
}

/**
 * Unified payment factory that delegates to appropriate sub-factory
 * Implements Abstract Factory pattern
 */
export class UnifiedPaymentFactory {
  private static instance: UnifiedPaymentFactory;
  private traditionalFactory: TraditionalPaymentFactory;
  private web3Factory: Web3PaymentFactory;
  private logger: IStructuredLogger;

  private constructor(logger: IStructuredLogger) {
    this.logger = logger;
    this.traditionalFactory = TraditionalPaymentFactory.getInstance();
    this.web3Factory = Web3PaymentFactory.getInstance();
  }

  /**
   * Singleton pattern for unified factory
   */
  public static getInstance(logger: IStructuredLogger): UnifiedPaymentFactory {
    if (!UnifiedPaymentFactory.instance) {
      UnifiedPaymentFactory.instance = new UnifiedPaymentFactory(logger);
    }
    return UnifiedPaymentFactory.instance;
  }

  /**
   * Create appropriate payment strategy based on payment method
   */
  public createStrategy(
    paymentMethod: PaymentMethod,
    metrics: IMetricsCollector
  ): PaymentStrategy {
    this.logger.debug('Creating payment strategy', { paymentMethod });

    // Determine which factory to use
    if (this.isTraditionalPayment(paymentMethod)) {
      return this.traditionalFactory.createStrategy(paymentMethod, this.logger, metrics);
    } else if (this.isWeb3Payment(paymentMethod)) {
      return this.web3Factory.createStrategy(paymentMethod, this.logger, metrics);
    } else {
      throw new Error(`Unsupported payment method: ${paymentMethod}`);
    }
  }

  /**
   * Get all supported payment methods
   */
  public getAllSupportedMethods(): PaymentMethod[] {
    return [
      ...this.traditionalFactory.getSupportedMethods(),
      ...this.web3Factory.getSupportedMethods()
    ];
  }

  /**
   * Check if payment method is supported
   */
  public isPaymentMethodSupported(method: PaymentMethod): boolean {
    return this.getAllSupportedMethods().includes(method);
  }

  /**
   * Check if payment method is traditional
   */
  private isTraditionalPayment(method: PaymentMethod): boolean {
    return this.traditionalFactory.getSupportedMethods().includes(method);
  }

  /**
   * Check if payment method is Web3
   */
  private isWeb3Payment(method: PaymentMethod): boolean {
    return this.web3Factory.getSupportedMethods().includes(method);
  }
}

/**
 * Payment strategy registry for dynamic strategy management
 * Implements Registry pattern
 */
export class PaymentStrategyRegistry {
  private static instance: PaymentStrategyRegistry;
  private strategies: Map<string, PaymentStrategy> = new Map();
  private logger: IStructuredLogger;

  private constructor(logger: IStructuredLogger) {
    this.logger = logger;
  }

  public static getInstance(logger: IStructuredLogger): PaymentStrategyRegistry {
    if (!PaymentStrategyRegistry.instance) {
      PaymentStrategyRegistry.instance = new PaymentStrategyRegistry(logger);
    }
    return PaymentStrategyRegistry.instance;
  }

  /**
   * Register a payment strategy
   */
  public registerStrategy(name: string, strategy: PaymentStrategy): void {
    this.logger.debug('Registering payment strategy', { name });
    this.strategies.set(name, strategy);
  }

  /**
   * Get a registered strategy by name
   */
  public getStrategy(name: string): PaymentStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * Check if strategy is registered
   */
  public hasStrategy(name: string): boolean {
    return this.strategies.has(name);
  }

  /**
   * Get all registered strategy names
   */
  public getRegisteredStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Unregister a strategy
   */
  public unregisterStrategy(name: string): boolean {
    return this.strategies.delete(name);
  }

  /**
   * Clear all registered strategies
   */
  public clearAll(): void {
    this.strategies.clear();
  }
}
