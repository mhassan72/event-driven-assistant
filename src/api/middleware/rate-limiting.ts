/**
 * Rate Limiting Middleware
 * Request throttling and abuse prevention
 */

import { Request, Response, NextFunction } from 'express';
import { realtimeDb } from '../../app';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

class RateLimiter {
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  middleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // If Realtime Database is not available, skip rate limiting
      if (!realtimeDb) {
        console.warn('Rate limiting disabled - Realtime Database not configured');
        next();
        return;
      }

      const key = this.config.keyGenerator(req);
      const now = Date.now();
      const windowStart = now - this.config.windowMs;

      // Get current request count from Realtime Database
      const rateLimitRef = realtimeDb.ref(`rate_limits/${key}`);
      const snapshot = await rateLimitRef.once('value');
      const data = snapshot.val() || { requests: [], resetTime: now + this.config.windowMs };

      // Clean old requests outside the window
      const validRequests = (data.requests || []).filter((timestamp: number) => timestamp > windowStart);

      // Check if limit exceeded
      if (validRequests.length >= this.config.maxRequests) {
        const resetTime = Math.ceil((data.resetTime - now) / 1000);
        
        res.status(429).json({
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          retryAfter: resetTime,
          limit: this.config.maxRequests,
          windowMs: this.config.windowMs
        });
        return;
      }

      // Add current request
      validRequests.push(now);

      // Update rate limit data
      await rateLimitRef.set({
        requests: validRequests,
        resetTime: data.resetTime > now ? data.resetTime : now + this.config.windowMs
      });

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, this.config.maxRequests - validRequests.length));
      res.setHeader('X-RateLimit-Reset', Math.ceil(data.resetTime / 1000));

      next();
    } catch (error) {
      // If rate limiting fails, allow the request but log the error
      console.error('Rate limiting error:', error);
      next();
    }
  };
}

// Default rate limiter - 100 requests per 15 minutes per IP
const defaultLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
  keyGenerator: (req: Request) => `ip:${req.ip}`
});

// Authenticated user rate limiter - 1000 requests per 15 minutes per user
const userLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 1000,
  keyGenerator: (req: Request) => req.user?.uid ? `user:${req.user.uid}` : `ip:${req.ip}`
});

// Payment endpoint rate limiter - 10 requests per hour per user
export const paymentLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  keyGenerator: (req: Request) => req.user?.uid ? `payment:${req.user.uid}` : `payment_ip:${req.ip}`
});

export const rateLimiter = (req: Request, res: Response, next: NextFunction): void => {
  // Use user-specific limits for authenticated requests
  const limiter = req.user ? userLimiter : defaultLimiter;
  limiter.middleware(req, res, next);
};