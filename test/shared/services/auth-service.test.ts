/**
 * Authentication Service Tests
 * Unit tests for user registration, profile management, and role-based access control
 */

import { AuthService } from '../../../src/shared/services/auth-service';
import { 
  UserRole, 
  Permission, 
  AuthenticationMethod,
  DeviceType
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

// Mock logger
jest.mock('../../../src/shared/observability/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('AuthService', () => {
  let authService: AuthService;
  let mockAuth: any;
  let mockFirestore: any;

  beforeEach(() => {
    authService = new AuthService();
    
    // Get mocked services
    const { auth, firestore } = require('../../../src/app');
    mockAuth = auth;
    mockFirestore = firestore;
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    const mockRegistrationData = {
      email: 'test@example.com',
      password: 'securePassword123',
      displayName: 'Test User',
      method: AuthenticationMethod.PASSWORD,
      deviceInfo: {
        deviceId: 'device-123',
        deviceType: DeviceType.DESKTOP,
        browser: 'Chrome',
        os: 'Windows',
        fingerprint: 'fp-123',
        trusted: false
      },
      locationInfo: {
        country: 'US',
        trustLevel: 'unknown' as any
      },
      acceptedTerms: true,
      acceptedPrivacy: true,
      marketingOptIn: false
    };

    it('should successfully register a new user', async () => {
      const mockUserRecord = {
        uid: 'new-user-123',
        email: 'test@example.com',
        displayName: 'Test User'
      };

      mockAuth.createUser.mockResolvedValue(mockUserRecord);
      mockAuth.setCustomUserClaims.mockResolvedValue(undefined);
      
      const mockDocRef = {
        set: jest.fn().mockResolvedValue(undefined)
      };
      mockFirestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef)
      });

      const result = await authService.registerUser(mockRegistrationData);

      expect(mockAuth.createUser).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'securePassword123',
        displayName: 'Test User',
        phoneNumber: undefined,
        emailVerified: false
      });

      expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith(
        'new-user-123',
        expect.objectContaining({
          roles: [UserRole.USER],
          permissions: expect.arrayContaining([Permission.VIEW_CREDITS, Permission.USE_AI_ASSISTANT]),
          registrationMethod: AuthenticationMethod.PASSWORD
        })
      );

      expect(mockDocRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          uid: 'new-user-123',
          email: 'test@example.com',
          displayName: 'Test User',
          emailVerified: false,
          roles: [UserRole.USER],
          disabled: false
        })
      );

      expect(result.userId).toBe('new-user-123');
      expect(result.welcomeCredits).toBe(1000);
      expect(result.emailVerificationRequired).toBe(true);
      expect(result.mfaSetupRecommended).toBe(true);
      expect(result.onboardingSteps).toHaveLength(4);
    });

    it('should handle registration errors gracefully', async () => {
      mockAuth.createUser.mockRejectedValue(new Error('Email already exists'));

      await expect(authService.registerUser(mockRegistrationData))
        .rejects.toThrow('Email already exists');

      expect(mockAuth.setCustomUserClaims).not.toHaveBeenCalled();
    });

    it('should create user profile with correct default preferences', async () => {
      const mockUserRecord = {
        uid: 'new-user-456',
        email: 'test2@example.com'
      };

      mockAuth.createUser.mockResolvedValue(mockUserRecord);
      mockAuth.setCustomUserClaims.mockResolvedValue(undefined);
      
      const mockDocRef = {
        set: jest.fn().mockResolvedValue(undefined)
      };
      mockFirestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef)
      });

      await authService.registerUser(mockRegistrationData);

      const profileData = mockDocRef.set.mock.calls[0][0];
      expect(profileData.preferences).toEqual({
        emailNotifications: true,
        pushNotifications: true,
        smsNotifications: false,
        theme: 'auto',
        language: 'en',
        timezone: 'UTC',
        dataSharing: false,
        analyticsOptOut: false,
        betaFeatures: false,
        advancedMode: false
      });
    });
  });

  describe('updateUserProfile', () => {
    const userId = 'test-user-123';
    const mockProfileData = {
      displayName: 'Updated Name',
      photoURL: 'https://example.com/photo.jpg',
      preferences: {
        theme: 'dark' as const,
        emailNotifications: false
      }
    };

    it('should update user profile successfully', async () => {
      mockAuth.updateUser.mockResolvedValue(undefined);
      
      const mockDocRef = {
        update: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            uid: userId,
            email: 'test@example.com',
            displayName: 'Updated Name',
            photoURL: 'https://example.com/photo.jpg',
            roles: [UserRole.USER],
            permissions: [Permission.VIEW_CREDITS],
            preferences: {
              theme: 'dark' as const,
              emailNotifications: false,
              pushNotifications: true,
              smsNotifications: false,
              language: 'en',
              timezone: 'UTC',
              dataSharing: false,
              analyticsOptOut: false,
              betaFeatures: false,
              advancedMode: false
            },
            metadata: {},
            createdAt: { toDate: () => new Date() }
          })
        })
      };
      
      mockFirestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef)
      });

      const result = await authService.updateUserProfile(userId, mockProfileData);

      expect(mockAuth.updateUser).toHaveBeenCalledWith(userId, {
        displayName: 'Updated Name',
        photoURL: 'https://example.com/photo.jpg'
      });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Updated Name',
          photoURL: 'https://example.com/photo.jpg',
          preferences: mockProfileData.preferences,
          lastProfileUpdate: expect.any(Date)
        })
      );

      expect(result.displayName).toBe('Updated Name');
      expect(result.photoURL).toBe('https://example.com/photo.jpg');
    });

    it('should handle partial updates', async () => {
      const partialUpdate = { displayName: 'New Name Only' };

      mockAuth.updateUser.mockResolvedValue(undefined);
      
      const mockDocRef = {
        update: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({
            uid: userId,
            email: 'test@example.com',
            displayName: 'New Name Only',
            roles: [UserRole.USER],
            permissions: [],
            preferences: {},
            metadata: {},
            createdAt: { toDate: () => new Date() }
          })
        })
      };
      
      mockFirestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef)
      });

      await authService.updateUserProfile(userId, partialUpdate);

      expect(mockAuth.updateUser).toHaveBeenCalledWith(userId, {
        displayName: 'New Name Only'
      });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'New Name Only',
          lastProfileUpdate: expect.any(Date)
        })
      );
    });
  });

  describe('getUserProfile', () => {
    const userId = 'test-user-123';

    it('should retrieve user profile successfully', async () => {
      const mockProfileData = {
        uid: userId,
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        roles: [UserRole.USER],
        permissions: [Permission.VIEW_CREDITS],
        preferences: {
          theme: 'light',
          emailNotifications: true
        },
        metadata: {
          totalLogins: 5,
          registrationMethod: AuthenticationMethod.PASSWORD
        },
        createdAt: { toDate: () => new Date('2023-01-01') },
        mfaEnabled: false,
        trustedDevices: []
      };

      const mockDocRef = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => mockProfileData
        })
      };
      
      mockFirestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef)
      });

      const result = await authService.getUserProfile(userId);

      expect(result.uid).toBe(userId);
      expect(result.email).toBe('test@example.com');
      expect(result.displayName).toBe('Test User');
      expect(result.roles).toContain(UserRole.USER);
      expect(result.permissions).toContain(Permission.VIEW_CREDITS);
      expect(result.mfaEnabled).toBe(false);
    });

    it('should throw error when user profile not found', async () => {
      const mockDocRef = {
        get: jest.fn().mockResolvedValue({
          exists: false
        })
      };
      
      mockFirestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef)
      });

      await expect(authService.getUserProfile(userId))
        .rejects.toThrow('User profile not found');
    });

    it('should handle missing optional fields gracefully', async () => {
      const minimalProfileData = {
        email: 'minimal@example.com'
      };

      const mockDocRef = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => minimalProfileData
        })
      };
      
      mockFirestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDocRef)
      });

      const result = await authService.getUserProfile(userId);

      expect(result.uid).toBe(userId);
      expect(result.email).toBe('minimal@example.com');
      expect(result.roles).toEqual([UserRole.USER]); // Default role
      expect(result.permissions).toEqual([]); // Default empty
      expect(result.disabled).toBe(false); // Default false
    });
  });

  describe('deleteUserAccount', () => {
    const userId = 'test-user-123';

    it('should delete user account and all related data', async () => {
      mockAuth.deleteUser.mockResolvedValue(undefined);
      
      const mockBatch = {
        delete: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined)
      };
      mockFirestore.batch.mockReturnValue(mockBatch);

      const mockSessionsQuery = {
        docs: [
          { ref: 'session-ref-1' },
          { ref: 'session-ref-2' }
        ]
      };

      const mockApiKeysQuery = {
        docs: [
          { ref: 'api-key-ref-1' }
        ]
      };

      mockFirestore.collection.mockImplementation((collectionName: string) => {
        if (collectionName === 'users') {
          return {
            doc: jest.fn().mockReturnValue('user-doc-ref')
          };
        } else if (collectionName === 'user_sessions') {
          return {
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue(mockSessionsQuery)
            })
          };
        } else if (collectionName === 'api_keys') {
          return {
            where: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue(mockApiKeysQuery)
            })
          };
        }
      });

      await authService.deleteUserAccount(userId);

      expect(mockAuth.deleteUser).toHaveBeenCalledWith(userId);
      expect(mockBatch.delete).toHaveBeenCalledTimes(4); // user + 2 sessions + 1 api key
      expect(mockBatch.commit).toHaveBeenCalled();
    });

    it('should handle deletion errors', async () => {
      mockAuth.deleteUser.mockRejectedValue(new Error('User not found'));

      await expect(authService.deleteUserAccount(userId))
        .rejects.toThrow('User not found');
    });
  });

  describe('role management', () => {
    const userId = 'test-user-123';

    beforeEach(() => {
      // Mock getUserProfile for role management tests
      jest.spyOn(authService, 'getUserProfile').mockResolvedValue({
        uid: userId,
        email: 'test@example.com',
        emailVerified: true,
        displayName: 'Test User',
        disabled: false,
        createdAt: new Date(),
        roles: [UserRole.USER],
        permissions: [Permission.VIEW_CREDITS, Permission.USE_AI_ASSISTANT],
        preferences: {} as any,
        metadata: {} as any,
        mfaEnabled: false,
        trustedDevices: []
      });
    });

    describe('assignRole', () => {
      it('should assign new role to user', async () => {
        mockAuth.setCustomUserClaims.mockResolvedValue(undefined);
        
        const mockDocRef = {
          update: jest.fn().mockResolvedValue(undefined)
        };
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue(mockDocRef)
        });

        await authService.assignRole(userId, UserRole.PREMIUM_USER);

        expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith(
          userId,
          expect.objectContaining({
            roles: [UserRole.USER, UserRole.PREMIUM_USER],
            permissions: expect.arrayContaining([
              Permission.USE_PREMIUM_MODELS,
              Permission.GENERATE_IMAGES
            ])
          })
        );

        expect(mockDocRef.update).toHaveBeenCalledWith({
          roles: [UserRole.USER, UserRole.PREMIUM_USER],
          permissions: expect.any(Array)
        });
      });

      it('should not assign role if user already has it', async () => {
        // Mock user already having the role
        jest.spyOn(authService, 'getUserProfile').mockResolvedValue({
          uid: userId,
          email: 'test@example.com',
          emailVerified: true,
          displayName: 'Test User',
          disabled: false,
          createdAt: new Date(),
          roles: [UserRole.USER, UserRole.PREMIUM_USER], // Already has premium
          permissions: [],
          preferences: {} as any,
          metadata: {} as any,
          mfaEnabled: false,
          trustedDevices: []
        });

        await authService.assignRole(userId, UserRole.PREMIUM_USER);

        expect(mockAuth.setCustomUserClaims).not.toHaveBeenCalled();
      });
    });

    describe('removeRole', () => {
      it('should remove role from user', async () => {
        // Mock user having multiple roles
        jest.spyOn(authService, 'getUserProfile').mockResolvedValue({
          uid: userId,
          email: 'test@example.com',
          emailVerified: true,
          displayName: 'Test User',
          disabled: false,
          createdAt: new Date(),
          roles: [UserRole.USER, UserRole.PREMIUM_USER],
          permissions: [],
          preferences: {} as any,
          metadata: {} as any,
          mfaEnabled: false,
          trustedDevices: []
        });

        mockAuth.setCustomUserClaims.mockResolvedValue(undefined);
        
        const mockDocRef = {
          update: jest.fn().mockResolvedValue(undefined)
        };
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue(mockDocRef)
        });

        await authService.removeRole(userId, UserRole.PREMIUM_USER);

        expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith(
          userId,
          expect.objectContaining({
            roles: [UserRole.USER] // Premium role removed
          })
        );
      });

      it('should ensure user always has at least USER role', async () => {
        // Mock user having only one role
        jest.spyOn(authService, 'getUserProfile').mockResolvedValue({
          uid: userId,
          email: 'test@example.com',
          emailVerified: true,
          displayName: 'Test User',
          disabled: false,
          createdAt: new Date(),
          roles: [UserRole.PREMIUM_USER], // Only premium role
          permissions: [],
          preferences: {} as any,
          metadata: {} as any,
          mfaEnabled: false,
          trustedDevices: []
        });

        mockAuth.setCustomUserClaims.mockResolvedValue(undefined);
        
        const mockDocRef = {
          update: jest.fn().mockResolvedValue(undefined)
        };
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue(mockDocRef)
        });

        await authService.removeRole(userId, UserRole.PREMIUM_USER);

        expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith(
          userId,
          expect.objectContaining({
            roles: [UserRole.USER] // Defaults to USER when no roles left
          })
        );
      });
    });
  });

  describe('permission management', () => {
    const userId = 'test-user-123';

    beforeEach(() => {
      jest.spyOn(authService, 'getUserProfile').mockResolvedValue({
        uid: userId,
        email: 'test@example.com',
        emailVerified: true,
        displayName: 'Test User',
        disabled: false,
        createdAt: new Date(),
        roles: [UserRole.USER],
        permissions: [Permission.VIEW_CREDITS],
        preferences: {} as any,
        metadata: {} as any,
        mfaEnabled: false,
        trustedDevices: []
      });
    });

    describe('assignPermission', () => {
      it('should assign new permission to user', async () => {
        const mockDocRef = {
          update: jest.fn().mockResolvedValue(undefined)
        };
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue(mockDocRef)
        });

        await authService.assignPermission(userId, Permission.MANAGE_CREDITS);

        expect(mockDocRef.update).toHaveBeenCalledWith({
          permissions: [Permission.VIEW_CREDITS, Permission.MANAGE_CREDITS]
        });
      });

      it('should not assign permission if user already has it', async () => {
        const mockDocRef = {
          update: jest.fn().mockResolvedValue(undefined)
        };
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue(mockDocRef)
        });

        await authService.assignPermission(userId, Permission.VIEW_CREDITS);

        expect(mockDocRef.update).not.toHaveBeenCalled();
      });
    });

    describe('removePermission', () => {
      it('should remove permission from user', async () => {
        const mockDocRef = {
          update: jest.fn().mockResolvedValue(undefined)
        };
        mockFirestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue(mockDocRef)
        });

        await authService.removePermission(userId, Permission.VIEW_CREDITS);

        expect(mockDocRef.update).toHaveBeenCalledWith({
          permissions: [] // Permission removed
        });
      });
    });
  });

  describe('security event logging', () => {
    const userId = 'test-user-123';

    it('should log security events to Firestore', async () => {
      const mockAdd = jest.fn().mockResolvedValue(undefined);
      mockFirestore.collection.mockReturnValue({
        add: mockAdd
      });

      const securityEvent = {
        type: 'login_success' as any,
        severity: 'low' as any,
        description: 'User logged in successfully',
        context: {
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          requestPath: '/auth/login',
          requestMethod: 'POST'
        },
        timestamp: new Date()
      };

      await authService.logSecurityEvent(userId, securityEvent);

      expect(mockAdd).toHaveBeenCalledWith({
        userId,
        ...securityEvent,
        timestamp: securityEvent.timestamp
      });
    });

    it('should handle logging errors gracefully', async () => {
      mockFirestore.collection.mockReturnValue({
        add: jest.fn().mockRejectedValue(new Error('Firestore error'))
      });

      const securityEvent = {
        type: 'login_failure' as any,
        severity: 'medium' as any,
        description: 'Failed login attempt',
        context: {
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          requestPath: '/auth/login',
          requestMethod: 'POST'
        },
        timestamp: new Date()
      };

      // Should not throw error
      await expect(authService.logSecurityEvent(userId, securityEvent))
        .resolves.toBeUndefined();
    });
  });

  describe('token management', () => {
    const userId = 'test-user-123';

    describe('revokeToken', () => {
      it('should revoke user refresh tokens', async () => {
        mockAuth.revokeRefreshTokens.mockResolvedValue(undefined);

        await authService.revokeToken(userId);

        expect(mockAuth.revokeRefreshTokens).toHaveBeenCalledWith(userId);
      });

      it('should handle revocation errors', async () => {
        mockAuth.revokeRefreshTokens.mockRejectedValue(new Error('User not found'));

        await expect(authService.revokeToken(userId))
          .rejects.toThrow('User not found');
      });
    });

    describe('revokeAllTokens', () => {
      it('should revoke all tokens for user', async () => {
        mockAuth.revokeRefreshTokens.mockResolvedValue(undefined);

        await authService.revokeAllTokens(userId);

        expect(mockAuth.revokeRefreshTokens).toHaveBeenCalledWith(userId);
      });
    });
  });

  describe('utility methods', () => {
    it('should get correct permissions for USER role', () => {
      const permissions = (authService as any).getRolePermissions(UserRole.USER);

      expect(permissions).toContain(Permission.VIEW_CREDITS);
      expect(permissions).toContain(Permission.USE_AI_ASSISTANT);
      expect(permissions).toContain(Permission.MAKE_PAYMENTS);
      expect(permissions).not.toContain(Permission.MANAGE_CREDITS);
    });

    it('should get correct permissions for ADMIN role', () => {
      const permissions = (authService as any).getRolePermissions(UserRole.ADMIN);

      expect(permissions).toContain(Permission.VIEW_CREDITS);
      expect(permissions).toContain(Permission.MANAGE_CREDITS);
      expect(permissions).toContain(Permission.MANAGE_USERS);
      expect(permissions).toContain(Permission.VIEW_ANALYTICS);
    });

    it('should get all permissions for SUPER_ADMIN role', () => {
      const permissions = (authService as any).getRolePermissions(UserRole.SUPER_ADMIN);

      expect(permissions).toEqual(Object.values(Permission));
    });

    it('should calculate combined permissions from multiple roles', () => {
      const roles = [UserRole.USER, UserRole.DEVELOPER];
      const permissions = (authService as any).calculatePermissions(roles);

      expect(permissions).toContain(Permission.USE_AI_ASSISTANT); // From USER
      expect(permissions).toContain(Permission.API_ACCESS); // From DEVELOPER
      expect(permissions).toContain(Permission.WEBHOOK_ACCESS); // From DEVELOPER
    });

    it('should return default preferences', () => {
      const preferences = (authService as any).getDefaultPreferences();

      expect(preferences.emailNotifications).toBe(true);
      expect(preferences.pushNotifications).toBe(true);
      expect(preferences.smsNotifications).toBe(false);
      expect(preferences.theme).toBe('auto');
      expect(preferences.language).toBe('en');
      expect(preferences.timezone).toBe('UTC');
      expect(preferences.dataSharing).toBe(false);
      expect(preferences.analyticsOptOut).toBe(false);
      expect(preferences.betaFeatures).toBe(false);
      expect(preferences.advancedMode).toBe(false);
    });

    it('should return correct onboarding steps', () => {
      const steps = (authService as any).getOnboardingSteps();

      expect(steps).toHaveLength(4);
      expect(steps[0].id).toBe('verify_email');
      expect(steps[0].required).toBe(true);
      expect(steps[1].id).toBe('setup_profile');
      expect(steps[1].required).toBe(false);
      expect(steps[2].id).toBe('setup_mfa');
      expect(steps[3].id).toBe('first_ai_chat');
    });
  });
});