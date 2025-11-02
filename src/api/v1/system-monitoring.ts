/**
 * System Monitoring API v1
 * API endpoints for system health monitoring and alerting
 */

import { Router } from 'express';
import { 
  AuthenticatedRequest, 
  AuthenticatedResponse,
  UserRole
} from '../../shared/types';
import { 
  requireAuth, 
  requireRole,
  rateLimitByUser 
} from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { 
  SystemMonitoringService,
  DashboardService,
  AlertSeverity,
  ISystemMonitoringService,
  IDashboardService
} from '../../features/notification-system';
import { logger } from '../../shared/observability/logger';
import { metrics } from '../../shared/observability/metrics';
import { firestore, realtimeDb } from '../../app';
import { z } from 'zod';

const systemMonitoringRouter = Router();

// Validation schemas
const createAlertThresholdSchema = z.object({
  name: z.string().min(1).max(100),
  metric: z.string().min(1),
  operator: z.enum(['gt', 'lt', 'eq', 'gte', 'lte']),
  value: z.number(),
  severity: z.nativeEnum(AlertSeverity),
  enabled: z.boolean().default(true),
  cooldownMinutes: z.number().min(1).max(1440).default(15),
  recipients: z.array(z.string()),
  channels: z.array(z.string())
});

const timeRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

// Initialize services (this would typically be done via dependency injection)
let monitoringService: ISystemMonitoringService;
let dashboardService: IDashboardService;

function getMonitoringService(): ISystemMonitoringService {
  if (!monitoringService) {
    // Use imported firestore and realtimeDb instances
    if (!firestore || !realtimeDb) {
      throw new Error('Firebase services not initialized');
    }
    
    // Note: In a real implementation, you'd inject the NotificationService
    monitoringService = new SystemMonitoringService(
      firestore,
      realtimeDb,
      logger,
      metrics,
      null as any // Would be properly injected
    );
  }
  
  return monitoringService;
}

function getDashboardService(): IDashboardService {
  if (!dashboardService) {
    const firestore = admin.firestore();
    const logger = Logger.getInstance();
    const metrics = Metrics.getInstance();
    
    dashboardService = new DashboardService(firestore, logger, metrics);
  }
  
  return dashboardService;
}

// Get system health status
systemMonitoringRouter.get('/health',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const service = getMonitoringService();
      const health = await service.getSystemHealth();

      res.json({
        success: true,
        data: { health }
      });

    } catch (error) {
      logger.error('Failed to get system health', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminId: req.user?.uid
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system health'
      });
    }
  }
);

// Get system metrics
systemMonitoringRouter.get('/metrics',
  requireAuth,
  requireRole(UserRole.ADMIN),
  rateLimitByUser({
    windowMs: 60 * 1000,
    maxRequests: 30
  }),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const service = getMonitoringService();
      const metrics = await service.collectSystemMetrics();

      res.json({
        success: true,
        data: { metrics }
      });

    } catch (error) {
      Logger.getInstance().error('Failed to get system metrics', error, {
        adminId: req.user?.uid
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system metrics'
      });
    }
  }
);

// Get dashboard metrics
systemMonitoringRouter.get('/dashboard',
  requireAuth,
  requireRole(UserRole.ADMIN),
  validateRequest(timeRangeSchema.partial()),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const { startDate, endDate } = req.query;
      
      const timeRange = startDate && endDate ? {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      } : undefined;

      const service = getDashboardService();
      const dashboardMetrics = await service.getDashboardMetrics(timeRange);

      res.json({
        success: true,
        data: { dashboard: dashboardMetrics }
      });

    } catch (error) {
      Logger.getInstance().error('Failed to get dashboard metrics', error, {
        adminId: req.user?.uid,
        query: req.query
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve dashboard metrics'
      });
    }
  }
);

// Get active alerts
systemMonitoringRouter.get('/alerts',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const service = getMonitoringService();
      const alerts = await service.getActiveAlerts();

      res.json({
        success: true,
        data: { alerts }
      });

    } catch (error) {
      Logger.getInstance().error('Failed to get active alerts', error, {
        adminId: req.user?.uid
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve active alerts'
      });
    }
  }
);

// Acknowledge alert
systemMonitoringRouter.patch('/alerts/:alertId/acknowledge',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const { alertId } = req.params;
      const userId = req.user!.uid;

      const service = getMonitoringService();
      const success = await service.acknowledgeAlert(alertId, userId);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Alert not found'
        });
      }

      res.json({
        success: true,
        data: { acknowledged: true }
      });

    } catch (error) {
      logger.error('Failed to acknowledge alert', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminId: req.user?.uid,
        alertId: req.params.alertId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to acknowledge alert'
      });
    }
  }
);

// Resolve alert
systemMonitoringRouter.patch('/alerts/:alertId/resolve',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const { alertId } = req.params;
      const userId = req.user!.uid;

      const service = getMonitoringService();
      const success = await service.resolveAlert(alertId, userId);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Alert not found'
        });
      }

      res.json({
        success: true,
        data: { resolved: true }
      });

    } catch (error) {
      logger.error('Failed to resolve alert', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminId: req.user?.uid,
        alertId: req.params.alertId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to resolve alert'
      });
    }
  }
);

// Get alert thresholds
systemMonitoringRouter.get('/thresholds',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const service = getMonitoringService();
      const thresholds = await service.getAlertThresholds();

      res.json({
        success: true,
        data: { thresholds }
      });

    } catch (error) {
      Logger.getInstance().error('Failed to get alert thresholds', error, {
        adminId: req.user?.uid
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve alert thresholds'
      });
    }
  }
);

// Create alert threshold
systemMonitoringRouter.post('/thresholds',
  requireAuth,
  requireRole(UserRole.ADMIN),
  validateRequest(createAlertThresholdSchema),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const thresholdData = req.body;

      const service = getMonitoringService();
      const threshold = await service.createAlertThreshold(thresholdData);

      res.status(201).json({
        success: true,
        data: { threshold }
      });

    } catch (error) {
      Logger.getInstance().error('Failed to create alert threshold', error, {
        adminId: req.user?.uid,
        body: req.body
      });

      res.status(500).json({
        success: false,
        error: 'Failed to create alert threshold'
      });
    }
  }
);

// Update alert threshold
systemMonitoringRouter.put('/thresholds/:thresholdId',
  requireAuth,
  requireRole(UserRole.ADMIN),
  validateRequest(createAlertThresholdSchema.partial()),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const { thresholdId } = req.params;
      const updates = req.body;

      const service = getMonitoringService();
      const threshold = await service.updateAlertThreshold(thresholdId, updates);

      res.json({
        success: true,
        data: { threshold }
      });

    } catch (error) {
      Logger.getInstance().error('Failed to update alert threshold', error, {
        adminId: req.user?.uid,
        thresholdId: req.params.thresholdId,
        updates: req.body
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update alert threshold'
      });
    }
  }
);

// Delete alert threshold
systemMonitoringRouter.delete('/thresholds/:thresholdId',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const { thresholdId } = req.params;

      const service = getMonitoringService();
      const success = await service.deleteAlertThreshold(thresholdId);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Alert threshold not found'
        });
      }

      res.json({
        success: true,
        data: { deleted: true }
      });

    } catch (error) {
      logger.error('Failed to delete alert threshold', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminId: req.user?.uid,
        thresholdId: req.params.thresholdId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to delete alert threshold'
      });
    }
  }
);

// Detect fraud
systemMonitoringRouter.post('/fraud-detection',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const service = getMonitoringService();
      const fraudAlerts = await service.detectFraudulentActivity();

      res.json({
        success: true,
        data: { fraudAlerts }
      });

    } catch (error) {
      Logger.getInstance().error('Failed to run fraud detection', error, {
        adminId: req.user?.uid
      });

      res.status(500).json({
        success: false,
        error: 'Failed to run fraud detection'
      });
    }
  }
);

// Monitor model performance
systemMonitoringRouter.post('/model-performance',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const service = getMonitoringService();
      const performanceAlerts = await service.monitorModelPerformance();

      res.json({
        success: true,
        data: { performanceAlerts }
      });

    } catch (error) {
      Logger.getInstance().error('Failed to monitor model performance', error, {
        adminId: req.user?.uid
      });

      res.status(500).json({
        success: false,
        error: 'Failed to monitor model performance'
      });
    }
  }
);

export { systemMonitoringRouter };