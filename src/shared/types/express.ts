/**
 * Express Type Extensions
 * Extended types for Express Request and Response with Firebase Auth integration
 */

import { 
  Request as ExpressRequest, 
  Response as ExpressResponse, 
  NextFunction,
  RequestHandler as ExpressRequestHandler
} from 'express';
import { 
  UserContext, 
  UserSession, 
  SecurityAssessment, 
  RateLimitInfo, 
  MFAChallenge, 
  AuditContext 
} from './firebase-auth';

/**
 * Enhanced Express Request with Firebase Auth context
 */
export interface AuthenticatedRequest extends ExpressRequest {
  user?: UserContext;
  session?: UserSession;
  
  // Security context
  securityAssessment?: SecurityAssessment;
  rateLimitInfo?: RateLimitInfo;
  
  // MFA context
  mfaRequired?: boolean;
  mfaChallenge?: MFAChallenge;
  
  // Audit trail
  auditContext?: AuditContext;
  
  // Correlation ID for request tracking
  correlationId?: string;
}

/**
 * Enhanced Express Response with additional headers and utility methods
 */
export interface AuthenticatedResponse extends ExpressResponse {
  // Standard JSON response with success/error format
  jsonResponse<T = any>(data: T): AuthenticatedResponse;
  jsonError(error: string, statusCode?: number, details?: any): AuthenticatedResponse;
  jsonSuccess<T = any>(data: T, message?: string): AuthenticatedResponse;
}

/**
 * Type-safe request handler that works with Express Router
 * This ensures compatibility with Express middleware while providing type safety
 */
export type AuthenticatedRequestHandler = (
  req: AuthenticatedRequest,
  res: AuthenticatedResponse,
  next: NextFunction
) => void | Promise<void>;

/**
 * Async request handler wrapper that properly handles errors
 */
export type AsyncRequestHandler = (
  req: AuthenticatedRequest,
  res: AuthenticatedResponse
) => Promise<void>;

/**
 * Standard Express RequestHandler type for compatibility
 */
export type RequestHandler = ExpressRequestHandler;

/**
 * Utility function to wrap async handlers for Express compatibility
 */
export function asyncHandler(handler: AsyncRequestHandler): AuthenticatedRequestHandler {
  return (req: AuthenticatedRequest, res: AuthenticatedResponse, next: NextFunction): void => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

/**
 * Enhanced response methods
 */
export function enhanceResponse(res: ExpressResponse): AuthenticatedResponse {
  const enhancedRes = res as AuthenticatedResponse;
  
  // Add utility methods if they don't exist
  if (!enhancedRes.jsonResponse) {
    enhancedRes.jsonResponse = function<T>(data: T): AuthenticatedResponse {
      return this.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
      });
    };
  }
  
  if (!enhancedRes.jsonError) {
    enhancedRes.jsonError = function(error: string, statusCode = 500, details?: any): AuthenticatedResponse {
      return this.status(statusCode).json({
        success: false,
        error,
        details,
        timestamp: new Date().toISOString()
      });
    };
  }
  
  if (!enhancedRes.jsonSuccess) {
    enhancedRes.jsonSuccess = function<T>(data: T, message?: string): AuthenticatedResponse {
      return this.json({
        success: true,
        data,
        message,
        timestamp: new Date().toISOString()
      });
    };
  }
  
  return enhancedRes;
}

// Use any to avoid TypeScript conflicts with the global Express namespace
// while still providing our enhanced types for explicit use
export type Request = any;
export type Response = any;

// Extend the global Express namespace to include our custom properties
declare global {
  namespace Express {
    interface Request {
      user?: UserContext;
      session?: UserSession;
      securityAssessment?: SecurityAssessment;
      rateLimitInfo?: RateLimitInfo;
      mfaRequired?: boolean;
      mfaChallenge?: MFAChallenge;
      auditContext?: AuditContext;
      correlationId?: string;
    }
    
    interface Response {
      jsonResponse?<T = any>(data: T): Response;
      jsonError?(error: string, statusCode?: number, details?: any): Response;
      jsonSuccess?<T = any>(data: T, message?: string): Response;
    }
  }
}