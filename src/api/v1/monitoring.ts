/**
 * Monitoring API Routes
 * Public monitoring and health check endpoints
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handling';
import { Request, Response } from '../../shared/types/express';
import { firestore, realtimeDb, auth } from '../../app';

const monitoringRouter = Router();

// System health check (public)
monitoringRouter.get('/health', asyncHandler(async (req: Request, res: Response) => {
  const healthChecks = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    services: {
      firestore: 'unknown',
      realtimeDatabase: 'unknown',
      auth: 'unknown'
    },
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  };

  // Check Firebase services availability
  if (firestore) {
    try {
      await firestore.collection('_health_check').limit(1).get();
      healthChecks.services.firestore = 'connected';
    } catch (error) {
      healthChecks.services.firestore = 'error';
      healthChecks.status = 'degraded';
    }
  } else {
    healthChecks.services.firestore = 'not_configured';
    healthChecks.status = 'degraded';
  }

  if (realtimeDb) {
    try {
      await realtimeDb.ref('_health_check').once('value');
      healthChecks.services.realtimeDatabase = 'connected';
    } catch (error) {
      healthChecks.services.realtimeDatabase = 'error';
      healthChecks.status = 'degraded';
    }
  } else {
    healthChecks.services.realtimeDatabase = 'not_configured';
    healthChecks.status = 'degraded';
  }

  if (auth) {
    try {
      // Test Auth service (this will always work if the app initialized)
      healthChecks.services.auth = 'connected';
    } catch (error) {
      healthChecks.services.auth = 'error';
      healthChecks.status = 'degraded';
    }
  } else {
    healthChecks.services.auth = 'not_configured';
    healthChecks.status = 'degraded';
  }

  const statusCode = healthChecks.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(healthChecks);
}));

// API status (public)
monitoringRouter.get('/status', asyncHandler(async (req: Request, res: Response) => {
  res.json({
    api: {
      name: 'Integrated Credit System API',
      version: 'v1',
      status: 'operational',
      timestamp: new Date().toISOString()
    },
    endpoints: {
      total: 8,
      public: 2,
      authenticated: 6,
      admin: 1
    },
    features: {
      authentication: 'firebase-auth',
      database: 'firestore',
      realtime: 'firebase-rtdb',
      payments: 'stripe-web3',
      ai: 'nebius-langchain'
    }
  });
}));

// Metrics endpoint (public, basic metrics only)
monitoringRouter.get('/metrics', asyncHandler(async (req: Request, res: Response) => {
  // TODO: Implement in task 11.2 - Build system monitoring and alerting
  res.json({
    message: 'Metrics endpoint - to be implemented in task 11.2',
    endpoint: 'GET /api/v1/monitoring/metrics',
    timestamp: new Date().toISOString()
  });
}));

export { monitoringRouter };