/**
 * Payment Processing Types Index
 * Central export point for all payment processing types
 */

// Re-export shared payment system types
export * from '../../../shared/types/payment-system';

// Payment processing specific types
export interface PaymentProcessingConfig {
  stripe: StripeConfig;
  paypal: PayPalConfig;
  validation: ValidationConfig;
  limits: PaymentLimits;
}

export interface StripeConfig {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  apiVersion: string;
  environment: 'test' | 'live';
}

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
  webhookId: string;
}

export interface ValidationConfig {
  fraudThreshold: number;
  riskThresholds: {
    low: number;
    medium: number;
    high: number;
  };
  kycRequiredAmount: number;
  enableDeviceFingerprinting: boolean;
}

export interface PaymentLimits {
  minimumAmount: number;
  maximumAmount: number;
  dailyLimit: number;
  monthlyLimit: number;
  transactionLimit: number;
}

export interface PaymentProcessingMetrics {
  totalProcessed: number;
  successRate: number;
  averageProcessingTime: number;
  fraudRate: number;
  chargebackRate: number;
}

export interface PaymentProviderMetrics {
  provider: string;
  transactionCount: number;
  successRate: number;
  averageLatency: number;
  errorRate: number;
  uptime: number;
}