/**
 * Firebase Auth Middleware Tests
 * Unit tests for token validation, user context extraction, and security middleware
 */

import { Request, Response, NextFunction } from 'express';
import { FirebaseAuthMiddleware } from '../../../src/api/middleware/auth';
import { 
  UserRole, 
  Permission, 
  InvalidTokenError, 
  ExpiredTokenError, 
  InsufficientPermissionsError,
  InsufficientRoleError,
  RateLimitExceededError,
  UserContext,
  SecurityRiskLevel
} from '../../../src/shared/types/firebase-auth';


// Mock Firebase Admin
jest.mock('../../../src/app', () => {
  const mockAuth = {
    verifyIdToken: jest.fn(),
    getUser: jest.fn(),
    setCustomUserClaims: jest.fn(),
    revokeRefreshTokens: jest.fn()
  };

  return {
    auth: mockAuth,
    firestore: null,
    realtimeDb: null
  };
});

// Mock logger
jest.mock('../../../src/shared/observability/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('FirebaseAuthMiddleware', () => {
  let middleware: FirebaseAuthMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockAuth: any;

  beforeEach(() => {
    middleware = new FirebaseAuthMiddleware();
    
    mockRequest = {
      headers: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent'),
      correlationId: 'test-correlation-id'
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis()
    };
    
    mockNext = jest.fn();

    // Get mocked auth
    const { auth } = require('../../../src/app');
    mockAuth = auth;
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('validateIdToken', () => {
    it('should successfully validate a valid token', async () => {
      const mockDecodedToken = {
        uid: 'test-user-123',
        email: 'test@example.com',
        email_verified: true,
        auth_time: Math.floor(Date.now() / 1000),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        firebase: { sign_in_provider: 'password' }
      };

      const mockUserRecord = {
        uid: 'test-user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        disabled: false,
        metadata: {
          creationTime: new Date().toISOString(),
          lastSignInTime: new Date().toISOString()
        },
        providerData: []
      };

      mockAuth.verifyIdToken.mockResolvedValue(mockDecodedToken);
      mockAuth.getUser.mockResolvedValue(mockUserRecord);

      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      await middleware.validateIdToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockAuth.verifyIdToken).toHaveBeenCalledWith('valid-token', true);
      expect(mockAuth.getUser).toHaveBeenCalledWith('test-user-123');
      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.uid).toBe('test-user-123');
      expect(mockRequest.user?.email).toBe('test@example.com');
      expect((mockRequest as any).user?.roles).toContain(UserRole.USER);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject missing authorization header', async () => {
      await middleware.validateIdToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(InvalidTokenError));
      expect((mockNext as any).mock.calls[0][0].message).toContain('Invalid');
    });

    it('should reject malformed authorization header', async () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat token'
      };

      await middleware.validateIdToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(InvalidTokenError));
    });

    it('should handle expired tokens', async () => {
      mockAuth.verifyIdToken.mockRejectedValue(new Error('Token expired'));

      mockRequest.headers = {
        authorization: 'Bearer expired-token'
      };

      await middleware.validateIdToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(ExpiredTokenError));
    });

    it('should handle revoked tokens', async () => {
      mockAuth.verifyIdToken.mockRejectedValue(new Error('Token revoked'));

      mockRequest.headers = {
        authorization: 'Bearer revoked-token'
      };

      await middleware.validateIdToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle disabled user accounts', async () => {
      const mockDecodedToken = {
        uid: 'disabled-user',
        email: 'disabled@example.com',
        email_verified: true,
        auth_time: Math.floor(Date.now() / 1000),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      const mockUserRecord = {
        uid: 'disabled-user',
        disabled: true,
        metadata: {}
      };

      mockAuth.verifyIdToken.mockResolvedValue(mockDecodedToken);
      mockAuth.getUser.mockResolvedValue(mockUserRecord);

      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      const validationResult = await middleware.extractUserContext('valid-token');

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.error?.message).toContain('disabled');
    });
  });

  describe('optionalAuth', () => {
    it('should continue without user context when no auth header provided', async () => {
      await middleware.optionalAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should set user context when valid token provided', async () => {
      const mockDecodedToken = {
        uid: 'test-user-123',
        email: 'test@example.com',
        email_verified: true,
        auth_time: Math.floor(Date.now() / 1000),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      const mockUserRecord = {
        uid: 'test-user-123',
        disabled: false,
        metadata: {}
      };

      mockAuth.verifyIdToken.mockResolvedValue(mockDecodedToken);
      mockAuth.getUser.mockResolvedValue(mockUserRecord);

      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      await middleware.optionalAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.uid).toBe('test-user-123');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should continue without user context when invalid token provided', async () => {
      mockAuth.verifyIdToken.mockRejectedValue(new Error('Invalid token'));

      mockRequest.headers = {
        authorization: 'Bearer invalid-token'
      };

      await middleware.optionalAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('requireRole', () => {
    beforeEach(() => {
      (mockRequest as any).user = {
        uid: 'test-user-123',
        email: 'test@example.com',
        emailVerified: true,
        roles: [UserRole.USER],
        permissions: [],
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600
      };
    });

    it('should allow access when user has required role', async () => {
      const roleMiddleware = middleware.requireRole(UserRole.USER);

      await roleMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access when user lacks required role', async () => {
      const roleMiddleware = middleware.requireRole(UserRole.ADMIN);

      await roleMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(InsufficientRoleError));
    });

    it('should deny access when user is not authenticated', async () => {
      mockRequest.user = undefined;
      const roleMiddleware = middleware.requireRole(UserRole.USER);

      await roleMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect((mockNext as any).mock.calls[0][0].message).toContain('Authentication required');
    });
  });

  describe('requirePermission', () => {
    beforeEach(() => {
      (mockRequest as any).user = {
        uid: 'test-user-123',
        email: 'test@example.com',
        emailVerified: true,
        roles: [UserRole.USER],
        permissions: [Permission.VIEW_CREDITS, Permission.USE_AI_ASSISTANT],
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600
      };
    });

    it('should allow access when user has required permission', async () => {
      const permissionMiddleware = middleware.requirePermission(Permission.VIEW_CREDITS);

      await permissionMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access when user lacks required permission', async () => {
      const permissionMiddleware = middleware.requirePermission(Permission.MANAGE_CREDITS);

      await permissionMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(InsufficientPermissionsError));
    });
  });

  describe('requireAdmin', () => {
    it('should allow access for admin role', async () => {
      (mockRequest as any).user = {
        uid: 'admin-user',
        email: 'admin@example.com',
        emailVerified: true,
        roles: [UserRole.ADMIN],
        permissions: [],
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600
      };

      await middleware.requireAdmin(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should allow access for super admin role', async () => {
      (mockRequest as any).user = {
        uid: 'super-admin-user',
        email: 'superadmin@example.com',
        emailVerified: true,
        roles: [UserRole.SUPER_ADMIN],
        permissions: [],
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600
      };

      await middleware.requireAdmin(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should allow access for legacy admin custom claim', async () => {
      (mockRequest as any).user = {
        uid: 'legacy-admin',
        email: 'legacy@example.com',
        emailVerified: true,
        roles: [UserRole.USER],
        permissions: [],
        customClaims: { admin: true },
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600
      };

      await middleware.requireAdmin(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access for regular user', async () => {
      (mockRequest as any).user = {
        uid: 'regular-user',
        email: 'user@example.com',
        emailVerified: true,
        roles: [UserRole.USER],
        permissions: [],
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600
      };

      await middleware.requireAdmin(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(InsufficientRoleError));
    });
  });

  describe('rateLimitByUser', () => {
    it('should allow requests within rate limit', async () => {
      (mockRequest as any).user = {
        uid: 'test-user-123',
        email: 'test@example.com',
        emailVerified: true,
        roles: [UserRole.USER],
        permissions: [],
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600
      };

      const rateLimitMiddleware = middleware.rateLimitByUser({
        windowMs: 60000, // 1 minute
        maxRequests: 10
      });

      await rateLimitMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockResponse.set).toHaveBeenCalledWith(expect.objectContaining({
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': '9'
      }));
    });

    it('should block requests exceeding rate limit', async () => {
      (mockRequest as any).user = {
        uid: 'test-user-456',
        email: 'test@example.com',
        emailVerified: true,
        roles: [UserRole.USER],
        permissions: [],
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600
      };

      const rateLimitMiddleware = middleware.rateLimitByUser({
        windowMs: 60000, // 1 minute
        maxRequests: 1
      });

      // First request should pass
      await rateLimitMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );
      expect(mockNext).toHaveBeenCalledWith();

      // Reset mock
      (mockNext as any).mockClear();

      // Second request should be rate limited
      await rateLimitMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(RateLimitExceededError));
    });

    it('should use IP address when user is not authenticated', async () => {
      (mockRequest as any).user = undefined;
      (mockRequest as any).ip = '192.168.1.100';

      const rateLimitMiddleware = middleware.rateLimitByUser({
        windowMs: 60000,
        maxRequests: 5
      });

      await rateLimitMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('extractUserContext', () => {
    it('should extract complete user context from valid token', async () => {
      const mockDecodedToken = {
        uid: 'test-user-123',
        email: 'test@example.com',
        email_verified: true,
        auth_time: Math.floor(Date.now() / 1000),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        roles: [UserRole.PREMIUM_USER],
        permissions: [Permission.USE_PREMIUM_MODELS],
        firebase: { sign_in_provider: 'google.com' }
      };

      const mockUserRecord = {
        uid: 'test-user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: 'https://example.com/photo.jpg',
        phoneNumber: '+1234567890',
        disabled: false,
        metadata: {
          creationTime: new Date().toISOString(),
          lastSignInTime: new Date().toISOString(),
          lastRefreshTime: new Date().toISOString()
        },
        providerData: [{
          uid: 'google-uid',
          email: 'test@example.com',
          providerId: 'google.com'
        }]
      };

      mockAuth.verifyIdToken.mockResolvedValue(mockDecodedToken);
      mockAuth.getUser.mockResolvedValue(mockUserRecord);

      const result = await middleware.extractUserContext('valid-token');

      expect(result.isValid).toBe(true);
      expect(result.userContext).toBeDefined();
      expect(result.userContext?.uid).toBe('test-user-123');
      expect(result.userContext?.email).toBe('test@example.com');
      expect(result.userContext?.name).toBe('Test User');
      expect(result.userContext?.roles).toContain(UserRole.PREMIUM_USER);
      expect(result.userContext?.permissions).toContain(Permission.USE_PREMIUM_MODELS);
      expect(result.userContext?.providerId).toBe('google.com');
      expect(result.validationDuration).toBeGreaterThanOrEqual(0);
    });

    it('should handle Firebase Auth not available', async () => {
      // Temporarily mock auth as null
      const originalAuth = mockAuth;
      const { auth } = require('../../../src/app');
      Object.defineProperty(require('../../../src/app'), 'auth', {
        value: null,
        configurable: true
      });

      const result = await middleware.extractUserContext('any-token');

      expect(result.isValid).toBe(false);
      expect(result.error?.message).toContain('Firebase Auth not available');

      // Restore auth
      Object.defineProperty(require('../../../src/app'), 'auth', {
        value: originalAuth,
        configurable: true
      });
    });
  });

  describe('security assessment', () => {
    it('should perform basic security assessment', async () => {
      const userContext: UserContext = {
        uid: 'test-user-123',
        email: 'test@example.com',
        emailVerified: false, // This should increase risk score
        roles: [UserRole.USER],
        permissions: [],
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600
      };

      mockRequest.get = jest.fn().mockReturnValue('Mozilla/5.0 (compatible; bot/1.0)'); // Suspicious user agent

      const assessment = await (middleware as any).performSecurityAssessment(mockRequest, userContext);

      expect(assessment.riskLevel).toBeDefined();
      expect(assessment.riskScore).toBeGreaterThan(0);
      expect(assessment.factors).toBeInstanceOf(Array);
      expect(assessment.deviceTrust).toBeDefined();
      expect(assessment.locationTrust).toBeDefined();
    });

    it('should increase risk score for suspicious user agents', async () => {
      const userContext: UserContext = {
        uid: 'test-user-123',
        email: 'test@example.com',
        emailVerified: true,
        roles: [UserRole.USER],
        permissions: [],
        authTime: Math.floor(Date.now() / 1000),
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600
      };

      mockRequest.get = jest.fn().mockReturnValue('bot-crawler/1.0');

      const assessment = await (middleware as any).performSecurityAssessment(mockRequest, userContext);

      expect(assessment.riskScore).toBeGreaterThan(20); // Should have bot detection penalty
      expect(assessment.factors.some((f: any) => f.description.includes('Suspicious user agent'))).toBe(true);
    });
  });

  describe('role and permission extraction', () => {
    it('should extract roles from custom claims', () => {
      const decodedToken = {
        uid: 'test-user',
        roles: [UserRole.PREMIUM_USER, UserRole.MODERATOR]
      };

      const roles = (middleware as any).extractRoles(decodedToken);

      expect(roles).toContain(UserRole.PREMIUM_USER);
      expect(roles).toContain(UserRole.MODERATOR);
    });

    it('should handle legacy admin claim', () => {
      const decodedToken = {
        uid: 'test-user',
        admin: true
      };

      const roles = (middleware as any).extractRoles(decodedToken);

      expect(roles).toContain(UserRole.ADMIN);
    });

    it('should default to USER role when no roles specified', () => {
      const decodedToken = {
        uid: 'test-user'
      };

      const roles = (middleware as any).extractRoles(decodedToken);

      expect(roles).toContain(UserRole.USER);
      expect(roles).toHaveLength(1);
    });

    it('should calculate permissions from roles', () => {
      const roles = [UserRole.PREMIUM_USER];
      const permissions = (middleware as any).extractPermissions({}, roles);

      expect(permissions).toContain(Permission.USE_AI_ASSISTANT);
      expect(permissions).toContain(Permission.USE_PREMIUM_MODELS);
      expect(permissions).toContain(Permission.GENERATE_IMAGES);
    });

    it('should merge permissions from multiple roles', () => {
      const roles = [UserRole.USER, UserRole.DEVELOPER];
      const permissions = (middleware as any).extractPermissions({}, roles);

      expect(permissions).toContain(Permission.USE_AI_ASSISTANT); // From USER
      expect(permissions).toContain(Permission.API_ACCESS); // From DEVELOPER
      expect(permissions).toContain(Permission.WEBHOOK_ACCESS); // From DEVELOPER
    });
  });
});