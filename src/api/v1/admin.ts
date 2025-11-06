/**
 * Admin API Routes
 * Administrative endpoints for system management
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handling';
import { requireAdmin } from '../middleware/auth';
import { AdminModelService, IAdminModelService } from '../../features/ai-assistant/services/admin-model-service';
import { ModelManagementService } from '../../features/ai-assistant/services/model-management-service';
import { SystemAnalyticsService, ISystemAnalyticsService } from '../../features/ai-assistant/services/system-analytics-service';
import { logger } from '../../shared/observability/logger';
import { metrics } from '../../shared/observability/metrics';
import { firestore, isFirebaseInitialized } from '../../app';

const adminRouter = Router();

// Apply admin authentication to all routes
adminRouter.use(requireAdmin);

// Middleware to check Firebase initialization
adminRouter.use((req, res, next) => {
  if (!isFirebaseInitialized || !firestore) {
    res.status(503).json({
      success: false,
      error: 'Service Unavailable',
      message: 'Firebase services not initialized. Please configure environment variables.',
      timestamp: new Date().toISOString()
    });
    return;
  }
  next();
});

// Initialize services (only executed if Firebase is available)
let modelManagementService: ModelManagementService | null = null;
let adminModelService: IAdminModelService | null = null;
let systemAnalyticsService: ISystemAnalyticsService | null = null;

if (isFirebaseInitialized && firestore) {
  modelManagementService = new ModelManagementService(firestore, logger, metrics);
  adminModelService = new AdminModelService(
    firestore,
    logger,
    metrics,
    modelManagementService
  );
  systemAnalyticsService = new SystemAnalyticsService(
    firestore,
    logger,
    metrics
  );
}

// Credit system pricing configuration
adminRouter.get('/credits/pricing', asyncHandler(async (req: any, res: any) => {
  try {
    if (!adminModelService) {
      throw new Error('Admin service not available');
    }
    
    const pricingConfig = await adminModelService.getPricingConfiguration();
    
    res.json({
      success: true,
      data: pricingConfig,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get pricing configuration', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve pricing configuration',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.put('/credits/pricing', asyncHandler(async (req: any, res: any) => {
  try {
    if (!adminModelService) {
      throw new Error('Admin service not available');
    }
    
    const pricingConfig = req.body;
    
    // Validate pricing configuration
    if (!pricingConfig.globalSettings || !pricingConfig.categoryMultipliers) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pricing configuration',
        message: 'Missing required fields: globalSettings, categoryMultipliers'
      });
    }
    
    await adminModelService.updatePricingConfiguration(pricingConfig);
    
    res.json({
      success: true,
      message: 'Pricing configuration updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to update pricing configuration', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to update pricing configuration',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Health check endpoint for admin services
adminRouter.get('/health', asyncHandler(async (req: any, res: any) => {
  res.json({
    success: true,
    data: {
      firebaseInitialized: isFirebaseInitialized,
      servicesAvailable: {
        adminModelService: !!adminModelService,
        systemAnalyticsService: !!systemAnalyticsService,
        modelManagementService: !!modelManagementService
      }
    },
    timestamp: new Date().toISOString()
  });
}));

// User management endpoints
adminRouter.get('/users', asyncHandler(async (req: any, res: any) => {
  try {
    if (!firestore) {
      throw new Error('Firestore not available');
    }
    
    const { limit = 50, offset = 0, status } = req.query;
    
    let query: any = firestore.collection('users');
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    const snapshot = await query
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string))
      .get();
    
    const users = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get total count
    const totalSnapshot = await firestore.collection('users').get();
    const totalCount = totalSnapshot.size;
    
    res.json({
      success: true,
      data: {
        users,
        totalCount,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: (parseInt(offset as string) + users.length) < totalCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get users', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve users',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.get('/users/:userId/credits', asyncHandler(async (req: any, res: any) => {
  try {
    if (!firestore) {
      throw new Error('Firestore not available');
    }
    
    const { userId } = req.params;
    
    // Get user credit balance
    const balanceDoc = await firestore.collection('credit_balances').doc(userId).get();
    const balance = balanceDoc.exists ? balanceDoc.data() : null;
    
    // Get recent transactions
    const transactionsQuery = firestore
      .collection('credit_transactions')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(50);
    
    const transactionsSnapshot = await transactionsQuery.get();
    const transactions = transactionsSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json({
      success: true,
      data: {
        userId,
        balance,
        recentTransactions: transactions,
        transactionCount: transactions.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get user credit details', { error, userId: req.params.userId, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user credit details',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

export { adminRouter };