/**
 * Stripe Service Unit Tests
 * Tests for Stripe payment processing functionality
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StripeService } from '../../../../src/features/payment-processing/services/stripe-service';
import { TraditionalPaymentRequest, PaymentMethod } from '../../../../src/shared/types/payment-system';
import { StructuredLogger } from '../../../../src/shared/observability/logger';
import { MetricsCollector } from '../../../../src/shared/observability/metrics';

describe('StripeService', () => {
  let stripeService: StripeService;
  let logger: StructuredLogger;
  let metrics: MetricsCollector;

  beforeEach(() => {
    logger = new StructuredLogger('StripeServiceTest');
    metrics = new MetricsCollector();
    stripeService = new StripeService(
      'sk_test_mock_key',
      'whsec_test_mock_secret',
      logger,
      metrics
    );
  });

  describe('createPaymentIntent', () => {
    it('should create payment intent successfully', async () => {
      // Arrange
      const request: TraditionalPaymentRequest = {
        id: 'req_test_001',
        userId: 'user_test_001',
        amount: 24.00,
        currency: 'USD',
        creditAmount: 1000,
        paymentMethod: PaymentMethod.CREDIT_CARD,
        metadata: {},
        correlationId: 'corr_test_001',
        idempotencyKey: 'idem_test_001',
        riskAssessment: {
          overallRisk: 'low' as any,
          riskScore: 10,
          factors: [],
          recommendations: [],
          assessedAt: new Date(),
          assessedBy: 'test_system'
        },
        fraudScore: 10,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      };

      // Act
      const result = await stripeService.createPaymentIntent(request);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^pi_mock_/);
      expect(result.clientSecret).toBeDefined();
      expect(result.amount).toBe(2000); // $20.00 in cents (after pricing calculation)
      expect(result.currency).toBe('usd');
      expect(result.status).toBe('requires_payment_method');
      expect(result.metadata.userId).toBe('user_test_001');
      expect(result.metadata.creditAmount).toBe('1000');
    });

    it('should handle pricing calculation correctly', async () => {
      // Arrange
      const request: TraditionalPaymentRequest = {
        id: 'req_test_002',
        userId: 'user_test_002',
        amount: 45.00,
        currency: 'USD',
        creditAmount: 2500, // Should get 25% discount
        paymentMethod: PaymentMethod.CREDIT_CARD,
        metadata: {},
        correlationId: 'corr_test_002',
        idempotencyKey: 'idem_test_002',
        riskAssessment: {
          overallRisk: 'low' as any,
          riskScore: 10,
          factors: [],
          recommendations: [],
          assessedAt: new Date(),
          assessedBy: 'test_system'
        },
        fraudScore: 10,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      };

      // Act
      const result = await stripeService.createPaymentIntent(request);

      // Assert
      expect(result.amount).toBe(4500); // $45.00 in cents
      expect(result.metadata.creditAmount).toBe('2500');
    });
  });

  describe('confirmPaymentIntent', () => {
    it('should confirm payment intent successfully', async () => {
      // Arrange
      const paymentIntentId = 'pi_test_001';
      const paymentMethodId = 'pm_test_001';

      // Act
      const result = await stripeService.confirmPaymentIntent(paymentIntentId, paymentMethodId);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.requestId).toBe(paymentIntentId);
      expect(result.status).toBe('succeeded');
      expect(result.amount).toBe(24.00);
      expect(result.creditAmount).toBe(1000);
      expect(result.providerId).toBe('stripe');
      expect(result.fees).toBeDefined();
      expect(result.fees.length).toBeGreaterThan(0);
      expect(result.netAmount).toBeLessThan(result.amount);
    });
  });

  describe('createRefund', () => {
    it('should create refund successfully', async () => {
      // Arrange
      const paymentId = 'ch_test_001';
      const amount = 12.00;
      const reason = 'requested_by_customer';

      // Act
      const result = await stripeService.createRefund(paymentId, amount, reason);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^re_mock_/);
      expect(result.paymentIntentId).toBe(paymentId);
      expect(result.amount).toBe(amount);
      expect(result.status).toBe('succeeded');
      expect(result.reason).toBe(reason);
      expect(result.createdAt).toBeDefined();
    });

    it('should create full refund when amount not specified', async () => {
      // Arrange
      const paymentId = 'ch_test_002';

      // Act
      const result = await stripeService.createRefund(paymentId);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.paymentIntentId).toBe(paymentId);
      expect(result.status).toBe('succeeded');
    });
  });

  describe('validateWebhook', () => {
    it('should validate webhook signature', () => {
      // Arrange
      const payload = '{"test": "payload"}';
      const signature = 'valid_signature';

      // Act
      const isValid = stripeService.validateWebhook(payload, signature);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should reject invalid webhook signature', () => {
      // Arrange
      const payload = '{"test": "payload"}';
      const signature = '';

      // Act
      const isValid = stripeService.validateWebhook(payload, signature);

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('createCustomer', () => {
    it('should create customer successfully', async () => {
      // Arrange
      const userId = 'user_test_001';
      const email = 'test@example.com';
      const name = 'Test User';

      // Act
      const result = await stripeService.createCustomer(userId, email, name);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^cus_mock_/);
      expect(result.userId).toBe(userId);
      expect(result.email).toBe(email);
      expect(result.name).toBe(name);
      expect(result.createdAt).toBeDefined();
    });
  });

  describe('getCreditPackages', () => {
    it('should return available credit packages', async () => {
      // Act
      const packages = await stripeService.getCreditPackages();

      // Assert
      expect(packages).toBeDefined();
      expect(packages.length).toBeGreaterThan(0);
      
      const popularPackage = packages.find(p => p.popular);
      expect(popularPackage).toBeDefined();
      expect(popularPackage?.credits).toBe(1000);
      expect(popularPackage?.priceUSD).toBe(20.00);
      expect(popularPackage?.discountPercentage).toBe(17);
    });
  });

  describe('calculatePricing', () => {
    it('should calculate pricing for different credit amounts', async () => {
      // Test cases for different pricing tiers
      const testCases = [
        { credits: 500, expectedDiscount: 0 },
        { credits: 1000, expectedDiscount: 17 },
        { credits: 2500, expectedDiscount: 25 },
        { credits: 5000, expectedDiscount: 33 }
      ];

      for (const testCase of testCases) {
        // Act
        const result = await stripeService.calculatePricing(testCase.credits);

        // Assert
        expect(result.creditAmount).toBe(testCase.credits);
        expect(result.basePrice).toBeGreaterThan(0);
        expect(result.finalPrice).toBeLessThanOrEqual(result.basePrice);
        expect(result.pricePerCredit).toBeGreaterThan(0);
        
        if (testCase.expectedDiscount > 0) {
          expect(result.discount).toBeGreaterThan(0);
          expect(result.recommendedPackage).toBeDefined();
        }
      }
    });

    it('should handle custom credit amounts', async () => {
      // Arrange
      const customAmount = 750; // Between tiers

      // Act
      const result = await stripeService.calculatePricing(customAmount);

      // Assert
      expect(result.creditAmount).toBe(customAmount);
      expect(result.finalPrice).toBeGreaterThan(0);
      expect(result.pricePerCredit).toBeGreaterThan(0);
      expect(result.recommendedPackage).toBeDefined();
    });
  });
});