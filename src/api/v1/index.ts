/**
 * API v1 Router
 * Main routing for version 1 of the API
 */

import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth';

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

const v1Router = Router();

// Public routes (no authentication required)
v1Router.use('/auth', authRouter);
v1Router.use('/monitoring', monitoringRouter);

// Protected routes (authentication required)
v1Router.use('/credits', requireAuth, creditsRouter);
v1Router.use('/payments', requireAuth, paymentsRouter);
v1Router.use('/users', requireAuth, usersRouter);
v1Router.use('/chat', requireAuth, chatRouter);
v1Router.use('/models', requireAuth, modelsRouter);
v1Router.use('/images', requireAuth, imagesRouter);

// Admin routes (admin authentication required)
v1Router.use('/admin', requireAuth, adminRouter);

// API information endpoint
v1Router.get('/', optionalAuth, (req, res) => {
  res.json({
    version: 'v1',
    name: 'Integrated Credit System API',
    description: 'AI Assistant with credit-based payment system',
    timestamp: new Date().toISOString(),
    user: req.user ? {
      uid: req.user.uid,
      email: req.user.email,
      authenticated: true
    } : {
      authenticated: false
    },
    endpoints: {
      auth: '/v1/auth',
      credits: '/v1/credits',
      payments: '/v1/payments',
      chat: '/v1/chat',
      models: '/v1/models',
      images: '/v1/images',
      users: '/v1/users',
      admin: '/v1/admin',
      monitoring: '/v1/monitoring'
    }
  });
});

export { v1Router };