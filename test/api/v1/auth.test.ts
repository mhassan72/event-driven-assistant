/**
 * Authentication API Integration Tests
 * Tests for auth endpoints including registration, login flows, and role management
 */

import request from 'supertest';
import express from 'express';
import { authService } from '../../../src/shared/services/auth-service';
import { 
  UserRole, 
  Permission, 
  AuthenticationMethod 
} from '../../../src/shared/types/firebase-auth';

// Mock Firebase Admin
jest.mock('../../../src/app', () => {
  const mockAuth = {
    createUser: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    getUser: jest.fn(),
    setCustomUserClaims: jest.fn(),
    revokeRefreshTokens: jest.fn(),
    verifyIdToken: jest.fn()
  };

  const mockFirestore = {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn(),
        get: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
      })),
      where: jest.fn(() => ({
        get: jest.fn()
      })),
      add: jest.fn()
    })),
    runTransaction: jest.fn(),
    batch: jest.fn(() => ({
      delete: jest.fn(),
      commit: jest.fn()
    }))
  };

  return {
    auth: mockAuth,
    firestore: mockFirestore,
    realtimeDb: null
  };
});

// Mock the auth service
jest.mock('../../../src/shared/services/auth-service');

// Mock the auth middleware
jest.mock('../../../src/api/middleware/auth', () => {
  const mockFirebaseAuthMiddleware = {
    validateIdToken: jest.fn((req, res, next) => {
      // Mock successful authentication for valid tokens
      if (req.headers.authorization === 'Bearer valid-token') {
        req.user = {
          uid: 'test-user-123',
          email: 'test@example.com',
          emailVerified: true,
          roles: ['user'],
          permissions: ['view_credits']
        };
      }
      next();
    }),
    extractUserContext: jest.fn(),
    optionalAuth: jest.fn((req, res, next) => {
      // Mock optional auth - set user if valid token provided
      if (req.headers.authorization === 'Bearer valid-token') {
        req.user = {
          uid: 'test-user-123',
          email: 'test@example.com',
          emailVerified: true,
          roles: ['user'],
          permissions: ['view_credits']
        };
      }
      next();
    }),
    requireAdmin: jest.fn((req, res, next) => {
      if (req.headers.authorization === 'Bearer admin-token') {
        req.user = {
          uid: 'admin-user-123',
          email: 'admin@example.com',
          emailVerified: true,
          roles: ['admin'],
          permissions: ['manage_users']
        };
        next();
      } else {
        const error = new Error('Authentication failed');
        error.name = 'InvalidTokenError';
        next(error);
      }
    })
  };
  
  return {
    firebaseAuthMiddleware: mockFirebaseAuthMiddleware,
    requireAuth: mockFirebaseAuthMiddleware.validateIdToken,
    optionalAuth: mockFirebaseAuthMiddleware.optionalAuth,
    requireAdmin: mockFirebaseAuthMiddleware.requireAdmin
  };
});

// Create a test app
const createTestApp = () => {
  const testApp = express();
  testApp.use(express.json());
  
  // Import and use the auth router after mocks are set up
  const { authRouter } = require('../../../src/api/v1/auth');
  testApp.use('/v1/auth', authRouter);
  
  // Error handler
  testApp.use((err: any, req: any, res: any, next: any) => {
    res.status(err.statusCode || 500).json({
      error: err.name || 'Error',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  });
  
  return testApp;
};

describe('Auth API Endpoints', () => {
  let mockAuthService: jest.Mocked<typeof authService>;
  let app: express.Application;

  beforeEach(() => {
    mockAuthService = authService as jest.Mocked<typeof authService>;
    jest.clearAllMocks();
    app = createTestApp();
  });

  describe('POST /v1/auth/register', () => {
    const validRegistrationData = {
      email: 'test@example.com',
      password: 'securePassword123',
      displayName: 'Test User',
      acceptedTerms: true,
      acceptedPrivacy: true,
      marketingOptIn: false
    };

    it('should register a new user successfully', async () => {
      const mockRegistrationResult = {
        userId: 'new-user-123',
        user: {
          uid: 'new-user-123',
          email: 'test@example.com',
          displayName: 'Test User',
          emailVerified: false,
          roles: [UserRole.USER],
          createdAt: new Date()
        },
        welcomeCredits: 1000,
        emailVerificationRequired: true,
        mfaSetupRecommended: true,
        onboardingSteps: []
      };

      mockAuthService.registerUser.mockResolvedValue({
        ...mockRegistrationResult,
        session: {} as any
      } as any);

      const response = await request(app)
        .post('/v1/auth/register')
        .send(validRegistrationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.userId).toBe('new-user-123');
      expect(response.body.data.welcomeCredits).toBe(1000);
      expect(response.body.data.nextSteps.emailVerificationRequired).toBe(true);

      expect(mockAuthService.registerUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          password: 'securePassword123',
          displayName: 'Test User',
          method: AuthenticationMethod.PASSWORD,
          acceptedTerms: true,
          acceptedPrivacy: true,
          marketingOptIn: false
        })
      );
    });

    it('should validate required fields', async () => {
      const invalidData = {
        email: 'test@example.com'
        // Missing password, acceptedTerms, acceptedPrivacy
      };

      const response = await request(app)
        .post('/v1/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('ValidationError');
      expect(response.body.message).toContain('Email and password are required');
    });

    it('should require terms and privacy acceptance', async () => {
      const invalidData = {
        ...validRegistrationData,
        acceptedTerms: false,
        acceptedPrivacy: false
      };

      const response = await request(app)
        .post('/v1/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('ValidationError');
      expect(response.body.message).toContain('Terms of service and privacy policy must be accepted');
    });

    it('should handle registration service errors', async () => {
      mockAuthService.registerUser.mockRejectedValue(new Error('Email already exists'));

      const response = await request(app)
        .post('/v1/auth/register')
        .send(validRegistrationData)
        .expect(500);

      expect(response.body.error).toBeDefined();
    });

    it('should include UTM parameters in registration data', async () => {
      const dataWithUTM = {
        ...validRegistrationData,
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'signup'
      };

      mockAuthService.registerUser.mockResolvedValue({
        userId: 'new-user-123',
        user: {} as any,
        session: {} as any,
        welcomeCredits: 1000,
        emailVerificationRequired: true,
        mfaSetupRecommended: true,
        onboardingSteps: []
      });

      await request(app)
        .post('/v1/auth/register')
        .send(dataWithUTM)
        .expect(201);

      expect(mockAuthService.registerUser).toHaveBeenCalledWith(
        expect.objectContaining({
          utmSource: 'google',
          utmMedium: 'cpc',
          utmCampaign: 'signup'
        })
      );
    });
  });

  describe('POST /v1/auth/verify', () => {
    it('should verify a valid token', async () => {
      // Mock the Firebase auth middleware's extractUserContext method
      const mockFirebaseAuthMiddleware = require('../../../src/api/middleware/auth').firebaseAuthMiddleware;
      jest.spyOn(mockFirebaseAuthMiddleware, 'extractUserContext').mockResolvedValue({
        isValid: true,
        userContext: {
          uid: 'test-user-123',
          email: 'test@example.com',
          emailVerified: true,
          roles: [UserRole.USER],
          permissions: [Permission.VIEW_CREDITS],
          authTime: Math.floor(Date.now() / 1000),
          issuedAt: Math.floor(Date.now() / 1000),
          expiresAt: Math.floor(Date.now() / 1000) + 3600
        },
        expiresIn: 3600,
        validatedAt: new Date(),
        validationDuration: 100
      });

      const response = await request(app)
        .post('/v1/auth/verify')
        .send({ idToken: 'valid-token' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.uid).toBe('test-user-123');
      expect(response.body.data.tokenInfo.expiresIn).toBe(3600);
    });

    it('should reject invalid tokens', async () => {
      // Mock the Firebase auth middleware's extractUserContext method to return failure
      const mockFirebaseAuthMiddleware = require('../../../src/api/middleware/auth').firebaseAuthMiddleware;
      jest.spyOn(mockFirebaseAuthMiddleware, 'extractUserContext').mockResolvedValue({
        isValid: false,
        error: new Error('Invalid token'),
        validatedAt: new Date(),
        validationDuration: 50
      });

      const response = await request(app)
        .post('/v1/auth/verify')
        .send({ idToken: 'invalid-token' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    it('should require idToken parameter', async () => {
      const response = await request(app)
        .post('/v1/auth/verify')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('ValidationError');
      expect(response.body.message).toContain('ID token is required');
    });
  });

  describe('POST /v1/auth/refresh', () => {
    it('should refresh a valid token', async () => {
      const mockRefreshResult = {
        success: true,
        newIdToken: 'new-id-token',
        newRefreshToken: 'new-refresh-token',
        expiresIn: 3600,
        securityAssessment: {
          riskLevel: 'low',
          riskScore: 10
        }
      };

      mockAuthService.refreshToken.mockResolvedValue(mockRefreshResult as any);

      const response = await request(app)
        .post('/v1/auth/refresh')
        .send({ 
          refreshToken: 'valid-refresh-token',
          deviceId: 'device-123'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.idToken).toBe('new-id-token');
      expect(response.body.data.refreshToken).toBe('new-refresh-token');
      expect(response.body.data.securityAssessment.riskLevel).toBe('low');
    });

    it('should handle refresh failures', async () => {
      mockAuthService.refreshToken.mockResolvedValue({
        success: false,
        error: { message: 'Invalid refresh token' } as any,
        refreshedAt: new Date()
      } as any);

      const response = await request(app)
        .post('/v1/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Token refresh failed');
    });

    it('should require refreshToken parameter', async () => {
      const response = await request(app)
        .post('/v1/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('ValidationError');
      expect(response.body.message).toContain('Refresh token is required');
    });
  });

  describe('GET /v1/auth/me', () => {
    it('should return user info when authenticated', async () => {
      const mockUserProfile = {
        uid: 'test-user-123',
        email: 'test@example.com',
        emailVerified: true,
        displayName: 'Test User',
        roles: [UserRole.USER],
        permissions: [Permission.VIEW_CREDITS],
        preferences: {
          theme: 'light',
          emailNotifications: true
        },
        mfaEnabled: false,
        createdAt: new Date(),
        lastLoginAt: new Date()
      };

      mockAuthService.getUserProfile.mockResolvedValue(mockUserProfile as any);

      const response = await request(app)
        .get('/v1/auth/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.authenticated).toBe(true);
      expect(response.body.user.uid).toBe('test-user-123');
    });

    it('should return unauthenticated response when no token provided', async () => {
      const response = await request(app)
        .get('/v1/auth/me')
        .expect(200);

      expect(response.body.authenticated).toBe(false);
      expect(response.body.message).toBe('No authentication provided');
    });
  });

  describe('GET /v1/auth/status', () => {
    it('should return authentication status', async () => {
      const response = await request(app)
        .get('/v1/auth/status')
        .expect(200);

      expect(response.body.authenticated).toBe(false);
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.user).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      mockAuthService.registerUser.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          acceptedTerms: true,
          acceptedPrivacy: true
        })
        .expect(500);

      expect(response.body.error).toBeDefined();
    });

    it('should return proper error format', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'invalid-email'
          // Missing required fields
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});