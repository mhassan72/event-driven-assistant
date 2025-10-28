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