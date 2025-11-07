/**
 * Error Handling Middleware
 * Centralized error processing for Express API with enhanced type compatibility
 */

import { Request, Response, NextFunction } from 'express';
import { 
  AuthenticatedRequest, 
  AuthenticatedResponse, 
  AuthenticatedRequestHandler,
  AsyncRequestHandler,
  enhanceResponse
} from '../../shared/types/express';
import { logger } from '../../shared/observability/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
  isOperational?: boolean;
}

export class ValidationError extends Error implements AppError {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  isOperational = true;

  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends Error implements AppError {
  statusCode = 401;
  code = 'UNAUTHORIZED';
  isOperational = true;

  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error implements AppError {
  statusCode = 403;
  code = 'FORBIDDEN';
  isOperational = true;

  constructor(message: string = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error implements AppError {
  statusCode = 404;
  code = 'NOT_FOUND';
  isOperational = true;

  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error implements AppError {
  statusCode = 409;
  code = 'CONFLICT';
  isOperational = true;

  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class InternalServerError extends Error implements AppError {
  statusCode = 500;
  code = 'INTERNAL_SERVER_ERROR';
  isOperational = true;

  constructor(message: string = 'Internal server error', public details?: any) {
    super(message);
    this.name = 'InternalServerError';
  }
}

/**
 * Enhanced error handler with proper typing
 */
export const errorHandler = (
  error: Error | AppError,
  req: AuthenticatedRequest,
  res: AuthenticatedResponse,
  next: NextFunction
): void => {
  // Enhance response if not already enhanced
  const enhancedRes = enhanceResponse(res);
  
  // Ensure we're working with an AppError
  const appError = error as AppError;
  const statusCode = appError.statusCode || 500;
  const code = appError.code || 'UNKNOWN_ERROR';
  
  // Generate request ID if not present
  const requestId = req.correlationId || 
                   req.headers['x-request-id'] as string || 
                   `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Log error details
  logger.error('API Error', {
    error: {
      name: error.name,
      message: error.message,
      code,
      statusCode,
      stack: error.stack,
      details: appError.details
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
        'authorization': req.headers.authorization ? '[PRESENT]' : '[MISSING]'
      },
      body: req.body,
      user: req.user?.uid,
      requestId
    }
  });

  // Don't expose internal error details in production
  const isProduction = process.env.NODE_ENV === 'production';
  const response: any = {
    success: false,
    error: {
      code,
      message: error.message,
      requestId
    },
    timestamp: new Date().toISOString()
  };

  // Add details for non-production environments or operational errors
  if (!isProduction || appError.isOperational) {
    if (appError.details) {
      response.error.details = appError.details;
    }
  }

  // Add stack trace for development
  if (!isProduction) {
    response.error.stack = error.stack;
  }

  // Set CORS headers for error responses
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  res.status(statusCode).json(response);
};

/**
 * Legacy error handler for backward compatibility
 */
export const legacyErrorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  return errorHandler(
    error, 
    req as AuthenticatedRequest, 
    enhanceResponse(res), 
    next
  );
};

/**
 * Async handler wrapper that ensures proper error handling and type compatibility
 */
export const asyncHandler = (handler: AsyncRequestHandler): AuthenticatedRequestHandler => {
  return (req: AuthenticatedRequest, res: AuthenticatedResponse, next: NextFunction): void => {
    // Enhance response object
    const enhancedRes = enhanceResponse(res);
    
    // Execute handler and catch any errors
    Promise.resolve(handler(req, enhancedRes))
      .catch(next);
  };
};

/**
 * Legacy async handler for backward compatibility
 */
export const legacyAsyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const enhancedRes = enhanceResponse(res);
    Promise.resolve(fn(req as AuthenticatedRequest, enhancedRes, next)).catch(next);
  };
};

/**
 * Response enhancement middleware
 * Adds utility methods to all responses
 */
export const enhanceResponseMiddleware = (
  req: Request, 
  res: Response, 
  next: NextFunction
): void => {
  enhanceResponse(res);
  next();
};

/**
 * Request correlation ID middleware
 * Adds correlation ID to requests for tracking
 */
export const correlationIdMiddleware = (
  req: AuthenticatedRequest, 
  res: AuthenticatedResponse, 
  next: NextFunction
): void => {
  // Generate correlation ID if not present
  req.correlationId = req.correlationId || 
                     req.headers['x-correlation-id'] as string ||
                     req.headers['x-request-id'] as string ||
                     `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Add to response headers
  res.header('X-Correlation-ID', req.correlationId);
  
  next();
};

/**
 * Standard API response format
 */
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
    requestId?: string;
  };
  timestamp: string;
  requestId?: string;
}

/**
 * Create success response
 */
export function createSuccessResponse<T>(data: T, requestId?: string): APIResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
    requestId
  };
}

/**
 * Create error response
 */
export function createErrorResponse(
  code: string, 
  message: string, 
  details?: any, 
  requestId?: string
): APIResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
      requestId
    },
    timestamp: new Date().toISOString(),
    requestId
  };
}