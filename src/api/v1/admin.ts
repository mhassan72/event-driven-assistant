/**
 * Admin API Routes
 * Administrative endpoints for system management
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handling';
import { requireAdmin } from '../middleware/auth';
import { AdminModelService, IAdminModelService } from '@/features/ai-assistant/services/admin-model-service';
import { ModelManagementService } from '@/features/ai-assistant/services/model-management-service';
import { SystemAnalyticsService, ISystemAnalyticsService } from '@/features/ai-assistant/services/system-analytics-service';
import { logger } from '@/shared/observability/logger';
import { metrics } from '@/shared/observability/metrics';
import { firestore } from '../../app';

const adminRouter = Router();

// Apply admin authentication to all routes
adminRouter.use(requireAdmin);

// Initialize services
if (!firestore) {
  throw new Error('Firestore not initialized');
}
const modelManagementService = new ModelManagementService(firestore, logger, metrics);
const adminModelService: IAdminModelService = new AdminModelService(
  firestore,
  logger,
  metrics,
  modelManagementService
);
const systemAnalyticsService: ISystemAnalyticsService = new SystemAnalyticsService(
  firestore,
  logger,
  metrics
);

// Credit system pricing configuration
adminRouter.get('/credits/pricing', asyncHandler(async (req: any, res: any) => {
  try {
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

// Analytics and reporting endpoints
adminRouter.get('/analytics/usage', asyncHandler(async (req: any, res: any) => {
  try {
    const { startDate, endDate, granularity } = req.query;
    
    let timeRange;
    if (startDate && endDate) {
      timeRange = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        granularity: (granularity as any) || 'day'
      };
    }
    
    const usageAnalytics = await adminModelService.getModelUsageAnalytics(timeRange);
    
    res.json({
      success: true,
      data: usageAnalytics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get usage analytics', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve usage analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.get('/analytics/revenue', asyncHandler(async (req: any, res: any) => {
  try {
    const { startDate, endDate, granularity } = req.query;
    
    let timeRange;
    if (startDate && endDate) {
      timeRange = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        granularity: (granularity as any) || 'day'
      };
    }
    
    const revenueAnalytics = await adminModelService.getRevenueAnalytics(timeRange);
    
    res.json({
      success: true,
      data: revenueAnalytics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get revenue analytics', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve revenue analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.get('/analytics/user-behavior', asyncHandler(async (req: any, res: any) => {
  try {
    const { startDate, endDate, granularity } = req.query;
    
    let timeRange;
    if (startDate && endDate) {
      timeRange = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        granularity: (granularity as any) || 'day'
      };
    }
    
    const behaviorAnalytics = await adminModelService.getUserBehaviorAnalytics(timeRange);
    
    res.json({
      success: true,
      data: behaviorAnalytics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get user behavior analytics', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user behavior analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.get('/analytics/user-preferences', asyncHandler(async (req: any, res: any) => {
  try {
    const preferenceAnalytics = await adminModelService.getUserPreferenceAnalytics();
    
    res.json({
      success: true,
      data: preferenceAnalytics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get user preference analytics', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user preference analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.get('/recommendations', asyncHandler(async (req: any, res: any) => {
  try {
    const { userId } = req.query;
    
    const recommendations = await adminModelService.getModelRecommendations(userId as string);
    
    res.json({
      success: true,
      data: {
        recommendations,
        totalCount: recommendations.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get model recommendations', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve model recommendations',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.get('/optimization/cost-report', asyncHandler(async (req: any, res: any) => {
  try {
    const costOptimizationReport = await adminModelService.getCostOptimizationReport();
    
    res.json({
      success: true,
      data: costOptimizationReport,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get cost optimization report', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cost optimization report',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.post('/optimization/pricing', asyncHandler(async (req: any, res: any) => {
  try {
    const { strategy } = req.body;
    
    if (!strategy) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'Missing required field: strategy'
      });
    }
    
    const optimizationResult = await adminModelService.optimizeModelPricing(strategy);
    
    res.json({
      success: true,
      data: optimizationResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to optimize pricing', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to optimize pricing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// System performance overview
adminRouter.get('/system/performance', asyncHandler(async (req: any, res: any) => {
  try {
    const performanceOverview = await adminModelService.getSystemPerformanceOverview();
    
    res.json({
      success: true,
      data: performanceOverview,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get system performance overview', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve system performance overview',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// Model management
adminRouter.get('/models', asyncHandler(async (req: any, res: any) => {
  try {
    const models = await adminModelService.getAllModels();
    
    res.json({
      success: true,
      data: {
        models,
        totalCount: models.length,
        activeCount: models.filter(m => m.isActive).length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get all models', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve models',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.get('/models/:modelId', asyncHandler(async (req: any, res: any) => {
  try {
    const { modelId } = req.params;
    const model = await adminModelService.getModel(modelId);
    
    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'Model not found',
        message: `Model with ID ${modelId} does not exist`
      });
    }
    
    res.json({
      success: true,
      data: model,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get model', { error, modelId: req.params.modelId, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve model',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.post('/models', asyncHandler(async (req: any, res: any) => {
  try {
    const modelData = req.body;
    
    // Validate required fields
    if (!modelData.id || !modelData.name || !modelData.category) {
      return res.status(400).json({
        success: false,
        error: 'Invalid model data',
        message: 'Missing required fields: id, name, category'
      });
    }
    
    await adminModelService.addModel(modelData);
    
    res.status(201).json({
      success: true,
      message: 'Model added successfully',
      data: { modelId: modelData.id },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to add model', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to add model',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.put('/models/:modelId', asyncHandler(async (req: any, res: any) => {
  try {
    const { modelId } = req.params;
    const updates = req.body;
    
    await adminModelService.updateModel(modelId, updates);
    
    res.json({
      success: true,
      message: 'Model updated successfully',
      data: { modelId },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to update model', { error, modelId: req.params.modelId, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to update model',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.delete('/models/:modelId', asyncHandler(async (req: any, res: any) => {
  try {
    const { modelId } = req.params;
    
    await adminModelService.deleteModel(modelId);
    
    res.json({
      success: true,
      message: 'Model deleted successfully',
      data: { modelId },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to delete model', { error, modelId: req.params.modelId, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to delete model',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.put('/models/:modelId/pricing', asyncHandler(async (req: any, res: any) => {
  try {
    const { modelId } = req.params;
    const pricing = req.body;
    
    // Validate pricing data
    if (!pricing.currency) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pricing data',
        message: 'Missing required field: currency'
      });
    }
    
    await adminModelService.updateModelPricing(modelId, pricing);
    
    res.json({
      success: true,
      message: 'Model pricing updated successfully',
      data: { modelId },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to update model pricing', { error, modelId: req.params.modelId, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to update model pricing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.get('/models/:modelId/performance', asyncHandler(async (req: any, res: any) => {
  try {
    const { modelId } = req.params;
    const { startDate, endDate, granularity } = req.query;
    
    let timeRange;
    if (startDate && endDate) {
      timeRange = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        granularity: (granularity as any) || 'day'
      };
    }
    
    const performanceMetrics = await adminModelService.getModelPerformanceMetrics(modelId, timeRange);
    
    res.json({
      success: true,
      data: performanceMetrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get model performance metrics', { error, modelId: req.params.modelId, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve model performance metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// System Analytics and Reporting
adminRouter.get('/analytics/financial', asyncHandler(async (req: any, res: any) => {
  try {
    const { startDate, endDate, granularity } = req.query;
    
    let timeRange;
    if (startDate && endDate) {
      timeRange = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        granularity: (granularity as any) || 'day'
      };
    }
    
    const financialReport = await systemAnalyticsService.getFinancialReporting(timeRange);
    
    res.json({
      success: true,
      data: financialReport,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get financial analytics', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve financial analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.get('/analytics/user-engagement', asyncHandler(async (req: any, res: any) => {
  try {
    const { startDate, endDate, granularity } = req.query;
    
    let timeRange;
    if (startDate && endDate) {
      timeRange = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        granularity: (granularity as any) || 'day'
      };
    }
    
    const engagementMetrics = await systemAnalyticsService.getUserEngagementMetrics(timeRange);
    
    res.json({
      success: true,
      data: engagementMetrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get user engagement metrics', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user engagement metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.get('/analytics/user-segments', asyncHandler(async (req: any, res: any) => {
  try {
    const { startDate, endDate, granularity } = req.query;
    
    let timeRange;
    if (startDate && endDate) {
      timeRange = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        granularity: (granularity as any) || 'day'
      };
    }
    
    const segmentAnalysis = await systemAnalyticsService.getUserSegmentAnalysis(timeRange);
    
    res.json({
      success: true,
      data: segmentAnalysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get user segment analysis', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user segment analysis',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.get('/system/performance-report', asyncHandler(async (req: any, res: any) => {
  try {
    const { startDate, endDate, granularity } = req.query;
    
    let timeRange;
    if (startDate && endDate) {
      timeRange = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        granularity: (granularity as any) || 'hour'
      };
    }
    
    const performanceReport = await systemAnalyticsService.getSystemPerformanceReport(timeRange);
    
    res.json({
      success: true,
      data: performanceReport,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get system performance report', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve system performance report',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.get('/system/reliability', asyncHandler(async (req: any, res: any) => {
  try {
    const { startDate, endDate, granularity } = req.query;
    
    let timeRange;
    if (startDate && endDate) {
      timeRange = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        granularity: (granularity as any) || 'day'
      };
    }
    
    const reliabilityMetrics = await systemAnalyticsService.getSystemReliabilityMetrics(timeRange);
    
    res.json({
      success: true,
      data: reliabilityMetrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get system reliability metrics', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve system reliability metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.get('/business-intelligence', asyncHandler(async (req: any, res: any) => {
  try {
    const { startDate, endDate, granularity } = req.query;
    
    let timeRange;
    if (startDate && endDate) {
      timeRange = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        granularity: (granularity as any) || 'week'
      };
    }
    
    const biReport = await systemAnalyticsService.getBusinessIntelligenceReport(timeRange);
    
    res.json({
      success: true,
      data: biReport,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get business intelligence report', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve business intelligence report',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.get('/dashboard/kpis', asyncHandler(async (req: any, res: any) => {
  try {
    const kpiDashboard = await systemAnalyticsService.getKPIDashboard();
    
    res.json({
      success: true,
      data: kpiDashboard,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get KPI dashboard', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve KPI dashboard',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.get('/monitoring/real-time', asyncHandler(async (req: any, res: any) => {
  try {
    const realTimeMetrics = await systemAnalyticsService.getRealTimeMetrics();
    
    res.json({
      success: true,
      data: realTimeMetrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get real-time metrics', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve real-time metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

adminRouter.get('/monitoring/health', asyncHandler(async (req: any, res: any) => {
  try {
    const healthStatus = await systemAnalyticsService.getSystemHealthStatus();
    
    res.json({
      success: true,
      data: healthStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get system health status', { error, adminUserId: req.user?.uid });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve system health status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
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
    
    const users = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get total count
    const totalSnapshot = await firestore!.collection('users').get();
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
    const transactions = transactionsSnapshot.docs.map(doc => ({
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