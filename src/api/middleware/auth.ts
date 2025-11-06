/**
 * Firebase Authentication Middleware
 * Enhanced token validation, user context extraction, and session management
 */

import { Request, Response, NextFunction } from 'express';
import { auth } from '../../app';
import { UnauthorizedError, ForbiddenError } from './error-handling';
import { logger } from '../../shared/observability/logger';
import { 
  UserContext, 
  IFirebaseAuthMiddleware,
  UserRole,
  Permission,
  TokenValidationResult,
  AuthenticationError,
  InvalidTokenError,
  ExpiredTokenError,
  RevokedTokenError,
  InsufficientPermissionsError,
  InsufficientRoleError,
  AccountDisabledError,
  RateLimitExceededError,
  SecurityAssessment,
  SecurityRiskLevel,
  DeviceTrustLevel,
  LocationTrustLevel,
  RateLimitOptions,
  AuthenticatedRequest
} from '../../shared/types/firebase-auth';

/**
 * Enhanced Firebase Auth Middleware Implementation
 * Provides comprehensive authentication, authorization, and security features
 */
export class FirebaseAuthMiddleware implements IFirebaseAuthMiddleware {
  private rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();
  private securityAssessmentCache: Map<string, SecurityAssessment> = new Map();
  
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    // Clean up rate limit store periodically (only in non-test environments)
    if (process.env.NODE_ENV !== 'test') {
      this.cleanupInterval = setInterval(() => this.cleanupRateLimitStore(), 60000); // Every minute
    }
  }

  /**
   * Cleanup method for tests
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Validate Firebase ID token and extract user context
   */
  async validateIdToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Check if Firebase Auth is available
      if (!auth) {
        throw new InvalidTokenError('Authentication service not available - Firebase not configured');
      }

      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new InvalidTokenError('Missing or invalid authorization header');
      }

      const idToken = authHeader.split('Bearer ')[1];
      
      if (!idToken) {
        throw new InvalidTokenError('Missing ID token');
      }

      // Validate token and extract user context
      const validationResult = await this.extractUserContext(idToken);
      
      if (!validationResult.isValid || !validationResult.userContext) {
        throw validationResult.error || new InvalidTokenError('Token validation failed');
      }

      // Add user context to request
      (req as AuthenticatedRequest).user = validationResult.userContext;
      
      // Perform security assessment
      const securityAssessment = await this.performSecurityAssessment(req, validationResult.userContext);
      (req as AuthenticatedRequest).securityAssessment = securityAssessment;

      // Check if additional security measures are needed
      if (securityAssessment.riskLevel === SecurityRiskLevel.HIGH || 
          securityAssessment.riskLevel === SecurityRiskLevel.CRITICAL) {
        logger.warn('High-risk authentication detected', {
          userId: validationResult.userContext.uid,
          riskLevel: securityAssessment.riskLevel,
          riskScore: securityAssessment.riskScore,
          factors: securityAssessment.factors.map(f => f.type),
          correlationId: req.correlationId
        });
        
        // For critical risk, deny access
        if (securityAssessment.riskLevel === SecurityRiskLevel.CRITICAL) {
          throw new ForbiddenError('Access denied due to security concerns');
        }
      }

      logger.debug('User authenticated successfully', {
        userId: validationResult.userContext.uid,
        email: validationResult.userContext.email,
        roles: validationResult.userContext.roles,
        riskLevel: securityAssessment.riskLevel,
        validationDuration: Date.now() - startTime,
        correlationId: req.correlationId
      });

      next();
    } catch (error) {
      logger.warn('Authentication failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        validationDuration: Date.now() - startTime,
        correlationId: req.correlationId,
        authHeader: req.headers.authorization ? '[PRESENT]' : '[MISSING]',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Map Firebase Auth errors to our custom errors
      if (error instanceof Error) {
        if (error.message.includes('expired')) {
          next(new ExpiredTokenError('ID token has expired'));
        } else if (error.message.includes('revoked')) {
          next(new RevokedTokenError('ID token has been revoked'));
        } else if (error.message.includes('invalid')) {
          next(new InvalidTokenError('Invalid ID token'));
        } else if (error instanceof AuthenticationError) {
          next(error);
        } else {
          next(new InvalidTokenError('Authentication failed'));
        }
      } else {
        next(new InvalidTokenError('Authentication failed'));
      }
    }
  }

  /**
   * Extract and validate user context from ID token
   */
  async extractUserContext(idToken: string): Promise<TokenValidationResult> {
    const startTime = Date.now();
    
    try {
      if (!auth) {
        return {
          isValid: false,
          error: new InvalidTokenError('Firebase Auth not available'),
          validatedAt: new Date(),
          validationDuration: Date.now() - startTime
        };
      }

      // Verify the ID token with Firebase
      const decodedToken = await auth.verifyIdToken(idToken, true); // Check revoked tokens
      
      // Get additional user information
      const userRecord = await auth.getUser(decodedToken.uid);
      
      // Check if account is disabled
      if (userRecord.disabled) {
        return {
          isValid: false,
          error: new AccountDisabledError('User account has been disabled'),
          validatedAt: new Date(),
          validationDuration: Date.now() - startTime
        };
      }

      // Extract roles and permissions from custom claims
      const roles = this.extractRoles(decodedToken);
      const permissions = this.extractPermissions(decodedToken, roles);

      // Create user context
      const userContext: UserContext = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified || false,
        name: userRecord.displayName,
        picture: userRecord.photoURL,
        phoneNumber: userRecord.phoneNumber,
        customClaims: decodedToken,
        roles,
        permissions,
        authTime: decodedToken.auth_time,
        issuedAt: decodedToken.iat,
        expiresAt: decodedToken.exp,
        providerId: decodedToken.firebase?.sign_in_provider,
        providerData: userRecord.providerData,
        disabled: userRecord.disabled,
        metadata: {
          creationTime: userRecord.metadata.creationTime,
          lastSignInTime: userRecord.metadata.lastSignInTime,
          lastRefreshTime: userRecord.metadata.lastRefreshTime || undefined
        }
      };

      return {
        isValid: true,
        userContext,
        tokenType: 'id_token' as any,
        expiresIn: decodedToken.exp - Math.floor(Date.now() / 1000),
        validatedAt: new Date(),
        validationDuration: Date.now() - startTime
      };
    } catch (error) {
      let authError: AuthenticationError;
      
      if (error instanceof Error) {
        if (error.message.includes('expired')) {
          authError = new ExpiredTokenError();
        } else if (error.message.includes('revoked')) {
          authError = new RevokedTokenError();
        } else {
          authError = new InvalidTokenError(error.message);
        }
      } else {
        authError = new InvalidTokenError('Unknown token validation error');
      }

      return {
        isValid: false,
        error: authError,
        validatedAt: new Date(),
        validationDuration: Date.now() - startTime
      };
    }
  }

  /**
   * Optional authentication middleware
   */
  async optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // If Firebase Auth is not available, continue without user context
      if (!auth) {
        next();
        return;
      }

      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // No authentication provided, continue without user context
        next();
        return;
      }

      const idToken = authHeader.split('Bearer ')[1];
      
      if (!idToken) {
        next();
        return;
      }

      // Try to validate token, but don't fail if it's invalid
      const validationResult = await this.extractUserContext(idToken);
      
      if (validationResult.isValid && validationResult.userContext) {
        (req as AuthenticatedRequest).user = validationResult.userContext;
        
        // Perform lightweight security assessment for optional auth
        const securityAssessment = await this.performSecurityAssessment(req, validationResult.userContext);
        (req as AuthenticatedRequest).securityAssessment = securityAssessment;

        logger.debug('Optional auth successful', {
          userId: validationResult.userContext.uid,
          correlationId: req.correlationId
        });
      } else {
        logger.debug('Optional auth failed, continuing without user context', {
          error: validationResult.error?.message,
          correlationId: req.correlationId
        });
      }

      next();
    } catch (error) {
      // Unexpected error, continue without user context
      logger.warn('Optional auth error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: req.correlationId
      });
      next();
    }
  }

  /**
   * Require specific role
   */
  requireRole(role: UserRole) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authReq = req as AuthenticatedRequest;
        
        if (!authReq.user) {
          throw new UnauthorizedError('Authentication required');
        }

        const userRoles = authReq.user.roles || [];
        
        if (!userRoles.includes(role)) {
          logger.warn('Role access denied', {
            userId: authReq.user.uid,
            requiredRole: role,
            userRoles,
            correlationId: req.correlationId
          });
          throw new InsufficientRoleError([role], userRoles);
        }

        logger.debug('Role access granted', {
          userId: authReq.user.uid,
          role,
          correlationId: req.correlationId
        });

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Require any of the specified roles
   */
  requireRoles(roles: UserRole[]) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authReq = req as AuthenticatedRequest;
        
        if (!authReq.user) {
          throw new UnauthorizedError('Authentication required');
        }

        const userRoles = authReq.user.roles || [];
        const hasRequiredRole = roles.some(role => userRoles.includes(role));
        
        if (!hasRequiredRole) {
          logger.warn('Roles access denied', {
            userId: authReq.user.uid,
            requiredRoles: roles,
            userRoles,
            correlationId: req.correlationId
          });
          throw new InsufficientRoleError(roles, userRoles);
        }

        logger.debug('Roles access granted', {
          userId: authReq.user.uid,
          requiredRoles: roles,
          userRoles,
          correlationId: req.correlationId
        });

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Require specific permission
   */
  requirePermission(permission: Permission) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authReq = req as AuthenticatedRequest;
        
        if (!authReq.user) {
          throw new UnauthorizedError('Authentication required');
        }

        const userPermissions = authReq.user.permissions || [];
        
        if (!userPermissions.includes(permission)) {
          logger.warn('Permission access denied', {
            userId: authReq.user.uid,
            requiredPermission: permission,
            userPermissions,
            correlationId: req.correlationId
          });
          throw new InsufficientPermissionsError([permission], userPermissions);
        }

        logger.debug('Permission access granted', {
          userId: authReq.user.uid,
          permission,
          correlationId: req.correlationId
        });

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Require multiple permissions
   */
  requirePermissions(permissions: Permission[]) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authReq = req as AuthenticatedRequest;
        
        if (!authReq.user) {
          throw new UnauthorizedError('Authentication required');
        }

        const userPermissions = authReq.user.permissions || [];
        const hasAllPermissions = permissions.every(permission => userPermissions.includes(permission));
        
        if (!hasAllPermissions) {
          const missingPermissions = permissions.filter(p => !userPermissions.includes(p));
          logger.warn('Permissions access denied', {
            userId: authReq.user.uid,
            requiredPermissions: permissions,
            missingPermissions,
            userPermissions,
            correlationId: req.correlationId
          });
          throw new InsufficientPermissionsError(permissions, userPermissions);
        }

        logger.debug('Permissions access granted', {
          userId: authReq.user.uid,
          permissions,
          correlationId: req.correlationId
        });

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Require admin access
   */
  async requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      
      if (!authReq.user) {
        throw new UnauthorizedError('Authentication required');
      }

      // Check for admin role or admin custom claim
      const isAdmin = authReq.user.roles?.includes(UserRole.ADMIN) || 
                     authReq.user.roles?.includes(UserRole.SUPER_ADMIN) ||
                     authReq.user.customClaims?.admin === true;
      
      if (!isAdmin) {
        logger.warn('Admin access denied', {
          userId: authReq.user.uid,
          roles: authReq.user.roles,
          correlationId: req.correlationId
        });
        throw new InsufficientRoleError([UserRole.ADMIN], authReq.user.roles || []);
      }

      logger.debug('Admin access granted', {
        userId: authReq.user.uid,
        roles: authReq.user.roles,
        correlationId: req.correlationId
      });

      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Require custom claim
   */
  requireCustomClaim(claim: string, value: any) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authReq = req as AuthenticatedRequest;
        
        if (!authReq.user) {
          throw new UnauthorizedError('Authentication required');
        }

        const claimValue = authReq.user.customClaims?.[claim];
        
        if (claimValue !== value) {
          logger.warn('Custom claim check failed', {
            userId: authReq.user.uid,
            claimName: claim,
            expectedValue: value,
            actualValue: claimValue,
            correlationId: req.correlationId
          });
          throw new ForbiddenError(`Required claim '${claim}' not satisfied`);
        }

        logger.debug('Custom claim check passed', {
          userId: authReq.user.uid,
          claimName: claim,
          correlationId: req.correlationId
        });

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Validate session (placeholder for future session management)
   */
  async validateSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    // For now, just ensure user is authenticated
    // Future implementation will include session validation
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.user) {
      throw new UnauthorizedError('Valid session required');
    }
    
    next();
  }

  /**
   * Rate limiting by user
   */
  rateLimitByUser(options: RateLimitOptions) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authReq = req as AuthenticatedRequest;
        
        // Generate rate limit key
        const key = options.keyGenerator ? 
          options.keyGenerator(req) : 
          authReq.user?.uid || req.ip || 'unknown';

        const now = Date.now();
        // const windowStart = now - options.windowMs;
        
        // Get or create rate limit entry
        let rateLimitEntry = this.rateLimitStore.get(key);
        
        if (!rateLimitEntry || rateLimitEntry.resetTime <= now) {
          // Create new window
          rateLimitEntry = {
            count: 0,
            resetTime: now + options.windowMs
          };
        }

        // Check if limit exceeded
        if (rateLimitEntry.count >= options.maxRequests) {
          const retryAfter = Math.ceil((rateLimitEntry.resetTime - now) / 1000);
          
          logger.warn('Rate limit exceeded', {
            userId: authReq.user?.uid,
            key,
            count: rateLimitEntry.count,
            limit: options.maxRequests,
            retryAfter,
            correlationId: req.correlationId
          });

          // Call custom handler if provided
          if (options.onLimitReached) {
            options.onLimitReached(req, res);
          }

          throw new RateLimitExceededError(retryAfter);
        }

        // Increment counter
        rateLimitEntry.count++;
        this.rateLimitStore.set(key, rateLimitEntry);

        // Add rate limit info to request
        (authReq as AuthenticatedRequest).rateLimitInfo = {
          limit: options.maxRequests,
          remaining: options.maxRequests - rateLimitEntry.count,
          resetTime: new Date(rateLimitEntry.resetTime)
        };

        // Add headers
        res.set({
          'X-RateLimit-Limit': options.maxRequests.toString(),
          'X-RateLimit-Remaining': (options.maxRequests - rateLimitEntry.count).toString(),
          'X-RateLimit-Reset': new Date(rateLimitEntry.resetTime).toISOString()
        });

        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Extract roles from token claims
   */
  private extractRoles(decodedToken: any): UserRole[] {
    const roles: UserRole[] = [];
    
    // Check custom claims for roles
    if (decodedToken.roles && Array.isArray(decodedToken.roles)) {
      decodedToken.roles.forEach((role: string) => {
        if (Object.values(UserRole).includes(role as UserRole)) {
          roles.push(role as UserRole);
        }
      });
    }

    // Check legacy admin claim
    if (decodedToken.admin === true) {
      roles.push(UserRole.ADMIN);
    }

    // Default role for all users
    if (roles.length === 0) {
      roles.push(UserRole.USER);
    }

    return roles;
  }

  /**
   * Extract permissions from roles and custom claims
   */
  private extractPermissions(decodedToken: any, roles: UserRole[]): Permission[] {
    const permissions = new Set<Permission>();

    // Add role-based permissions
    roles.forEach(role => {
      const rolePermissions = this.getRolePermissions(role);
      rolePermissions.forEach(permission => permissions.add(permission));
    });

    // Add custom permissions from claims
    if (decodedToken.permissions && Array.isArray(decodedToken.permissions)) {
      decodedToken.permissions.forEach((permission: string) => {
        if (Object.values(Permission).includes(permission as Permission)) {
          permissions.add(permission as Permission);
        }
      });
    }

    return Array.from(permissions);
  }

  /**
   * Get permissions for a specific role
   */
  private getRolePermissions(role: UserRole): Permission[] {
    const rolePermissions: Record<UserRole, Permission[]> = {
      [UserRole.USER]: [
        Permission.VIEW_CREDITS,
        Permission.USE_AI_ASSISTANT,
        Permission.MAKE_PAYMENTS,
        Permission.VIEW_PAYMENT_HISTORY
      ],
      [UserRole.PREMIUM_USER]: [
        Permission.VIEW_CREDITS,
        Permission.USE_AI_ASSISTANT,
        Permission.USE_PREMIUM_MODELS,
        Permission.GENERATE_IMAGES,
        Permission.MAKE_PAYMENTS,
        Permission.VIEW_PAYMENT_HISTORY,
        Permission.MANAGE_PAYMENT_METHODS
      ],
      [UserRole.MODERATOR]: [
        Permission.VIEW_CREDITS,
        Permission.USE_AI_ASSISTANT,
        Permission.USE_PREMIUM_MODELS,
        Permission.GENERATE_IMAGES,
        Permission.MAKE_PAYMENTS,
        Permission.VIEW_PAYMENT_HISTORY,
        Permission.MANAGE_PAYMENT_METHODS,
        Permission.VIEW_ANALYTICS
      ],
      [UserRole.ADMIN]: [
        Permission.VIEW_CREDITS,
        Permission.MANAGE_CREDITS,
        Permission.USE_AI_ASSISTANT,
        Permission.USE_PREMIUM_MODELS,
        Permission.GENERATE_IMAGES,
        Permission.MAKE_PAYMENTS,
        Permission.VIEW_PAYMENT_HISTORY,
        Permission.MANAGE_PAYMENT_METHODS,
        Permission.VIEW_ANALYTICS,
        Permission.MANAGE_USERS,
        Permission.MANAGE_MODELS,
        Permission.API_ACCESS
      ],
      [UserRole.SUPER_ADMIN]: Object.values(Permission),
      [UserRole.DEVELOPER]: [
        Permission.VIEW_CREDITS,
        Permission.USE_AI_ASSISTANT,
        Permission.API_ACCESS,
        Permission.WEBHOOK_ACCESS,
        Permission.BULK_OPERATIONS
      ],
      [UserRole.SUPPORT]: [
        Permission.VIEW_CREDITS,
        Permission.MANAGE_CREDITS,
        Permission.VIEW_ANALYTICS,
        Permission.MANAGE_USERS
      ]
    };

    return rolePermissions[role] || [];
  }

  /**
   * Perform security assessment for authentication
   */
  private async performSecurityAssessment(req: Request, userContext: UserContext): Promise<SecurityAssessment> {
    const cacheKey = `${userContext.uid}-${req.ip}`;
    
    // Check cache first (valid for 5 minutes)
    const cached = this.securityAssessmentCache.get(cacheKey);
    if (cached && Date.now() - cached.riskScore < 300000) {
      return cached;
    }

    // Perform basic security assessment
    const assessment: SecurityAssessment = {
      riskLevel: SecurityRiskLevel.LOW,
      riskScore: 0,
      factors: [],
      recommendations: [],
      deviceTrust: DeviceTrustLevel.UNKNOWN,
      locationTrust: LocationTrustLevel.UNKNOWN
    };

    // Check for suspicious patterns
    const userAgent = req.get('User-Agent') || '';
    // const ipAddress = req.ip;

    // Basic device trust assessment
    if (userAgent.includes('bot') || userAgent.includes('crawler')) {
      assessment.riskScore += 30;
      assessment.factors.push({
        type: 'suspicious_pattern' as any,
        score: 30,
        weight: 1,
        description: 'Suspicious user agent detected'
      });
    }

    // Check for email verification
    if (!userContext.emailVerified) {
      assessment.riskScore += 20;
      assessment.factors.push({
        type: 'privilege_change' as any,
        score: 20,
        weight: 1,
        description: 'Email not verified'
      });
    }

    // Determine risk level based on score
    if (assessment.riskScore >= 80) {
      assessment.riskLevel = SecurityRiskLevel.CRITICAL;
    } else if (assessment.riskScore >= 60) {
      assessment.riskLevel = SecurityRiskLevel.HIGH;
    } else if (assessment.riskScore >= 30) {
      assessment.riskLevel = SecurityRiskLevel.MEDIUM;
    }

    // Cache the assessment
    this.securityAssessmentCache.set(cacheKey, assessment);

    return assessment;
  }

  /**
   * Clean up expired rate limit entries
   */
  private cleanupRateLimitStore(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.rateLimitStore.entries())) {
      if (entry.resetTime <= now) {
        this.rateLimitStore.delete(key);
      }
    }
  }
}

// Create singleton instance
const firebaseAuthMiddleware = new FirebaseAuthMiddleware();

// Export middleware functions for backward compatibility
export const requireAuth = firebaseAuthMiddleware.validateIdToken.bind(firebaseAuthMiddleware);
export const optionalAuth = firebaseAuthMiddleware.optionalAuth.bind(firebaseAuthMiddleware);
export const requireAdmin = firebaseAuthMiddleware.requireAdmin.bind(firebaseAuthMiddleware);
export const requireCustomClaim = firebaseAuthMiddleware.requireCustomClaim.bind(firebaseAuthMiddleware);

// Export new enhanced middleware functions
export const requireRole = firebaseAuthMiddleware.requireRole.bind(firebaseAuthMiddleware);
export const requireRoles = firebaseAuthMiddleware.requireRoles.bind(firebaseAuthMiddleware);
export const requirePermission = firebaseAuthMiddleware.requirePermission.bind(firebaseAuthMiddleware);
export const requirePermissions = firebaseAuthMiddleware.requirePermissions.bind(firebaseAuthMiddleware);
export const validateSession = firebaseAuthMiddleware.validateSession.bind(firebaseAuthMiddleware);
export const rateLimitByUser = firebaseAuthMiddleware.rateLimitByUser.bind(firebaseAuthMiddleware);

// Export the middleware instance
export { firebaseAuthMiddleware };

// Export types for external use
export { UserContext } from '../../shared/types/firebase-auth';