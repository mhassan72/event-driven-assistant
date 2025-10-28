/**
 * Firebase Authentication Middleware
 * Token validation and user context extraction
 */

import { Request, Response, NextFunction } from 'express';
import { auth } from '../../app';
import { UnauthorizedError, ForbiddenError } from './error-handling';
import { logger } from '../../shared/observability/logger';

export interface UserContext {
  uid: string;
  email?: string;
  emailVerified: boolean;
  customClaims?: Record<string, any>;
  authTime: number;
  issuedAt: number;
  expiresAt: number;
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Check if Firebase Auth is available
    if (!auth) {
      throw new UnauthorizedError('Authentication service not available - Firebase not configured');
    }

    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    if (!idToken) {
      throw new UnauthorizedError('Missing ID token');
    }

    // Verify the ID token
    const decodedToken = await auth.verifyIdToken(idToken);
    
    // Add user context to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified || false,
      customClaims: decodedToken,
      authTime: decodedToken.auth_time,
      issuedAt: decodedToken.iat,
      expiresAt: decodedToken.exp
    };

    logger.debug('User authenticated', {
      userId: req.user?.uid,
      email: req.user?.email,
      correlationId: req.correlationId
    });

    next();
  } catch (error) {
    logger.warn('Authentication failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: req.correlationId,
      authHeader: req.headers.authorization ? '[PRESENT]' : '[MISSING]'
    });

    if (error instanceof Error && error.message.includes('expired')) {
      next(new UnauthorizedError('ID token has expired'));
    } else if (error instanceof Error && error.message.includes('invalid')) {
      next(new UnauthorizedError('Invalid ID token'));
    } else {
      next(new UnauthorizedError('Authentication failed'));
    }
  }
};

export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    // Try to verify the token, but don't fail if it's invalid
    try {
      const decodedToken = await auth.verifyIdToken(idToken);
      
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified || false,
        customClaims: decodedToken,
        authTime: decodedToken.auth_time,
        issuedAt: decodedToken.iat,
        expiresAt: decodedToken.exp
      };

      logger.debug('Optional auth successful', {
        userId: req.user?.uid,
        correlationId: req.correlationId
      });
    } catch (tokenError) {
      // Invalid token, but continue without user context
      logger.debug('Optional auth failed, continuing without user context', {
        error: tokenError instanceof Error ? tokenError.message : 'Unknown error',
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
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // First ensure user is authenticated
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // Check for admin custom claim
    const isAdmin = req.user.customClaims?.admin === true;
    
    if (!isAdmin) {
      logger.warn('Admin access denied', {
        userId: req.user.uid,
        correlationId: req.correlationId
      });
      throw new ForbiddenError('Admin access required');
    }

    logger.debug('Admin access granted', {
      userId: req.user.uid,
      correlationId: req.correlationId
    });

    next();
  } catch (error) {
    next(error);
  }
};

export const requireCustomClaim = (claimName: string, expectedValue: any) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const claimValue = req.user.customClaims?.[claimName];
      
      if (claimValue !== expectedValue) {
        logger.warn('Custom claim check failed', {
          userId: req.user.uid,
          claimName,
          expectedValue,
          actualValue: claimValue,
          correlationId: req.correlationId
        });
        throw new ForbiddenError(`Required claim '${claimName}' not satisfied`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};