/**
 * Express Type Extensions
 * Extended types for Express Request and Response with Firebase Auth integration
 */

import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
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
 * Enhanced Express Response with additional headers
 */
export interface AuthenticatedResponse extends ExpressResponse {
  // Additional methods can be added here if needed
}

// Use any to avoid TypeScript conflicts with the global Express namespace
// while still providing our enhanced types for explicit use
export type Request = any;
export type Response = any;

// Enhanced types are already exported above