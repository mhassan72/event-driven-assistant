/**
 * Payments API Routes
 * Credit purchase and payment processing endpoints
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handling';
import { paymentLimiter } from '../middleware/rate-limiting';
import { 
  TraditionalPaymentRequest, 
  PaymentMethod
} from '../../shared/types/payment-system';
import { PaymentOrchestrator } from '../../features/payment-processing/services/payment-orchestrator';
import { TraditionalPaymentService } from '../../features/payment-processing/services/traditional-payments';
import { PaymentValidator } from '../../features/payment-processing/services/payment-validator';
import { PaymentWebhookHandler } from '../../features/payment-processing/services/payment-webhook-handler';
import { StripeService } from '../../features/payment-processing/services/stripe-service';
import { PayPalService } from '../../features/payment-processing/services/paypal-service';
import { logger } from '../../shared/observability/logger';
import { metrics } from '../../shared/observability/metrics';

const paymentsRouter = Router();

// Apply payment-specific rate limiting
paymentsRouter.use(paymentLimiter.middleware);

// Initialize services (in production, these would be injected via DI container)
// Using imported logger and metrics

const stripeService = new StripeService(
  process.env.STRIPE_SECRET_KEY || 'sk_test_mock',
  process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock',
  logger,
  metrics
);

const paypalService = new PayPalService(
  process.env.PAYPAL_CLIENT_ID || 'paypal_client_mock',
  process.env.PAYPAL_CLIENT_SECRET || 'paypal_secret_mock',
  process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
  logger,
  metrics
);

const traditionalPaymentService = new TraditionalPaymentService(
  stripeService,
  paypalService,
  logger,
  metrics
);

const paymentValidator = new PaymentValidator(logger, metrics);
const webhookHandler = new PaymentWebhookHandler(stripeService, paypalService, logger, metrics);

const paymentOrchestrator = new PaymentOrchestrator(
  traditionalPaymentService,
  paymentValidator,
  webhookHandler,
  logger,
  metrics
);

// Get payment options and credit packages
paymentsRouter.get('/options', asyncHandler(async (req: any, res: any) => {
  try {
    const creditPackages = await traditionalPaymentService.getCreditPackages();
    
    res.json({
      success: true,
      data: {
        creditPackages,
        paymentMethods: [
          {
            id: 'credit_card',
            name: 'Credit/Debit Card',
            description: 'Visa, Mastercard, American Express',
            provider: 'stripe',
            processingTime: 'Instant',
            fees: 'Standard processing fees apply'
          },
          {
            id: 'paypal',
            name: 'PayPal',
            description: 'Pay with your PayPal account',
            provider: 'paypal',
            processingTime: 'Instant',
            fees: 'PayPal processing fees apply'
          }
        ],
        limits: {
          minimum: 0.50,
          maximum: 10000,
          dailyLimit: 10000
        }
      }
    });
  } catch (error) {
    logger.error('Failed to get payment options', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.uid
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve payment options'
    });
  }
}));

// Traditional payment processing
paymentsRouter.post('/traditional', asyncHandler(async (req: any, res: any) => {
  try {
    const { creditAmount, paymentMethod, billingAddress, customerInfo } = req.body;
    
    if (!creditAmount || creditAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid credit amount is required'
      });
    }
    
    if (!paymentMethod || !Object.values(PaymentMethod).includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        error: 'Valid payment method is required'
      });
    }

    // Calculate pricing
    const pricing = await traditionalPaymentService.calculatePricing(creditAmount);
    
    // Create payment request
    const paymentRequest: TraditionalPaymentRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: req.user.uid,
      amount: pricing.finalPrice,
      currency: 'USD',
      creditAmount,
      paymentMethod,
      metadata: {
        sessionId: req.headers['x-session-id'] || '',
        userAgent: req.headers['user-agent'] || '',
        ipAddress: req.ip || req.connection.remoteAddress || ''
      },
      correlationId: `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      idempotencyKey: req.headers['idempotency-key'] || `idem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      riskAssessment: {
        overallRisk: 'low' as any,
        riskScore: 0,
        factors: [],
        recommendations: [],
        assessedAt: new Date(),
        assessedBy: 'api_request'
      },
      fraudScore: 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      customerInfo,
      billingAddress
    };

    // Process payment through orchestrator
    const result = await paymentOrchestrator.processPayment(paymentRequest);
    
    res.json({
      success: true,
      data: {
        paymentId: result.paymentId,
        sagaId: result.sagaId,
        status: result.status,
        clientSecret: result.initiationResult?.clientSecret,
        approvalUrl: result.initiationResult?.approvalUrl,
        provider: result.initiationResult?.provider,
        amount: pricing.finalPrice,
        creditAmount,
        nextSteps: result.nextSteps,
        estimatedCompletion: result.estimatedCompletionTime
      }
    });

  } catch (error) {
    logger.error('Traditional payment processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.uid,
      creditAmount: req.body.creditAmount
    });
    
    res.status(500).json({
      success: false,
      error: 'Payment processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Confirm payment (for Stripe confirmations, PayPal captures, etc.)
paymentsRouter.post('/confirm', asyncHandler(async (req: any, res: any) => {
  try {
    const { paymentId, paymentMethodId, payerId, provider } = req.body;
    
    if (!paymentId || !provider) {
      return res.status(400).json({
        success: false,
        error: 'Payment ID and provider are required'
      });
    }

    const confirmationData = {
      provider,
      paymentMethodId,
      payerId
    };

    const result = await paymentOrchestrator.confirmPayment(paymentId, confirmationData);
    
    res.json({
      success: true,
      data: {
        paymentId: result.id,
        status: result.status,
        amount: result.amount,
        creditAmount: result.creditAmount,
        provider: result.providerId,
        processedAt: result.processedAt,
        fees: result.fees,
        netAmount: result.netAmount
      }
    });

  } catch (error) {
    logger.error('Payment confirmation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.uid,
      paymentId: req.body.paymentId
    });
    
    res.status(500).json({
      success: false,
      error: 'Payment confirmation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Initialize Web3 payment service
import { Web3PaymentService } from '../../features/payment-processing/services/web3-payments';
const web3PaymentService = new Web3PaymentService(
  logger,
  metrics
);

// Web3 wallet connection
paymentsRouter.post('/crypto/connect', asyncHandler(async (req: any, res: any) => {
  try {
    const { walletAddress, walletType, signature } = req.body;
    
    if (!walletAddress || !walletType || !signature) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address, wallet type, and signature are required'
      });
    }

    const result = await web3PaymentService.connectWallet(walletAddress, walletType, signature);
    
    res.json({
      success: result.isConnected,
      data: result.isConnected ? {
        walletAddress: result.walletAddress,
        walletType: result.walletType,
        blockchain: result.blockchain,
        balance: result.balance
      } : null,
      error: result.error
    });

  } catch (error) {
    logger.error('Web3 wallet connection failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.uid
    });
    
    res.status(500).json({
      success: false,
      error: 'Wallet connection failed'
    });
  }
}));

// Cryptocurrency payment estimation
paymentsRouter.post('/crypto/estimate', asyncHandler(async (req: any, res: any) => {
  try {
    const { usdAmount, currency } = req.body;
    
    if (!usdAmount || usdAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid USD amount is required'
      });
    }
    
    if (!currency) {
      return res.status(400).json({
        success: false,
        error: 'Cryptocurrency is required'
      });
    }

    // Get conversion and gas estimates
    const conversion = await web3PaymentService.convertUSDToCrypto(usdAmount, currency);
    const blockchain = currency === 'BTC' ? 'bitcoin' : 'ethereum'; // Simplified mapping
    const gasEstimate = await web3PaymentService.estimateGasFees(blockchain as any, 'payment', conversion.cryptoAmount);
    
    res.json({
      success: true,
      data: {
        usdAmount,
        cryptoAmount: conversion.cryptoAmount,
        currency,
        exchangeRate: conversion.exchangeRate,
        gasEstimate: {
          gasLimit: gasEstimate.gasLimit,
          gasPrice: gasEstimate.gasPrice,
          estimatedCost: gasEstimate.estimatedCost,
          estimatedCostUSD: gasEstimate.estimatedCostUSD
        },
        totalCryptoAmount: conversion.totalCryptoAmount,
        fees: conversion.fees
      }
    });

  } catch (error) {
    logger.error('Crypto payment estimation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.uid
    });
    
    res.status(500).json({
      success: false,
      error: 'Payment estimation failed'
    });
  }
}));

// Cryptocurrency payment processing
paymentsRouter.post('/crypto', asyncHandler(async (req: any, res: any) => {
  try {
    const { 
      creditAmount, 
      currency, 
      walletAddress, 
      walletType, 
      blockchain,
      gasEstimate 
    } = req.body;
    
    if (!creditAmount || creditAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid credit amount is required'
      });
    }
    
    if (!currency || !walletAddress || !walletType || !blockchain) {
      return res.status(400).json({
        success: false,
        error: 'Currency, wallet address, wallet type, and blockchain are required'
      });
    }

    // Calculate USD amount for credits
    const pricing = await traditionalPaymentService.calculatePricing(creditAmount);
    
    // Create Web3 payment request
    const web3PaymentRequest = {
      id: `web3_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: req.user.uid,
      amount: pricing.finalPrice,
      currency: 'USD',
      creditAmount,
      paymentMethod: currency as any,
      metadata: {
        sessionId: req.headers['x-session-id'] || '',
        userAgent: req.headers['user-agent'] || '',
        ipAddress: req.ip || req.connection.remoteAddress || ''
      },
      correlationId: `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      idempotencyKey: req.headers['idempotency-key'] || `idem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      riskAssessment: {
        overallRisk: 'low' as any,
        riskScore: 0,
        factors: [],
        recommendations: [],
        assessedAt: new Date(),
        assessedBy: 'api_request'
      },
      fraudScore: 0,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      
      // Web3 specific fields
      walletAddress,
      walletType,
      blockchain,
      cryptoAmount: pricing.finalPrice, // Will be converted properly
      exchangeRate: 1, // Will be calculated
      gasEstimate: gasEstimate || {
        gasLimit: 21000,
        gasPrice: 20000000000,
        estimatedCost: 0.001,
        estimatedCostUSD: 2.50,
        confidence: 'medium' as any
      }
    };

    // Process Web3 payment
    const result = await web3PaymentService.processWeb3Payment(web3PaymentRequest as any);
    
    res.json({
      success: true,
      data: {
        paymentId: result.id,
        transactionHash: result.transactionHash,
        status: result.status,
        amount: result.amount,
        creditAmount: result.creditAmount,
        currency,
        blockchain,
        confirmationsRequired: 3,
        estimatedConfirmationTime: '10-30 minutes'
      }
    });

  } catch (error) {
    logger.error('Web3 payment processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.uid
    });
    
    res.status(500).json({
      success: false,
      error: 'Web3 payment processing failed'
    });
  }
}));

// Payment status tracking
paymentsRouter.get('/status/:paymentId', asyncHandler(async (req: any, res: any) => {
  try {
    const { paymentId } = req.params;
    
    const status = await paymentOrchestrator.getPaymentStatus(paymentId);
    
    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    logger.error('Failed to get payment status', {
      error: error instanceof Error ? error.message : 'Unknown error',
      paymentId: req.params.paymentId,
      userId: req.user?.uid
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve payment status'
    });
  }
}));

// Payment history
paymentsRouter.get('/history', asyncHandler(async (req: any, res: any) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    
    const history = await paymentOrchestrator.getPaymentHistory(req.user.uid, limit);
    
    res.json({
      success: true,
      data: history
    });

  } catch (error) {
    logger.error('Failed to get payment history', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.uid
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve payment history'
    });
  }
}));

// Get supported cryptocurrencies
paymentsRouter.get('/crypto/currencies', asyncHandler(async (req: any, res: any) => {
  try {
    const supportedCurrencies = await web3PaymentService.getSupportedCurrencies();
    
    res.json({
      success: true,
      data: {
        currencies: supportedCurrencies,
        count: supportedCurrencies.length
      }
    });

  } catch (error) {
    logger.error('Failed to get supported currencies', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve supported currencies'
    });
  }
}));

// Crypto transaction monitoring
paymentsRouter.get('/crypto/status/:transactionHash', asyncHandler(async (req: any, res: any) => {
  try {
    const { transactionHash } = req.params;
    const { blockchain } = req.query;
    
    if (!blockchain) {
      return res.status(400).json({
        success: false,
        error: 'Blockchain parameter is required'
      });
    }

    const status = await web3PaymentService.monitorTransaction(transactionHash, blockchain as any);
    
    res.json({
      success: true,
      data: {
        transactionHash,
        status: status.status,
        confirmations: status.confirmations,
        blockNumber: status.blockNumber,
        gasUsed: status.gasUsed,
        actualFee: status.actualFee,
        timestamp: status.timestamp
      }
    });

  } catch (error) {
    logger.error('Failed to get crypto transaction status', {
      error: error instanceof Error ? error.message : 'Unknown error',
      transactionHash: req.params.transactionHash
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve transaction status'
    });
  }
}));

export { paymentsRouter };