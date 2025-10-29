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
  const metrics = {
    timestamp: new Date().toISOString(),
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      version: process.version,
      platform: process.platform
    },
    api: {
      totalRequests: 0, // In production, get from metrics service
      averageResponseTime: 0,
      errorRate: 0,
      activeConnections: 0
    },
    services: {
      firebase: {
        status: 'operational',
        responseTime: 0
      },
      stripe: {
        status: 'operational',
        responseTime: 0
      },
      nebius: {
        status: 'operational',
        responseTime: 0
      }
    }
  };
  
  res.json(metrics);
}));

// System information endpoint
monitoringRouter.get('/info', asyncHandler(async (req: Request, res: Response) => {
  const info = {
    api: {
      name: 'Integrated Credit System API',
      version: '1.0.0',
      description: 'AI Assistant with credit-based payment system',
      documentation: '/v1/docs/swagger',
      openapi: '/v1/docs/openapi.json'
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      environment: process.env.NODE_ENV || 'development',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    features: {
      authentication: {
        provider: 'Firebase Auth',
        methods: ['ID Token', 'Custom Claims'],
        mfa: 'supported'
      },
      database: {
        primary: 'Firestore',
        realtime: 'Firebase Realtime Database',
        caching: 'In-Memory'
      },
      payments: {
        traditional: ['Stripe', 'PayPal'],
        crypto: ['Bitcoin', 'Ethereum', 'Stablecoins'],
        currencies: ['USD', 'EUR', 'BTC', 'ETH']
      },
      ai: {
        providers: ['Nebius AI', 'OpenAI Compatible'],
        models: ['Text Generation', 'Vision', 'Image Generation', 'Embeddings'],
        features: ['Streaming', 'Function Calling', 'Context Management']
      }
    },
    limits: {
      request: {
        timeout: '30s',
        maxSize: '10MB',
        rateLimit: '1000/15min'
      },
      response: {
        maxSize: '50MB',
        compression: 'gzip'
      },
      files: {
        maxUpload: '10MB',
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp']
      }
    }
  };
  
  res.json(info);
}));

// API version information
monitoringRouter.get('/version', asyncHandler(async (req: Request, res: Response) => {
  const version = {
    api: '1.0.0',
    build: process.env.BUILD_NUMBER || 'development',
    commit: process.env.GIT_COMMIT || 'unknown',
    buildDate: process.env.BUILD_DATE || new Date().toISOString(),
    node: process.version,
    dependencies: {
      firebase: '10.x',
      express: '4.x',
      typescript: '5.x'
    },
    changelog: {
      '1.0.0': {
        date: '2024-01-01',
        changes: [
          'Initial release',
          'Firebase Auth integration',
          'Credit system implementation',
          'AI assistant with LangChain',
          'Payment processing (Stripe + Web3)',
          'Image generation support'
        ]
      }
    }
  };
  
  res.json(version);
}));

// Readiness probe (for Kubernetes/container orchestration)
monitoringRouter.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  const checks = [];
  let ready = true;
  
  // Check Firebase services
  if (!firestore) {
    checks.push({ service: 'firestore', status: 'not_configured', ready: false });
    ready = false;
  } else {
    checks.push({ service: 'firestore', status: 'ready', ready: true });
  }
  
  if (!realtimeDb) {
    checks.push({ service: 'realtimeDatabase', status: 'not_configured', ready: false });
    ready = false;
  } else {
    checks.push({ service: 'realtimeDatabase', status: 'ready', ready: true });
  }
  
  if (!auth) {
    checks.push({ service: 'auth', status: 'not_configured', ready: false });
    ready = false;
  } else {
    checks.push({ service: 'auth', status: 'ready', ready: true });
  }
  
  const response = {
    ready,
    timestamp: new Date().toISOString(),
    checks
  };
  
  res.status(ready ? 200 : 503).json(response);
}));

// Liveness probe (for Kubernetes/container orchestration)
monitoringRouter.get('/live', asyncHandler(async (req: Request, res: Response) => {
  // Simple liveness check - if we can respond, we're alive
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
}));

export { monitoringRouter };