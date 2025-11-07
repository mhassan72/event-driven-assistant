/**
 * Standardized API Response Utilities
 * Consistent response formatting and error handling for all API endpoints
 */

import { AuthenticatedResponse } from '../types/express';

/**
 * Standard API response format
 */
export interface StandardAPIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
    requestId?: string;
  };
  metadata?: {
    timestamp: string;
    requestId?: string;
    version?: string;
    pagination?: PaginationMetadata;
  };
}

/**
 * Pagination metadata
 */
export interface PaginationMetadata {
  page: number;
  limit: number;
  total?: number;
  hasMore: boolean;
  nextPage?: number;
  prevPage?: number;
}

/**
 * Create a standardized success response
 */
export function createSuccessResponse<T>(
  data: T,
  requestId?: string,
  pagination?: PaginationMetadata
): StandardAPIResponse<T> {
  return {
    success: true,
    data,
    metadata: {
      timestamp: new Date().toISOString(),
      requestId,
      version: process.env.npm_package_version || '1.0.0',
      pagination
    }
  };
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  code: string,
  message: string,
  details?: any,
  requestId?: string
): StandardAPIResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
      requestId
    },
    metadata: {
      timestamp: new Date().toISOString(),
      requestId,
      version: process.env.npm_package_version || '1.0.0'
    }
  };
}

/**
 * Standard error codes for consistent error handling
 */
export enum APIErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_TOKEN = 'INVALID_TOKEN',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  
  // Resource Management
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  CONFLICT = 'CONFLICT',
  
  // Business Logic
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  
  // System Errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  
  // Network & Connectivity
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  CONNECTION_ERROR = 'CONNECTION_ERROR'
}

/**
 * Response helper methods for Express responses
 */
export class APIResponseHelper {
  /**
   * Send success response
   */
  static success<T>(
    res: AuthenticatedResponse,
    data: T,
    statusCode: number = 200,
    pagination?: PaginationMetadata
  ): void {
    const requestId = (res.req as any)?.correlationId;
    const response = createSuccessResponse(data, requestId, pagination);
    res.status(statusCode).json(response);
  }

  /**
   * Send error response
   */
  static error(
    res: AuthenticatedResponse,
    code: APIErrorCode | string,
    message: string,
    statusCode: number = 500,
    details?: any
  ): void {
    const requestId = (res.req as any)?.correlationId;
    const response = createErrorResponse(code, message, details, requestId);
    res.status(statusCode).json(response);
  }

  /**
   * Send validation error response
   */
  static validationError(
    res: AuthenticatedResponse,
    message: string,
    details?: any
  ): void {
    APIResponseHelper.error(
      res,
      APIErrorCode.VALIDATION_ERROR,
      message,
      400,
      details
    );
  }

  /**
   * Send unauthorized error response
   */
  static unauthorized(
    res: AuthenticatedResponse,
    message: string = 'Authentication required'
  ): void {
    APIResponseHelper.error(
      res,
      APIErrorCode.UNAUTHORIZED,
      message,
      401
    );
  }

  /**
   * Send forbidden error response
   */
  static forbidden(
    res: AuthenticatedResponse,
    message: string = 'Access denied'
  ): void {
    APIResponseHelper.error(
      res,
      APIErrorCode.FORBIDDEN,
      message,
      403
    );
  }

  /**
   * Send not found error response
   */
  static notFound(
    res: AuthenticatedResponse,
    message: string = 'Resource not found'
  ): void {
    APIResponseHelper.error(
      res,
      APIErrorCode.NOT_FOUND,
      message,
      404
    );
  }

  /**
   * Send conflict error response
   */
  static conflict(
    res: AuthenticatedResponse,
    message: string,
    details?: any
  ): void {
    APIResponseHelper.error(
      res,
      APIErrorCode.CONFLICT,
      message,
      409,
      details
    );
  }

  /**
   * Send rate limit exceeded error response
   */
  static rateLimitExceeded(
    res: AuthenticatedResponse,
    retryAfter?: number
  ): void {
    if (retryAfter) {
      res.header('Retry-After', retryAfter.toString());
    }
    
    APIResponseHelper.error(
      res,
      APIErrorCode.RATE_LIMIT_EXCEEDED,
      'Rate limit exceeded',
      429,
      { retryAfter }
    );
  }

  /**
   * Send insufficient credits error response
   */
  static insufficientCredits(
    res: AuthenticatedResponse,
    required: number,
    available: number
  ): void {
    APIResponseHelper.error(
      res,
      APIErrorCode.INSUFFICIENT_CREDITS,
      'Insufficient credits for this operation',
      402,
      { required, available }
    );
  }

  /**
   * Send internal server error response
   */
  static internalError(
    res: AuthenticatedResponse,
    message: string = 'Internal server error'
  ): void {
    APIResponseHelper.error(
      res,
      APIErrorCode.INTERNAL_SERVER_ERROR,
      message,
      500
    );
  }

  /**
   * Send paginated response
   */
  static paginated<T>(
    res: AuthenticatedResponse,
    data: T[],
    pagination: PaginationMetadata,
    statusCode: number = 200
  ): void {
    APIResponseHelper.success(res, data, statusCode, pagination);
  }

  /**
   * Create pagination metadata
   */
  static createPagination(
    page: number,
    limit: number,
    total?: number
  ): PaginationMetadata {
    const hasMore = total ? (page * limit) < total : data.length === limit;
    
    return {
      page,
      limit,
      total,
      hasMore,
      nextPage: hasMore ? page + 1 : undefined,
      prevPage: page > 1 ? page - 1 : undefined
    };
  }
}

/**
 * Middleware to enhance response with helper methods
 */
export function enhanceResponseWithHelpers(
  req: any,
  res: AuthenticatedResponse,
  next: any
): void {
  // Add helper methods to response object
  res.success = <T>(data: T, statusCode?: number, pagination?: PaginationMetadata) => {
    APIResponseHelper.success(res, data, statusCode, pagination);
  };

  res.error = (code: APIErrorCode | string, message: string, statusCode?: number, details?: any) => {
    APIResponseHelper.error(res, code, message, statusCode, details);
  };

  res.validationError = (message: string, details?: any) => {
    APIResponseHelper.validationError(res, message, details);
  };

  res.unauthorized = (message?: string) => {
    APIResponseHelper.unauthorized(res, message);
  };

  res.forbidden = (message?: string) => {
    APIResponseHelper.forbidden(res, message);
  };

  res.notFound = (message?: string) => {
    APIResponseHelper.notFound(res, message);
  };

  res.conflict = (message: string, details?: any) => {
    APIResponseHelper.conflict(res, message, details);
  };

  res.rateLimitExceeded = (retryAfter?: number) => {
    APIResponseHelper.rateLimitExceeded(res, retryAfter);
  };

  res.insufficientCredits = (required: number, available: number) => {
    APIResponseHelper.insufficientCredits(res, required, available);
  };

  res.internalError = (message?: string) => {
    APIResponseHelper.internalError(res, message);
  };

  res.paginated = <T>(data: T[], pagination: PaginationMetadata, statusCode?: number) => {
    APIResponseHelper.paginated(res, data, pagination, statusCode);
  };

  next();
}

// Extend the AuthenticatedResponse interface with helper methods
declare module '../types/express' {
  interface AuthenticatedResponse {
    success?<T>(data: T, statusCode?: number, pagination?: PaginationMetadata): void;
    error?(code: APIErrorCode | string, message: string, statusCode?: number, details?: any): void;
    validationError?(message: string, details?: any): void;
    unauthorized?(message?: string): void;
    forbidden?(message?: string): void;
    notFound?(message?: string): void;
    conflict?(message: string, details?: any): void;
    rateLimitExceeded?(retryAfter?: number): void;
    insufficientCredits?(required: number, available: number): void;
    internalError?(message?: string): void;
    paginated?<T>(data: T[], pagination: PaginationMetadata, statusCode?: number): void;
  }
}