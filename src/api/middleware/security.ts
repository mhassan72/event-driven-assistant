/**
 * Security Middleware
 * Additional security headers and validation
 */

import { Request, Response, NextFunction } from 'express';

export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Add custom security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // API versioning header
  res.setHeader('X-API-Version', 'v1');
  
  // Cache control for API responses
  if (req.method === 'GET' && req.originalUrl.includes('/health')) {
    res.setHeader('Cache-Control', 'public, max-age=60');
  } else {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  
  next();
};