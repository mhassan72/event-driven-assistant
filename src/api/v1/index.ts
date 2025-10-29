/**
 * API v1 Router
 * Main routing for version 1 of the API with enhanced authentication
 */

import { Router } from 'express';
import { 
  requireAuth, 
  optionalAuth, 
  requireRole, 
  requirePermission,
  rateLimitByUser 
} from '../middleware/auth';
import { UserRole, Permission } from '../../shared/types/firebase-auth';

// Import route handlers
import { creditsRouter } from './credits';
import { paymentsRouter } from './payments';
import { usersRouter } from './users';
import { authRouter } from './auth';
import { adminRouter } from './admin';
import { monitoringRouter } from './monitoring';
import { chatRouter } from './chat';
import { modelsRouter } from './models';
import { imagesRouter } from './images';
import { docsRouter } from './docs';

const v1Router = Router();

// Public routes (no authentication required)
v1Router.use('/auth', authRouter);
v1Router.use('/monitoring', monitoringRouter);
v1Router.use('/docs', docsRouter);

// Protected routes (authentication required)
v1Router.use('/credits', requireAuth, creditsRouter);
v1Router.use('/payments', requireAuth, paymentsRouter);
v1Router.use('/users', requireAuth, usersRouter);

// AI Assistant routes (authentication + AI permission required)
v1Router.use('/chat', 
  requireAuth, 
  requirePermission(Permission.USE_AI_ASSISTANT),
  rateLimitByUser({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute per user
    skipSuccessfulRequests: false
  }),
  chatRouter
);

// Model management routes (authentication + model permission required)
v1Router.use('/models', 
  requireAuth, 
  requirePermission(Permission.USE_AI_ASSISTANT),
  modelsRouter
);

// Image generation routes (authentication + image permission required)
v1Router.use('/images', 
  requireAuth, 
  requirePermission(Permission.GENERATE_IMAGES),
  rateLimitByUser({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 image requests per minute per user
    skipSuccessfulRequests: false
  }),
  imagesRouter
);

// Admin routes (admin authentication required)
v1Router.use('/admin', 
  requireAuth, 
  requireRole(UserRole.ADMIN),
  adminRouter
);

// API information endpoint
v1Router.get('/', optionalAuth, (req, res) => {
  const authReq = req as any;
  
  res.json({
    version: 'v1',
    name: 'Integrated Credit System API',
    description: 'AI Assistant with credit-based payment system and Firebase Auth integration',
    timestamp: new Date().toISOString(),
    authentication: {
      authenticated: !!authReq.user,
      user: authReq.user ? {
        uid: authReq.user.uid,
        email: authReq.user.email,
        emailVerified: authReq.user.emailVerified,
        roles: authReq.user.roles,
        permissions: authReq.user.permissions
      } : null,
      securityAssessment: authReq.securityAssessment ? {
        riskLevel: authReq.securityAssessment.riskLevel,
        deviceTrust: authReq.securityAssessment.deviceTrust,
        locationTrust: authReq.securityAssessment.locationTrust
      } : null,
      rateLimitInfo: authReq.rateLimitInfo
    },
    endpoints: {
      // Public endpoints
      auth: {
        path: '/v1/auth',
        description: 'Authentication and user management',
        methods: ['GET', 'POST', 'DELETE'],
        authentication: 'optional'
      },
      monitoring: {
        path: '/v1/monitoring',
        description: 'System health and monitoring',
        methods: ['GET'],
        authentication: 'none'
      },
      
      // Protected endpoints
      credits: {
        path: '/v1/credits',
        description: 'Credit balance and transaction management',
        methods: ['GET', 'POST'],
        authentication: 'required',
        permissions: [Permission.VIEW_CREDITS]
      },
      payments: {
        path: '/v1/payments',
        description: 'Payment processing and credit purchases',
        methods: ['GET', 'POST'],
        authentication: 'required',
        permissions: [Permission.MAKE_PAYMENTS]
      },
      chat: {
        path: '/v1/chat',
        description: 'AI assistant conversations',
        methods: ['GET', 'POST'],
        authentication: 'required',
        permissions: [Permission.USE_AI_ASSISTANT],
        rateLimit: '30 requests/minute'
      },
      models: {
        path: '/v1/models',
        description: 'AI model management and preferences',
        methods: ['GET', 'POST', 'PUT'],
        authentication: 'required',
        permissions: [Permission.USE_AI_ASSISTANT]
      },
      images: {
        path: '/v1/images',
        description: 'AI image generation',
        methods: ['GET', 'POST'],
        authentication: 'required',
        permissions: [Permission.GENERATE_IMAGES],
        rateLimit: '10 requests/minute'
      },
      users: {
        path: '/v1/users',
        description: 'User profile and account management',
        methods: ['GET', 'PUT', 'DELETE'],
        authentication: 'required'
      },
      admin: {
        path: '/v1/admin',
        description: 'Administrative operations',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        authentication: 'required',
        roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN]
      }
    },
    features: {
      authentication: {
        methods: ['Firebase Auth', 'API Keys'],
        mfa: 'supported',
        sessionManagement: 'supported',
        roleBasedAccess: 'enabled',
        permissionBasedAccess: 'enabled'
      },
      security: {
        rateLimiting: 'per-user',
        securityAssessment: 'real-time',
        auditLogging: 'enabled',
        tokenValidation: 'comprehensive'
      },
      aiAssistant: {
        models: 'dynamic',
        conversations: 'contextual',
        imageGeneration: 'supported',
        creditBased: 'enabled'
      }
    }
  });
});

export { v1Router };