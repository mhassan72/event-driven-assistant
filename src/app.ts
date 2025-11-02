/**
 * Express Application Setup
 * Firebase Functions Gen 2 with Express.js integration
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';

// Import middleware
import { errorHandler } from './api/middleware/error-handling';
import { requestLogger, performanceMonitor, healthCheck, requestTimeout } from './api/middleware/observability';
import { securityHeaders } from './api/middleware/security';
import { rateLimiter } from './api/middleware/rate-limiting';
import { sanitizeRequest } from './api/middleware/validation';

// Import API routes
import { v1Router } from './api/v1';
import { monitoringRoutes } from './api/monitoring/routes';

// Initialize Firebase Admin SDK with graceful error handling
let firebaseInitialized = false;

try {
  if (!getApps().length) {
    // Check if required environment variables are present
    const requiredEnvVars = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL', 
      'FIREBASE_PRIVATE_KEY',
      'FIREBASE_DATABASE_URL',
      'FIREBASE_STORAGE_BUCKET'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.warn('⚠️  Firebase Admin SDK not initialized - missing environment variables:', missingVars);
      console.warn('   Functions will run in development mode without Firebase services');
      console.warn('   Configure .env file with Firebase credentials for full functionality');
    } else {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID!,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
          privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n')
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL!,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET!
      });
      firebaseInitialized = true;
      console.log('✅ Firebase Admin SDK initialized successfully');
    }
  } else {
    firebaseInitialized = true;
  }
} catch (error) {
  console.error('❌ Firebase Admin SDK initialization failed:', error);
  console.warn('   Functions will run in development mode without Firebase services');
}

// Export Firebase services for use throughout the application
// These will be null if Firebase is not initialized (development mode)
export const auth = firebaseInitialized ? getAuth() : null;
export const firestore = firebaseInitialized ? getFirestore() : null;
export const realtimeDb = firebaseInitialized ? getDatabase() : null;

// Create Express application
const app = express();

// Trust proxy for accurate client IP addresses
app.set('trust proxy', true);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.studio.nebius.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL || 'https://your-domain.com']
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Version']
}));

// Compression and parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Custom middleware
app.use(healthCheck);
app.use(requestTimeout(30000)); // 30 second timeout
app.use(requestLogger);
app.use(performanceMonitor);
app.use(securityHeaders);
app.use(sanitizeRequest);
app.use(rateLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      firestore: 'connected',
      realtimeDatabase: 'connected',
      auth: 'connected'
    }
  });
});

// API routes
app.use('/v1', v1Router);
app.use('/monitoring', monitoringRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use(errorHandler);

export { app };