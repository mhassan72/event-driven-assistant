/**
 * Authentication Service
 * Handles user registration, login flows, and role-based access control
 */

import { auth, firestore } from '../../app';
import { 
  UserContext, 
  UserRole, 
  Permission,
  AuthenticationMethod,
  UserSession,
  DeviceInfo,
  LocationInfo,
  SecurityAssessment,
  TokenRefreshRequest,
  TokenRefreshResult,
  SessionValidationResult,
  AuthenticationError,
  InvalidTokenError
} from '../types/firebase-auth';
import { logger } from '../observability/logger';

export interface IAuthService {
  // User registration and profile management
  registerUser(registrationData: UserRegistrationData): Promise<UserRegistrationResult>;
  updateUserProfile(userId: string, profileData: UserProfileData): Promise<UserProfile>;
  getUserProfile(userId: string): Promise<UserProfile>;
  deleteUserAccount(userId: string): Promise<void>;
  
  // Role and permission management
  assignRole(userId: string, role: UserRole): Promise<void>;
  removeRole(userId: string, role: UserRole): Promise<void>;
  assignPermission(userId: string, permission: Permission): Promise<void>;
  removePermission(userId: string, permission: Permission): Promise<void>;
  getUserRoles(userId: string): Promise<UserRole[]>;
  getUserPermissions(userId: string): Promise<Permission[]>;
  
  // Token management
  refreshToken(request: TokenRefreshRequest): Promise<TokenRefreshResult>;
  revokeToken(userId: string, tokenId?: string): Promise<void>;
  revokeAllTokens(userId: string): Promise<void>;
  
  // Session management
  createSession(userContext: UserContext, deviceInfo: DeviceInfo, locationInfo: LocationInfo): Promise<UserSession>;
  validateSession(sessionId: string): Promise<SessionValidationResult>;
  terminateSession(sessionId: string): Promise<void>;
  getUserSessions(userId: string): Promise<UserSession[]>;
  
  // Security and monitoring
  performSecurityCheck(userId: string, context: SecurityContext): Promise<SecurityAssessment>;
  logSecurityEvent(userId: string, event: SecurityEvent): Promise<void>;
  
  // API key management
  generateApiKey(userId: string, keyData: ApiKeyData): Promise<ApiKey>;
  revokeApiKey(userId: string, keyId: string): Promise<void>;
  validateApiKey(keyId: string): Promise<ApiKeyValidationResult>;
  getUserApiKeys(userId: string): Promise<ApiKey[]>;
}

export interface UserRegistrationData {
  email: string;
  password?: string;
  displayName?: string;
  phoneNumber?: string;
  
  // Registration method
  method: AuthenticationMethod;
  
  // Device and location info
  deviceInfo?: DeviceInfo;
  locationInfo?: LocationInfo;
  
  // Marketing and tracking
  referralCode?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  
  // Terms and privacy
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  marketingOptIn?: boolean;
}

export interface UserRegistrationResult {
  userId: string;
  user: UserProfile;
  session: UserSession;
  welcomeCredits: number;
  
  // Next steps
  emailVerificationRequired: boolean;
  mfaSetupRecommended: boolean;
  
  // Onboarding
  onboardingSteps: OnboardingStep[];
}

export interface UserProfile {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  photoURL?: string;
  phoneNumber?: string;
  
  // Account status
  disabled: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
  
  // Roles and permissions
  roles: UserRole[];
  permissions: Permission[];
  
  // Preferences
  preferences: UserPreferences;
  
  // Metadata
  metadata: UserMetadata;
  
  // Security
  mfaEnabled: boolean;
  trustedDevices: string[];
  
  // Subscription and billing
  subscriptionTier?: SubscriptionTier;
  billingInfo?: BillingInfo;
}

export interface UserProfileData {
  displayName?: string;
  photoURL?: string;
  phoneNumber?: string;
  preferences?: Partial<UserPreferences>;
  marketingOptIn?: boolean;
}

export interface UserPreferences {
  // Notification preferences
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  
  // AI preferences
  defaultAIModel?: string;
  aiPersonality?: string;
  
  // UI preferences
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  
  // Privacy preferences
  dataSharing: boolean;
  analyticsOptOut: boolean;
  
  // Feature preferences
  betaFeatures: boolean;
  advancedMode: boolean;
}

export interface UserMetadata {
  // Registration info
  registrationMethod: AuthenticationMethod;
  registrationIP?: string;
  registrationUserAgent?: string;
  
  // Marketing attribution
  referralCode?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  
  // Account history
  lastPasswordChange?: Date;
  lastProfileUpdate?: Date;
  
  // Security events
  lastSecurityCheck?: Date;
  suspiciousActivityCount: number;
  
  // Usage statistics
  totalLogins: number;
  totalApiCalls: number;
  totalCreditsUsed: number;
}

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
  order: number;
  action?: OnboardingAction;
}

export interface OnboardingAction {
  type: 'navigate' | 'modal' | 'api_call';
  target: string;
  data?: any;
}

export interface SecurityContext {
  ipAddress: string;
  userAgent: string;
  deviceId?: string;
  location?: LocationInfo;
  requestPath: string;
  requestMethod: string;
}

export interface SecurityEvent {
  type: SecurityEventType;
  severity: SecuritySeverity;
  description: string;
  context: SecurityContext;
  timestamp: Date;
  resolved?: boolean;
}

export enum SecurityEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  PASSWORD_CHANGE = 'password_change',
  ROLE_CHANGE = 'role_change',
  PERMISSION_CHANGE = 'permission_change',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_UNLOCKED = 'account_unlocked',
  MFA_ENABLED = 'mfa_enabled',
  MFA_DISABLED = 'mfa_disabled',
  API_KEY_CREATED = 'api_key_created',
  API_KEY_REVOKED = 'api_key_revoked'
}

export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ApiKeyData {
  name: string;
  description?: string;
  permissions: Permission[];
  expiresAt?: Date;
  ipWhitelist?: string[];
  rateLimits?: ApiKeyRateLimits;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  description?: string;
  keyHash: string;
  permissions: Permission[];
  
  // Status
  active: boolean;
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
  
  // Security
  ipWhitelist?: string[];
  rateLimits?: ApiKeyRateLimits;
  
  // Usage statistics
  totalRequests: number;
  lastRequestIP?: string;
  lastRequestUserAgent?: string;
}

export interface ApiKeyRateLimits {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
}

export interface ApiKeyValidationResult {
  isValid: boolean;
  apiKey?: ApiKey;
  user?: UserProfile;
  error?: AuthenticationError;
  
  // Rate limiting
  rateLimitExceeded?: boolean;
  rateLimitReset?: Date;
  
  // Security checks
  ipAllowed: boolean;
  keyExpired: boolean;
}

export enum SubscriptionTier {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise'
}

export interface BillingInfo {
  customerId?: string;
  subscriptionId?: string;
  paymentMethodId?: string;
  billingEmail?: string;
  
  // Address
  billingAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  
  // Tax info
  taxId?: string;
  taxExempt?: boolean;
}

/**
 * Authentication Service Implementation
 */
export class AuthService implements IAuthService {
  constructor() {
    if (!auth || !firestore) {
      logger.warn('AuthService initialized without Firebase services - some features may not work');
    }
  }

  /**
   * Register a new user
   */
  async registerUser(registrationData: UserRegistrationData): Promise<UserRegistrationResult> {
    if (!auth || !firestore) {
      throw new Error('Firebase services not available');
    }

    try {
      logger.info('Starting user registration', {
        email: registrationData.email,
        method: registrationData.method
      });

      // Create user in Firebase Auth
      const userRecord = await auth.createUser({
        email: registrationData.email,
        password: registrationData.password,
        displayName: registrationData.displayName,
        phoneNumber: registrationData.phoneNumber,
        emailVerified: false
      });

      // Set initial custom claims
      await auth.setCustomUserClaims(userRecord.uid, {
        roles: [UserRole.USER],
        permissions: this.getRolePermissions(UserRole.USER),
        registrationMethod: registrationData.method,
        createdAt: new Date().toISOString()
      });

      // Create user profile in Firestore
      const userProfile: UserProfile = {
        uid: userRecord.uid,
        email: registrationData.email,
        emailVerified: false,
        displayName: registrationData.displayName,
        disabled: false,
        createdAt: new Date(),
        roles: [UserRole.USER],
        permissions: this.getRolePermissions(UserRole.USER),
        preferences: this.getDefaultPreferences(),
        metadata: {
          registrationMethod: registrationData.method,
          registrationIP: registrationData.deviceInfo?.fingerprint,
          utmSource: registrationData.utmSource,
          utmMedium: registrationData.utmMedium,
          utmCampaign: registrationData.utmCampaign,
          suspiciousActivityCount: 0,
          totalLogins: 0,
          totalApiCalls: 0,
          totalCreditsUsed: 0
        },
        mfaEnabled: false,
        trustedDevices: []
      };

      await firestore.collection('users').doc(userRecord.uid).set(userProfile);

      // Create initial session if device info provided
      let session: UserSession | undefined;
      if (registrationData.deviceInfo && registrationData.locationInfo) {
        const userContext: UserContext = {
          uid: userRecord.uid,
          email: registrationData.email,
          emailVerified: false,
          roles: [UserRole.USER],
          permissions: this.getRolePermissions(UserRole.USER),
          authTime: Math.floor(Date.now() / 1000),
          issuedAt: Math.floor(Date.now() / 1000),
          expiresAt: Math.floor(Date.now() / 1000) + 3600 // 1 hour
        };

        session = await this.createSession(userContext, registrationData.deviceInfo, registrationData.locationInfo);
      }

      // Log security event
      await this.logSecurityEvent(userRecord.uid, {
        type: SecurityEventType.LOGIN_SUCCESS,
        severity: SecuritySeverity.LOW,
        description: 'User registration completed',
        context: {
          ipAddress: registrationData.deviceInfo?.fingerprint || 'unknown',
          userAgent: 'registration',
          requestPath: '/auth/register',
          requestMethod: 'POST'
        },
        timestamp: new Date()
      });

      logger.info('User registration completed', {
        userId: userRecord.uid,
        email: registrationData.email
      });

      return {
        userId: userRecord.uid,
        user: userProfile,
        session: session!,
        welcomeCredits: 1000, // Welcome bonus
        emailVerificationRequired: true,
        mfaSetupRecommended: true,
        onboardingSteps: this.getOnboardingSteps()
      };
    } catch (error) {
      logger.error('User registration failed', {
        email: registrationData.email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, profileData: UserProfileData): Promise<UserProfile> {
    if (!auth || !firestore) {
      throw new Error('Firebase services not available');
    }

    try {
      // Update Firebase Auth user
      const updateData: any = {};
      if (profileData.displayName !== undefined) updateData.displayName = profileData.displayName;
      if (profileData.photoURL !== undefined) updateData.photoURL = profileData.photoURL;
      if (profileData.phoneNumber !== undefined) updateData.phoneNumber = profileData.phoneNumber;

      if (Object.keys(updateData).length > 0) {
        await auth.updateUser(userId, updateData);
      }

      // Update Firestore profile
      const firestoreUpdate: any = {
        lastProfileUpdate: new Date()
      };

      if (profileData.displayName !== undefined) firestoreUpdate.displayName = profileData.displayName;
      if (profileData.photoURL !== undefined) firestoreUpdate.photoURL = profileData.photoURL;
      if (profileData.phoneNumber !== undefined) firestoreUpdate.phoneNumber = profileData.phoneNumber;
      if (profileData.preferences) {
        firestoreUpdate['preferences'] = profileData.preferences;
      }

      await firestore.collection('users').doc(userId).update(firestoreUpdate);

      // Get updated profile
      const updatedProfile = await this.getUserProfile(userId);

      logger.info('User profile updated', {
        userId,
        updatedFields: Object.keys(profileData)
      });

      return updatedProfile;
    } catch (error) {
      logger.error('Failed to update user profile', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId: string): Promise<UserProfile> {
    if (!firestore) {
      throw new Error('Firestore not available');
    }

    try {
      const doc = await firestore.collection('users').doc(userId).get();
      
      if (!doc.exists) {
        throw new Error('User profile not found');
      }

      const data = doc.data()!;
      
      return {
        uid: userId,
        email: data.email,
        emailVerified: data.emailVerified || false,
        displayName: data.displayName,
        photoURL: data.photoURL,
        phoneNumber: data.phoneNumber,
        disabled: data.disabled || false,
        createdAt: data.createdAt?.toDate() || new Date(),
        lastLoginAt: data.lastLoginAt?.toDate(),
        roles: data.roles || [UserRole.USER],
        permissions: data.permissions || [],
        preferences: data.preferences || this.getDefaultPreferences(),
        metadata: data.metadata || {},
        mfaEnabled: data.mfaEnabled || false,
        trustedDevices: data.trustedDevices || [],
        subscriptionTier: data.subscriptionTier,
        billingInfo: data.billingInfo
      };
    } catch (error) {
      logger.error('Failed to get user profile', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Delete user account
   */
  async deleteUserAccount(userId: string): Promise<void> {
    if (!auth || !firestore) {
      throw new Error('Firebase services not available');
    }

    try {
      // Delete from Firebase Auth
      await auth.deleteUser(userId);

      // Delete from Firestore (in a batch)
      const batch = firestore.batch();
      
      // Delete user profile
      batch.delete(firestore.collection('users').doc(userId));
      
      // Delete user sessions
      const sessionsQuery = await firestore.collection('user_sessions')
        .where('userId', '==', userId)
        .get();
      
      sessionsQuery.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      // Delete API keys
      const apiKeysQuery = await firestore.collection('api_keys')
        .where('userId', '==', userId)
        .get();
      
      apiKeysQuery.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      logger.info('User account deleted', { userId });
    } catch (error) {
      logger.error('Failed to delete user account', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Assign role to user
   */
  async assignRole(userId: string, role: UserRole): Promise<void> {
    if (!auth || !firestore) {
      throw new Error('Firebase services not available');
    }

    try {
      const userProfile = await this.getUserProfile(userId);
      
      if (!userProfile.roles.includes(role)) {
        const updatedRoles = [...userProfile.roles, role];
        const updatedPermissions = this.calculatePermissions(updatedRoles);

        // Update custom claims
        await auth.setCustomUserClaims(userId, {
          ...userProfile.metadata,
          roles: updatedRoles,
          permissions: updatedPermissions
        });

        // Update Firestore
        await firestore.collection('users').doc(userId).update({
          roles: updatedRoles,
          permissions: updatedPermissions
        });

        // Log security event
        await this.logSecurityEvent(userId, {
          type: SecurityEventType.ROLE_CHANGE,
          severity: SecuritySeverity.MEDIUM,
          description: `Role ${role} assigned`,
          context: {
            ipAddress: 'system',
            userAgent: 'system',
            requestPath: '/auth/assign-role',
            requestMethod: 'POST'
          },
          timestamp: new Date()
        });

        logger.info('Role assigned to user', { userId, role });
      }
    } catch (error) {
      logger.error('Failed to assign role', {
        userId,
        role,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Remove role from user
   */
  async removeRole(userId: string, role: UserRole): Promise<void> {
    if (!auth || !firestore) {
      throw new Error('Firebase services not available');
    }

    try {
      const userProfile = await this.getUserProfile(userId);
      
      if (userProfile.roles.includes(role)) {
        const updatedRoles = userProfile.roles.filter(r => r !== role);
        
        // Ensure user always has at least USER role
        if (updatedRoles.length === 0) {
          updatedRoles.push(UserRole.USER);
        }

        const updatedPermissions = this.calculatePermissions(updatedRoles);

        // Update custom claims
        await auth.setCustomUserClaims(userId, {
          ...userProfile.metadata,
          roles: updatedRoles,
          permissions: updatedPermissions
        });

        // Update Firestore
        await firestore.collection('users').doc(userId).update({
          roles: updatedRoles,
          permissions: updatedPermissions
        });

        // Log security event
        await this.logSecurityEvent(userId, {
          type: SecurityEventType.ROLE_CHANGE,
          severity: SecuritySeverity.MEDIUM,
          description: `Role ${role} removed`,
          context: {
            ipAddress: 'system',
            userAgent: 'system',
            requestPath: '/auth/remove-role',
            requestMethod: 'POST'
          },
          timestamp: new Date()
        });

        logger.info('Role removed from user', { userId, role });
      }
    } catch (error) {
      logger.error('Failed to remove role', {
        userId,
        role,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Assign permission to user
   */
  async assignPermission(userId: string, permission: Permission): Promise<void> {
    if (!firestore) {
      throw new Error('Firestore not available');
    }

    try {
      const userProfile = await this.getUserProfile(userId);
      
      if (!userProfile.permissions.includes(permission)) {
        const updatedPermissions = [...userProfile.permissions, permission];

        // Update Firestore
        await firestore.collection('users').doc(userId).update({
          permissions: updatedPermissions
        });

        // Log security event
        await this.logSecurityEvent(userId, {
          type: SecurityEventType.PERMISSION_CHANGE,
          severity: SecuritySeverity.LOW,
          description: `Permission ${permission} assigned`,
          context: {
            ipAddress: 'system',
            userAgent: 'system',
            requestPath: '/auth/assign-permission',
            requestMethod: 'POST'
          },
          timestamp: new Date()
        });

        logger.info('Permission assigned to user', { userId, permission });
      }
    } catch (error) {
      logger.error('Failed to assign permission', {
        userId,
        permission,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Remove permission from user
   */
  async removePermission(userId: string, permission: Permission): Promise<void> {
    if (!firestore) {
      throw new Error('Firestore not available');
    }

    try {
      const userProfile = await this.getUserProfile(userId);
      
      if (userProfile.permissions.includes(permission)) {
        const updatedPermissions = userProfile.permissions.filter(p => p !== permission);

        // Update Firestore
        await firestore.collection('users').doc(userId).update({
          permissions: updatedPermissions
        });

        // Log security event
        await this.logSecurityEvent(userId, {
          type: SecurityEventType.PERMISSION_CHANGE,
          severity: SecuritySeverity.LOW,
          description: `Permission ${permission} removed`,
          context: {
            ipAddress: 'system',
            userAgent: 'system',
            requestPath: '/auth/remove-permission',
            requestMethod: 'POST'
          },
          timestamp: new Date()
        });

        logger.info('Permission removed from user', { userId, permission });
      }
    } catch (error) {
      logger.error('Failed to remove permission', {
        userId,
        permission,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get user roles
   */
  async getUserRoles(userId: string): Promise<UserRole[]> {
    const profile = await this.getUserProfile(userId);
    return profile.roles;
  }

  /**
   * Get user permissions
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    const profile = await this.getUserProfile(userId);
    return profile.permissions;
  }

  /**
   * Refresh token (placeholder implementation)
   */
  async refreshToken(request: TokenRefreshRequest): Promise<TokenRefreshResult> {
    // This would integrate with Firebase Auth token refresh
    // For now, return a placeholder response
    return {
      success: false,
      error: new InvalidTokenError('Token refresh not implemented yet'),
      refreshedAt: new Date()
    } as any;
  }

  /**
   * Revoke token
   */
  async revokeToken(userId: string, tokenId?: string): Promise<void> {
    if (!auth) {
      throw new Error('Firebase Auth not available');
    }

    try {
      await auth.revokeRefreshTokens(userId);
      
      logger.info('Token revoked', { userId, tokenId });
    } catch (error) {
      logger.error('Failed to revoke token', {
        userId,
        tokenId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Revoke all tokens for user
   */
  async revokeAllTokens(userId: string): Promise<void> {
    await this.revokeToken(userId);
  }

  /**
   * Create session (placeholder implementation)
   */
  async createSession(userContext: UserContext, deviceInfo: DeviceInfo, locationInfo: LocationInfo): Promise<UserSession> {
    // Placeholder implementation - would create actual session in Firestore
    const session: UserSession = {
      sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: userContext.uid,
      createdAt: new Date(),
      lastActivity: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      isActive: true,
      deviceInfo,
      locationInfo,
      ipAddress: locationInfo.country || 'unknown',
      userAgent: deviceInfo.browser || 'unknown',
      activityLog: []
    };

    return session;
  }

  /**
   * Validate session (placeholder implementation)
   */
  async validateSession(sessionId: string): Promise<SessionValidationResult> {
    return {
      isValid: false,
      error: new InvalidTokenError('Session validation not implemented yet')
    };
  }

  /**
   * Terminate session
   */
  async terminateSession(sessionId: string): Promise<void> {
    // Placeholder implementation
    logger.info('Session terminated', { sessionId });
  }

  /**
   * Get user sessions
   */
  async getUserSessions(userId: string): Promise<UserSession[]> {
    // Placeholder implementation
    return [];
  }

  /**
   * Perform security check
   */
  async performSecurityCheck(userId: string, context: SecurityContext): Promise<SecurityAssessment> {
    // Basic security assessment
    return {
      riskLevel: 'low' as any,
      riskScore: 10,
      factors: [],
      recommendations: [],
      deviceTrust: 'unknown' as any,
      locationTrust: 'unknown' as any
    };
  }

  /**
   * Log security event
   */
  async logSecurityEvent(userId: string, event: SecurityEvent): Promise<void> {
    if (!firestore) {
      logger.warn('Cannot log security event - Firestore not available', { userId, event: event.type });
      return;
    }

    try {
      await firestore.collection('security_events').add({
        userId,
        ...event,
        timestamp: event.timestamp
      });

      logger.debug('Security event logged', {
        userId,
        eventType: event.type,
        severity: event.severity
      });
    } catch (error) {
      logger.error('Failed to log security event', {
        userId,
        eventType: event.type,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Generate API key (placeholder implementation)
   */
  async generateApiKey(userId: string, keyData: ApiKeyData): Promise<ApiKey> {
    const apiKey: ApiKey = {
      id: `ak_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      name: keyData.name,
      description: keyData.description,
      keyHash: 'placeholder_hash',
      permissions: keyData.permissions,
      active: true,
      createdAt: new Date(),
      expiresAt: keyData.expiresAt,
      ipWhitelist: keyData.ipWhitelist,
      rateLimits: keyData.rateLimits,
      totalRequests: 0
    };

    return apiKey;
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(userId: string, keyId: string): Promise<void> {
    logger.info('API key revoked', { userId, keyId });
  }

  /**
   * Validate API key
   */
  async validateApiKey(keyId: string): Promise<ApiKeyValidationResult> {
    return {
      isValid: false,
      error: new InvalidTokenError('API key validation not implemented yet'),
      ipAllowed: false,
      keyExpired: false
    };
  }

  /**
   * Get user API keys
   */
  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    return [];
  }

  /**
   * Get role permissions
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
   * Calculate permissions from multiple roles
   */
  private calculatePermissions(roles: UserRole[]): Permission[] {
    const permissions = new Set<Permission>();
    
    roles.forEach(role => {
      const rolePermissions = this.getRolePermissions(role);
      rolePermissions.forEach(permission => permissions.add(permission));
    });

    return Array.from(permissions);
  }

  /**
   * Get default user preferences
   */
  private getDefaultPreferences(): UserPreferences {
    return {
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
    };
  }

  /**
   * Get onboarding steps for new users
   */
  private getOnboardingSteps(): OnboardingStep[] {
    return [
      {
        id: 'verify_email',
        title: 'Verify Email Address',
        description: 'Verify your email address to secure your account',
        completed: false,
        required: true,
        order: 1,
        action: {
          type: 'api_call',
          target: '/auth/send-verification'
        }
      },
      {
        id: 'setup_profile',
        title: 'Complete Profile',
        description: 'Add your name and profile picture',
        completed: false,
        required: false,
        order: 2,
        action: {
          type: 'navigate',
          target: '/profile/edit'
        }
      },
      {
        id: 'setup_mfa',
        title: 'Enable Two-Factor Authentication',
        description: 'Add an extra layer of security to your account',
        completed: false,
        required: false,
        order: 3,
        action: {
          type: 'navigate',
          target: '/security/mfa'
        }
      },
      {
        id: 'first_ai_chat',
        title: 'Try AI Assistant',
        description: 'Start your first conversation with our AI assistant',
        completed: false,
        required: false,
        order: 4,
        action: {
          type: 'navigate',
          target: '/chat'
        }
      }
    ];
  }
}

// Export singleton instance
export const authService = new AuthService();