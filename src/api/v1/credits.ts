/**
 * Credits API Routes
 * Credit balance and transaction management endpoints
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handling';
import { AICreditService } from '../../features/credit-system/services/ai-credit-service';
import { IMetricsCollector } from '../../shared/observability/metrics';
import { logger } from '../../shared/observability/logger';
import { 
  TransactionHistoryOptions,
  TimeRange,
  TimeGranularity
} from '../../shared/types/credit-system';

const creditsRouter = Router();

// Initialize AI Credit Service (in production, this would be dependency injected)
const metrics: IMetricsCollector = {
  increment: (name: string, value: number = 1, tags?: Record<string, string>) => {
    logger.info('Metric increment', { name, value, tags });
  },
  histogram: (name: string, value: number, tags?: Record<string, string>) => {
    logger.info('Metric histogram', { name, value, tags });
  },
  gauge: (name: string, value: number, tags?: Record<string, string>) => {
    logger.info('Metric gauge', { name, value, tags });
  }
};

const aiCreditService = new AICreditService(metrics);

// Get current credit balance
creditsRouter.get('/balance', asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.uid;
  
  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User ID not found in request'
    });
  }

  try {
    const balance = await aiCreditService.getBalance(userId);
    
    res.json({
      success: true,
      data: {
        userId: balance.userId,
        currentBalance: balance.currentBalance,
        availableBalance: balance.availableBalance,
        reservedCredits: balance.reservedCredits,
        accountStatus: balance.accountStatus,
        lifetimeCreditsEarned: balance.lifetimeCreditsEarned,
        lifetimeCreditsSpent: balance.lifetimeCreditsSpent,
        lastUpdated: balance.lastUpdated,
        healthStatus: balance.healthStatus
      }
    });
  } catch (error) {
    logger.error('Failed to get credit balance', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve credit balance'
    });
  }
}));

// Get credit transaction history
creditsRouter.get('/history', asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.uid;
  
  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User ID not found in request'
    });
  }

  try {
    // Parse query parameters
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const sortBy = req.query.sortBy as 'timestamp' | 'amount' || 'timestamp';
    const sortOrder = req.query.sortOrder as 'asc' | 'desc' || 'desc';

    const options: TransactionHistoryOptions = {
      limit: Math.min(limit, 100), // Cap at 100
      offset,
      startDate,
      endDate,
      sortBy,
      sortOrder
    };

    const transactions = await aiCreditService.getTransactionHistory(userId, options);
    
    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          limit: options.limit,
          offset: options.offset,
          total: transactions.length
        }
      }
    });
  } catch (error) {
    logger.error('Failed to get transaction history', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve transaction history'
    });
  }
}));

// Get AI usage analytics
creditsRouter.get('/analytics', asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.uid;
  
  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User ID not found in request'
    });
  }

  try {
    // Parse time range from query parameters
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const timeRange: TimeRange = {
      startDate,
      endDate,
      granularity: TimeGranularity.DAY
    };

    const analytics = await aiCreditService.getAIUsageAnalytics(userId, timeRange);
    
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('Failed to get AI usage analytics', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve usage analytics'
    });
  }
}));

// Check low balance status
creditsRouter.get('/low-balance-check', asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.uid;
  
  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User ID not found in request'
    });
  }

  try {
    const alert = await aiCreditService.checkLowBalanceThreshold(userId);
    
    res.json({
      success: true,
      data: {
        hasAlert: !!alert,
        alert: alert || null
      }
    });
  } catch (error) {
    logger.error('Failed to check low balance', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check low balance status'
    });
  }
}));

// Grant welcome bonus (for new users)
creditsRouter.post('/welcome-bonus', asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.uid;
  
  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User ID not found in request'
    });
  }

  try {
    const { deviceFingerprint } = req.body;
    
    const transaction = await aiCreditService.grantWelcomeBonus(userId, deviceFingerprint);
    
    res.json({
      success: true,
      data: {
        transactionId: transaction.id,
        amount: transaction.amount,
        newBalance: transaction.balanceAfter,
        message: 'Welcome bonus granted successfully'
      }
    });
  } catch (error) {
    logger.error('Failed to grant welcome bonus', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (error instanceof Error && error.message.includes('not eligible')) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'User not eligible for welcome bonus'
      });
    } else {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to grant welcome bonus'
      });
    }
  }
}));

// Verify transaction integrity
creditsRouter.get('/verify/:transactionId', asyncHandler(async (req: any, res: any) => {
  const { transactionId } = req.params;
  
  if (!transactionId) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Transaction ID is required'
    });
  }

  try {
    // Get ledger service from AI credit service
    const ledgerService = (aiCreditService as any).ledgerService;
    const integrityResult = await ledgerService.validateTransactionIntegrity(transactionId);
    
    res.json({
      success: true,
      data: {
        transactionId,
        isValid: integrityResult.isValid,
        verificationTimestamp: integrityResult.verificationTimestamp,
        issues: integrityResult.issues,
        status: integrityResult.isValid ? 'verified' : 'failed'
      }
    });
  } catch (error) {
    logger.error('Failed to verify transaction integrity', {
      transactionId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify transaction integrity'
    });
  }
}));

// Validate hash chain integrity
creditsRouter.get('/validate-chain', asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.uid;
  
  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User ID not found in request'
    });
  }

  try {
    const ledgerService = (aiCreditService as any).ledgerService;
    const chainValidation = await ledgerService.validateHashChain(userId);
    
    res.json({
      success: true,
      data: {
        userId,
        isValid: chainValidation.isValid,
        totalTransactions: chainValidation.totalTransactions,
        validatedTransactions: chainValidation.validatedTransactions,
        errors: chainValidation.errors,
        brokenAt: chainValidation.brokenAt,
        lastValidHash: chainValidation.lastValidHash
      }
    });
  } catch (error) {
    logger.error('Failed to validate hash chain', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate hash chain'
    });
  }
}));

// Get audit trail
creditsRouter.get('/audit', asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.uid;
  
  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User ID not found in request'
    });
  }

  try {
    // Parse time range from query parameters
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const timeRange: TimeRange = {
      startDate,
      endDate,
      granularity: TimeGranularity.DAY
    };

    const ledgerService = (aiCreditService as any).ledgerService;
    const auditReport = await ledgerService.generateAuditReport(userId, timeRange);
    
    res.json({
      success: true,
      data: auditReport
    });
  } catch (error) {
    logger.error('Failed to generate audit report', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate audit report'
    });
  }
}));

// Sync balance between Firestore and Realtime Database
creditsRouter.post('/sync-balance', asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.uid;
  
  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User ID not found in request'
    });
  }

  try {
    const balanceSyncService = (aiCreditService as any).balanceSyncService;
    const syncResult = await balanceSyncService.syncBalance(userId);
    
    res.json({
      success: syncResult.success,
      data: {
        userId,
        syncedAt: syncResult.syncedAt,
        conflictsResolved: syncResult.conflictsResolved,
        operationsProcessed: syncResult.operationsProcessed,
        errors: syncResult.errors
      }
    });
  } catch (error) {
    logger.error('Failed to sync balance', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to sync balance'
    });
  }
}));

// Validate balance consistency
creditsRouter.get('/validate-balance', asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.uid;
  
  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User ID not found in request'
    });
  }

  try {
    const balanceSyncService = (aiCreditService as any).balanceSyncService;
    const validationResult = await balanceSyncService.validateBalance(userId);
    
    res.json({
      success: true,
      data: validationResult
    });
  } catch (error) {
    logger.error('Failed to validate balance', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate balance'
    });
  }
}));

// Reserve credits for long-running tasks
creditsRouter.post('/reserve', asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.uid;
  
  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User ID not found in request'
    });
  }

  try {
    const { amount, reason, correlationId, expiresInMinutes = 30 } = req.body;
    
    if (!amount || !reason || !correlationId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Amount, reason, and correlationId are required'
      });
    }

    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    
    const balanceSyncService = (aiCreditService as any).balanceSyncService;
    const reservation = await balanceSyncService.reserveCredits({
      userId,
      amount,
      reason,
      correlationId,
      expiresAt
    });
    
    res.json({
      success: true,
      data: {
        reservationId: reservation.id,
        amount: reservation.amount,
        expiresAt: reservation.expiresAt,
        correlationId: reservation.correlationId
      }
    });
  } catch (error) {
    logger.error('Failed to reserve credits', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (error instanceof Error && error.message.includes('Insufficient')) {
      res.status(400).json({
        error: 'Insufficient Credits',
        message: error.message
      });
    } else {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to reserve credits'
      });
    }
  }
}));

// Release credit reservation
creditsRouter.post('/release-reservation', asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.uid;
  
  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User ID not found in request'
    });
  }

  try {
    const { reservationId } = req.body;
    
    if (!reservationId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Reservation ID is required'
      });
    }

    const balanceSyncService = (aiCreditService as any).balanceSyncService;
    await balanceSyncService.releaseReservation(userId, reservationId);
    
    res.json({
      success: true,
      message: 'Reservation released successfully'
    });
  } catch (error) {
    logger.error('Failed to release reservation', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to release reservation'
    });
  }
}));

// Check insufficient credits and get payment options
creditsRouter.post('/check-insufficient', asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.uid;
  
  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User ID not found in request'
    });
  }

  try {
    const { requiredAmount } = req.body;
    
    if (!requiredAmount || requiredAmount <= 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Valid required amount is needed'
      });
    }

    const balanceSyncService = (aiCreditService as any).balanceSyncService;
    const response = await balanceSyncService.handleInsufficientCredits(userId, requiredAmount);
    
    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error('Failed to check insufficient credits', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check insufficient credits'
    });
  }
}));

// Repair hash chain (admin endpoint)
creditsRouter.post('/repair-chain', asyncHandler(async (req: any, res: any) => {
  const userId = req.user?.uid;
  
  if (!userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User ID not found in request'
    });
  }

  // TODO: Add admin role check in production
  
  try {
    const { fromTransaction } = req.body;
    
    const ledgerService = (aiCreditService as any).ledgerService;
    const repairResult = await ledgerService.repairHashChain(userId, fromTransaction);
    
    res.json({
      success: repairResult.success,
      data: {
        userId,
        transactionsRepaired: repairResult.transactionsRepaired,
        repairTimestamp: repairResult.repairTimestamp,
        backupCreated: repairResult.backupCreated,
        newHashChainLength: repairResult.newHashChain.length
      }
    });
  } catch (error) {
    logger.error('Failed to repair hash chain', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to repair hash chain'
    });
  }
}));

export { creditsRouter };