/**
 * Authentication API Routes
 * User registration, login flows, and authentication management
 */

import { Router } from 'express';
import { asyncHandler, ValidationError } from '../middleware/error-handling';
import { optionalAuth, requireAuth, requireAdmin } from '../middleware/auth';
import { authService } from '../../shared/services/auth-service';
import { 
  UserRole, 
  Permission, 
  AuthenticationMethod,
  DeviceType 
} from '../../shared/types/firebase-auth';
// import { logger } from '../../shared/observability/logger';

const authRouter = Router();

// User Registration endpoint (public)
authRouter.post('/register', asyncHandler(async (req: any, res: any) => {
  const { 
    email, 
    password, 
    displayName, 
    phoneNumber,
    acceptedTerms,
    acceptedPrivacy,
    marketingOptIn,
    referralCode,
    utmSource,
    utmMedium,
    utmCampaign
  } = req.body;

  // Validation
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  if (!acceptedTerms || !acceptedPrivacy) {
    throw new ValidationError('Terms of service and privacy policy must be accepted');
  }

  // Extract device and location info from request
  const deviceInfo = {
    deviceId: req.headers['x-device-id'] || `device_${Date.now()}`,
    deviceType: DeviceType.DESKTOP, // Default, could be detected from user agent
    browser: req.get('User-Agent')?.split(' ')[0],
    os: 'Unknown',
    fingerprint: req.ip,
    trusted: false
  };

  const locationInfo = {
    country: req.headers['cf-ipcountry'] || 'Unknown',
    trustLevel: 'unknown' as any
  };

  const registrationData = {
    email,
    password,
    displayName,
    phoneNumber,
    method: AuthenticationMethod.PASSWORD,
    deviceInfo,
    locationInfo,
    referralCode,
    utmSource,
    utmMedium,
    utmCampaign,
    acceptedTerms,
    acceptedPrivacy,
    marketingOptIn
  };

  const result = await authService.registerUser(registrationData);

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      userId: result.userId,
      user: {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        emailVerified: result.user.emailVerified,
        roles: result.user.roles,
        createdAt: result.user.createdAt
      },
      welcomeCredits: result.welcomeCredits,
      nextSteps: {
        emailVerificationRequired: result.emailVerificationRequired,
        mfaSetupRecommended: result.mfaSetupRecommended,
        onboardingSteps: result.onboardingSteps
      }
    }
  });
}));

// Verify token endpoint (public)
authRouter.post('/verify', asyncHandler(async (req: any, res: any) => {
  const { idToken } = req.body;

  if (!idToken) {
    throw new ValidationError('ID token is required');
  }

  // Use the auth middleware's token validation
  const { firebaseAuthMiddleware } = await import('../middleware/auth');
  const validationResult = await firebaseAuthMiddleware.extractUserContext(idToken);

  if (!validationResult.isValid) {
    res.status(401).json({
      success: false,
      error: 'Invalid token',
      message: validationResult.error?.message || 'Token validation failed'
    });
    return;
  }

  res.json({
    success: true,
    message: 'Token is valid',
    data: {
      user: {
        uid: validationResult.userContext!.uid,
        email: validationResult.userContext!.email,
        emailVerified: validationResult.userContext!.emailVerified,
        roles: validationResult.userContext!.roles,
        permissions: validationResult.userContext!.permissions
      },
      tokenInfo: {
        issuedAt: new Date(validationResult.userContext!.issuedAt * 1000).toISOString(),
        expiresAt: new Date(validationResult.userContext!.expiresAt * 1000).toISOString(),
        expiresIn: validationResult.expiresIn
      }
    }
  });
}));

// Refresh token endpoint (public)
authRouter.post('/refresh', asyncHandler(async (req: any, res: any) => {
  const { refreshToken, deviceId } = req.body;

  if (!refreshToken) {
    throw new ValidationError('Refresh token is required');
  }

  const refreshRequest = {
    refreshToken,
    deviceId,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  };

  const result = await authService.refreshToken(refreshRequest);

  if (!result.success) {
    res.status(401).json({
      success: false,
      error: 'Token refresh failed',
      message: result.error?.message || 'Unable to refresh token'
    });
    return;
  }

  res.json({
    success: true,
    message: 'Token refreshed successfully',
    data: {
      idToken: result.newIdToken,
      refreshToken: result.newRefreshToken,
      expiresIn: result.expiresIn,
      securityAssessment: result.securityAssessment
    }
  });
}));

// Get current user info (optional auth)
authRouter.get('/me', optionalAuth, asyncHandler(async (req: any, res: any) => {
  if (!req.user) {
    res.json({
      authenticated: false,
      message: 'No authentication provided'
    });
    return;
  }

  // Get full user profile
  const userProfile = await authService.getUserProfile(req.user.uid);

  res.json({
    authenticated: true,
    user: {
      uid: userProfile.uid,
      email: userProfile.email,
      emailVerified: userProfile.emailVerified,
      displayName: userProfile.displayName,
      photoURL: userProfile.photoURL,
      phoneNumber: userProfile.phoneNumber,
      roles: userProfile.roles,
      permissions: userProfile.permissions,
      preferences: userProfile.preferences,
      mfaEnabled: userProfile.mfaEnabled,
      subscriptionTier: userProfile.subscriptionTier,
      createdAt: userProfile.createdAt,
      lastLoginAt: userProfile.lastLoginAt
    },
    securityInfo: req.securityAssessment ? {
      riskLevel: req.securityAssessment.riskLevel,
      deviceTrust: req.securityAssessment.deviceTrust,
      locationTrust: req.securityAssessment.locationTrust
    } : null
  });
}));

// Session status endpoint (public)
authRouter.get('/status', optionalAuth, asyncHandler(async (req: any, res: any) => {
  res.json({
    authenticated: !!req.user,
    timestamp: new Date().toISOString(),
    user: req.user ? {
      uid: req.user.uid,
      email: req.user.email,
      emailVerified: req.user.emailVerified,
      roles: req.user.roles,
      authTime: new Date(req.user.authTime * 1000).toISOString(),
      tokenIssuedAt: new Date(req.user.issuedAt * 1000).toISOString(),
      tokenExpiresAt: new Date(req.user.expiresAt * 1000).toISOString()
    } : null,
    rateLimitInfo: req.rateLimitInfo,
    securityAssessment: req.securityAssessment ? {
      riskLevel: req.securityAssessment.riskLevel,
      riskScore: req.securityAssessment.riskScore
    } : null
  });
}));

// Logout endpoint (authenticated)
authRouter.post('/logout', requireAuth, asyncHandler(async (req: any, res: any) => {
  const { allDevices } = req.body;

  if (allDevices) {
    // Revoke all tokens for the user
    await authService.revokeAllTokens(req.user.uid);
  } else {
    // Revoke current token only
    await authService.revokeToken(req.user.uid);
  }

  res.json({
    success: true,
    message: allDevices ? 'Logged out from all devices' : 'Logged out successfully'
  });
}));

// Get user sessions (authenticated)
authRouter.get('/sessions', requireAuth, asyncHandler(async (req: any, res: any) => {
  const sessions = await authService.getUserSessions(req.user.uid);

  res.json({
    success: true,
    data: {
      sessions: sessions.map(session => ({
        sessionId: session.sessionId,
        deviceInfo: session.deviceInfo,
        locationInfo: session.locationInfo,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        isActive: session.isActive
      }))
    }
  });
}));

// Terminate session (authenticated)
authRouter.delete('/sessions/:sessionId', requireAuth, asyncHandler(async (req: any, res: any) => {
  const { sessionId } = req.params;

  await authService.terminateSession(sessionId);

  res.json({
    success: true,
    message: 'Session terminated successfully'
  });
}));

// Admin Routes - Role Management

// Assign role to user (admin only)
authRouter.post('/admin/users/:userId/roles', requireAuth, requireAdmin, asyncHandler(async (req: any, res: any) => {
  const { userId } = req.params;
  const { role } = req.body;

  if (!Object.values(UserRole).includes(role)) {
    throw new ValidationError('Invalid role specified');
  }

  await authService.assignRole(userId, role);

  res.json({
    success: true,
    message: `Role ${role} assigned to user ${userId}`
  });
}));

// Remove role from user (admin only)
authRouter.delete('/admin/users/:userId/roles/:role', requireAuth, requireAdmin, asyncHandler(async (req: any, res: any) => {
  const { userId, role } = req.params;

  if (!Object.values(UserRole).includes(role)) {
    throw new ValidationError('Invalid role specified');
  }

  await authService.removeRole(userId, role as UserRole);

  res.json({
    success: true,
    message: `Role ${role} removed from user ${userId}`
  });
}));

// Assign permission to user (admin only)
authRouter.post('/admin/users/:userId/permissions', requireAuth, requireAdmin, asyncHandler(async (req: any, res: any) => {
  const { userId } = req.params;
  const { permission } = req.body;

  if (!Object.values(Permission).includes(permission)) {
    throw new ValidationError('Invalid permission specified');
  }

  await authService.assignPermission(userId, permission);

  res.json({
    success: true,
    message: `Permission ${permission} assigned to user ${userId}`
  });
}));

// Remove permission from user (admin only)
authRouter.delete('/admin/users/:userId/permissions/:permission', requireAuth, requireAdmin, asyncHandler(async (req: any, res: any) => {
  const { userId, permission } = req.params;

  if (!Object.values(Permission).includes(permission)) {
    throw new ValidationError('Invalid permission specified');
  }

  await authService.removePermission(userId, permission as Permission);

  res.json({
    success: true,
    message: `Permission ${permission} removed from user ${userId}`
  });
}));

// Get user roles and permissions (admin only)
authRouter.get('/admin/users/:userId/access', requireAuth, requireAdmin, asyncHandler(async (req: any, res: any) => {
  const { userId } = req.params;

  const [roles, permissions] = await Promise.all([
    authService.getUserRoles(userId),
    authService.getUserPermissions(userId)
  ]);

  res.json({
    success: true,
    data: {
      userId,
      roles,
      permissions
    }
  });
}));

// API Key Management

// Generate API key (authenticated)
authRouter.post('/api-keys', requireAuth, asyncHandler(async (req: any, res: any) => {
  const { name, description, permissions, expiresAt, ipWhitelist, rateLimits } = req.body;

  if (!name) {
    throw new ValidationError('API key name is required');
  }

  if (!permissions || !Array.isArray(permissions)) {
    throw new ValidationError('Permissions array is required');
  }

  // Validate permissions
  const invalidPermissions = permissions.filter(p => !Object.values(Permission).includes(p));
  if (invalidPermissions.length > 0) {
    throw new ValidationError(`Invalid permissions: ${invalidPermissions.join(', ')}`);
  }

  // Check if user has the permissions they're trying to assign
  const userPermissions = await authService.getUserPermissions(req.user.uid);
  const unauthorizedPermissions = permissions.filter(p => !userPermissions.includes(p));
  if (unauthorizedPermissions.length > 0) {
    throw new ValidationError(`You don't have permission to assign: ${unauthorizedPermissions.join(', ')}`);
  }

  const apiKeyData = {
    name,
    description,
    permissions,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    ipWhitelist,
    rateLimits
  };

  const apiKey = await authService.generateApiKey(req.user.uid, apiKeyData);

  res.status(201).json({
    success: true,
    message: 'API key generated successfully',
    data: {
      id: apiKey.id,
      name: apiKey.name,
      permissions: apiKey.permissions,
      createdAt: apiKey.createdAt,
      expiresAt: apiKey.expiresAt,
      // Note: The actual key would be returned only once here
      key: `${apiKey.id}_placeholder_key_value`
    }
  });
}));

// Get user API keys (authenticated)
authRouter.get('/api-keys', requireAuth, asyncHandler(async (req: any, res: any) => {
  const apiKeys = await authService.getUserApiKeys(req.user.uid);

  res.json({
    success: true,
    data: {
      apiKeys: apiKeys.map(key => ({
        id: key.id,
        name: key.name,
        description: key.description,
        permissions: key.permissions,
        active: key.active,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        totalRequests: key.totalRequests
      }))
    }
  });
}));

// Revoke API key (authenticated)
authRouter.delete('/api-keys/:keyId', requireAuth, asyncHandler(async (req: any, res: any) => {
  const { keyId } = req.params;

  await authService.revokeApiKey(req.user.uid, keyId);

  res.json({
    success: true,
    message: 'API key revoked successfully'
  });
}));

export { authRouter };