/**
 * Error Handling Middleware
 * Centralized error processing for Express API
 */

import { Request, Response, NextFunction } from 'express';
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

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const statusCode = error.statusCode || 500;
  const code = error.code || 'UNKNOWN_ERROR';
  
  // Log error details
  logger.error('API Error', {
    error: {
      name: error.name,
      message: error.message,
      code,
      statusCode,
      stack: error.stack,
      details: error.details
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      body: req.body,
      user: req.user?.uid
    }
  });

  // Don't expose internal error details in production
  const isProduction = process.env.NODE_ENV === 'production';
  const response: any = {
    error: code,
    message: error.message,
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown'
  };

  // Add details for non-production environments or operational errors
  if (!isProduction || error.isOperational) {
    if (error.details) {
      response.details = error.details;
    }
  }

  // Add stack trace for development
  if (!isProduction) {
    response.stack = error.stack;
  }

  res.status(statusCode).json(response);
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};