/**
 * Payment Processing Interfaces
 * Core interfaces for payment processing, provider configuration, and metrics
 */

// Export all payment system types
export * from './payment-system';

// ============================================================================
// Payment Processing Configuration
// ============================================================================

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

// ============================================================================
// Payment Processing Metrics
// ============================================================================

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