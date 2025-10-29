/**
 * Observability Middleware
 * Request logging, metrics, and tracing
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../shared/observability/logger';
import { metrics } from '../../shared/observability/metrics';

// Extend Request interface to include timing and correlation data
declare global {
  namespace Express {
    interface Request {
      startTime?: number;
      correlationId?: string;
      user?: {
        uid: string;
        email?: string;
        emailVerified?: boolean;
        customClaims?: Record<string, any>;
        authTime: number;
        issuedAt: number;
        expiresAt: number;
      };
    }
  }
}

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Generate correlation ID for request tracing
  req.correlationId = req.headers['x-correlation-id'] as string || 
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Record request start time
  req.startTime = Date.now();

  // Log incoming request
  logger.info('Incoming Request', {
    correlationId: req.correlationId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
    headers: {
      authorization: req.headers.authorization ? '[REDACTED]' : undefined,
      'content-type': req.headers['content-type'],
      'x-api-version': req.headers['x-api-version']
    }
  });

  // Capture response details
  const originalSend = res.send;
  res.send = function(body: any) {
    const duration = Date.now() - (req.startTime || 0);
    
    // Log response
    logger.info('Request Completed', {
      correlationId: req.correlationId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.uid,
      responseSize: Buffer.byteLength(body || '', 'utf8')
    });

    // Record metrics
    metrics.recordHttpRequest({
      method: req.method,
      route: req.route?.path || req.originalUrl,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.uid
    });

    return originalSend.call(this, body);
  };

  // Add correlation ID to response headers
  res.setHeader('X-Correlation-ID', req.correlationId);
  
  next();
};

/**
 * Performance monitoring middleware
 */
export const performanceMonitor = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = process.hrtime.bigint();
  
  // Monitor memory usage
  const memoryBefore = process.memoryUsage();
  
  // Override res.end to capture performance metrics
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): any {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    const memoryAfter = process.memoryUsage();
    
    // Calculate memory delta
    const memoryDelta = {
      rss: memoryAfter.rss - memoryBefore.rss,
      heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
      heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
      external: memoryAfter.external - memoryBefore.external
    };
    
    // Log performance metrics for slow requests
    if (duration > 1000) { // Log requests slower than 1 second
      logger.warn('Slow request detected', {
        correlationId: req.correlationId,
        method: req.method,
        url: req.originalUrl,
        duration,
        memoryDelta,
        statusCode: res.statusCode
      });
    }
    
    // Add performance headers
    res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);
    res.setHeader('X-Memory-Usage', `${Math.round(memoryAfter.heapUsed / 1024 / 1024)}MB`);
    
    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

/**
 * Health check middleware
 */
export const healthCheck = (req: Request, res: Response, next: NextFunction): void => {
  if (req.path === '/health' || req.path === '/healthz') {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: {
        firestore: 'connected', // In production, check actual service health
        realtimeDatabase: 'connected',
        auth: 'connected'
      }
    };
    
    res.status(200).json(healthStatus);
    return;
  }
  
  next();
};

/**
 * Request timeout middleware
 */
export function requestTimeout(timeoutMs: number = 30000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        logger.error('Request timeout', {
          correlationId: req.correlationId,
          method: req.method,
          url: req.originalUrl,
          timeout: timeoutMs
        });
        
        res.status(408).json({
          error: 'REQUEST_TIMEOUT',
          message: 'Request timed out',
          timeout: timeoutMs
        });
      }
    }, timeoutMs);
    
    // Clear timeout when response is sent
    const originalEnd = res.end;
    res.end = function(chunk?: any, encoding?: any): any {
      clearTimeout(timeout);
      originalEnd.call(this, chunk, encoding);
    };
    
    next();
  };
}