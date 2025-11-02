/**
 * Monitoring API Routes
 * Provides endpoints for system monitoring and observability
 */

import { Router } from 'express';
import { DashboardController } from './dashboard';

const router = Router();
const dashboardController = new DashboardController();

// Health check endpoint (public)
router.get('/health', async (req, res) => {
  try {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'integrated-credit-system',
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

// System health (admin only)
router.get('/system/health', 
  dashboardController.getSystemHealth.bind(dashboardController)
);

// Performance metrics (admin only)
router.get('/system/performance', 
  dashboardController.getPerformanceMetrics.bind(dashboardController)
);

// Active alerts (admin only)
router.get('/system/alerts', 
  dashboardController.getActiveAlerts.bind(dashboardController)
);

// Business metrics (admin only)
router.get('/business/metrics', 
  dashboardController.getBusinessMetrics.bind(dashboardController)
);

// System overview (admin only)
router.get('/system/overview', 
  dashboardController.getSystemOverview.bind(dashboardController)
);

export { router as monitoringRoutes };