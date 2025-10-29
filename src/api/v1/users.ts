/**
 * Users API Routes
 * User profile and account management endpoints
 */

import { Router } from 'express';
import { asyncHandler, ValidationError } from '../middleware/error-handling';
import { requireAuth, requirePermission } from '../middleware/auth';
import { authService } from '../../shared/services/auth-service';
import { Permission } from '../../shared/types/firebase-auth';
import { logger } from '../../shared/observability/logger';

const usersRouter = Router();

// Get user profile (authenticated)
usersRouter.get('/profile', requireAuth, asyncHandler(async (req: any, res: any) => {
  const userProfile = await authService.getUserProfile(req.user.uid);

  res.json({
    success: true,
    data: {
      profile: {
        uid: userProfile.uid,
        email: userProfile.email,
        emailVerified: userProfile.emailVerified,
        displayName: userProfile.displayName,
        photoURL: userProfile.photoURL,
        phoneNumber: userProfile.phoneNumber,
        createdAt: userProfile.createdAt,
        lastLoginAt: userProfile.lastLoginAt,
        roles: userProfile.roles,
        permissions: userProfile.permissions,
        preferences: userProfile.preferences,
        mfaEnabled: userProfile.mfaEnabled,
        subscriptionTier: userProfile.subscriptionTier,
        metadata: {
          totalLogins: userProfile.metadata.totalLogins,
          totalApiCalls: userProfile.metadata.totalApiCalls,
          totalCreditsUsed: userProfile.metadata.totalCreditsUsed,
          registrationMethod: userProfile.metadata.registrationMethod
        }
      }
    }
  });
}));

// Update user profile (authenticated)
usersRouter.put('/profile', requireAuth, asyncHandler(async (req: any, res: any) => {
  const { displayName, photoURL, phoneNumber, preferences, marketingOptIn } = req.body;

  // Validate input
  if (displayName !== undefined && typeof displayName !== 'string') {
    throw new ValidationError('Display name must be a string');
  }

  if (photoURL !== undefined && typeof photoURL !== 'string') {
    throw new ValidationError('Photo URL must be a string');
  }

  if (phoneNumber !== undefined && typeof phoneNumber !== 'string') {
    throw new ValidationError('Phone number must be a string');
  }

  const profileData = {
    displayName,
    photoURL,
    phoneNumber,
    preferences,
    marketingOptIn
  };

  // Remove undefined values
  Object.keys(profileData).forEach(key => {
    if ((profileData as any)[key] === undefined) {
      delete (profileData as any)[key];
    }
  });

  const updatedProfile = await authService.updateUserProfile(req.user.uid, profileData);

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      profile: {
        uid: updatedProfile.uid,
        email: updatedProfile.email,
        emailVerified: updatedProfile.emailVerified,
        displayName: updatedProfile.displayName,
        photoURL: updatedProfile.photoURL,
        phoneNumber: updatedProfile.phoneNumber,
        preferences: updatedProfile.preferences,
        lastProfileUpdate: updatedProfile.metadata.lastProfileUpdate
      }
    }
  });
}));

// Get user preferences (authenticated)
usersRouter.get('/preferences', requireAuth, asyncHandler(async (req: any, res: any) => {
  const userProfile = await authService.getUserProfile(req.user.uid);

  res.json({
    success: true,
    data: {
      preferences: userProfile.preferences
    }
  });
}));

// Update user preferences (authenticated)
usersRouter.put('/preferences', requireAuth, asyncHandler(async (req: any, res: any) => {
  const preferences = req.body;

  // Validate preferences structure
  const validPreferenceKeys = [
    'emailNotifications',
    'pushNotifications', 
    'smsNotifications',
    'defaultAIModel',
    'aiPersonality',
    'theme',
    'language',
    'timezone',
    'dataSharing',
    'analyticsOptOut',
    'betaFeatures',
    'advancedMode'
  ];

  const invalidKeys = Object.keys(preferences).filter(key => !validPreferenceKeys.includes(key));
  if (invalidKeys.length > 0) {
    throw new ValidationError(`Invalid preference keys: ${invalidKeys.join(', ')}`);
  }

  const updatedProfile = await authService.updateUserProfile(req.user.uid, { preferences });

  res.json({
    success: true,
    message: 'Preferences updated successfully',
    data: {
      preferences: updatedProfile.preferences
    }
  });
}));

// Get user security info (authenticated)
usersRouter.get('/security', requireAuth, asyncHandler(async (req: any, res: any) => {
  const userProfile = await authService.getUserProfile(req.user.uid);
  const sessions = await authService.getUserSessions(req.user.uid);

  res.json({
    success: true,
    data: {
      security: {
        mfaEnabled: userProfile.mfaEnabled,
        trustedDevices: userProfile.trustedDevices.length,
        activeSessions: sessions.filter(s => s.isActive).length,
        lastPasswordChange: userProfile.metadata.lastPasswordChange,
        lastSecurityCheck: userProfile.metadata.lastSecurityCheck,
        suspiciousActivityCount: userProfile.metadata.suspiciousActivityCount
      }
    }
  });
}));

// Get user roles and permissions (authenticated)
usersRouter.get('/access', requireAuth, asyncHandler(async (req: any, res: any) => {
  const [roles, permissions] = await Promise.all([
    authService.getUserRoles(req.user.uid),
    authService.getUserPermissions(req.user.uid)
  ]);

  res.json({
    success: true,
    data: {
      access: {
        roles,
        permissions
      }
    }
  });
}));

// Get user activity log (authenticated, requires permission)
usersRouter.get('/activity', requireAuth, requirePermission(Permission.VIEW_ANALYTICS), asyncHandler(async (req: any, res: any) => {
  const { limit = 50, offset = 0 } = req.query;

  // This would typically fetch from a security events collection
  // For now, return placeholder data
  res.json({
    success: true,
    data: {
      activity: [],
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: 0
      }
    },
    message: 'Activity logging to be implemented with security event system'
  });
}));

// Get user notification preferences
usersRouter.get('/notifications/preferences', requireAuth, asyncHandler(async (req: any, res: any) => {
  const userProfile = await authService.getUserProfile(req.user.uid);

  res.json({
    success: true,
    data: {
      notifications: {
        emailNotifications: userProfile.preferences.emailNotifications,
        pushNotifications: userProfile.preferences.pushNotifications,
        smsNotifications: userProfile.preferences.smsNotifications
      }
    }
  });
}));

// Update notification preferences
usersRouter.put('/notifications/preferences', requireAuth, asyncHandler(async (req: any, res: any) => {
  const { emailNotifications, pushNotifications, smsNotifications } = req.body;

  const preferences = {
    emailNotifications,
    pushNotifications,
    smsNotifications
  };

  // Remove undefined values
  Object.keys(preferences).forEach(key => {
    if ((preferences as any)[key] === undefined) {
      delete (preferences as any)[key];
    }
  });

  const updatedProfile = await authService.updateUserProfile(req.user.uid, { preferences });

  res.json({
    success: true,
    message: 'Notification preferences updated successfully',
    data: {
      notifications: {
        emailNotifications: updatedProfile.preferences.emailNotifications,
        pushNotifications: updatedProfile.preferences.pushNotifications,
        smsNotifications: updatedProfile.preferences.smsNotifications
      }
    }
  });
}));

// Get notification history
usersRouter.get('/notifications/history', requireAuth, asyncHandler(async (req: any, res: any) => {
  // TODO: Implement in task 11.1 - Create user notification service
  res.json({
    success: true,
    data: {
      notifications: []
    },
    message: 'Notification history endpoint - to be implemented in task 11.1'
  });
}));

// Export user data (authenticated, GDPR compliance)
usersRouter.get('/export', requireAuth, asyncHandler(async (req: any, res: any) => {
  const userProfile = await authService.getUserProfile(req.user.uid);
  const sessions = await authService.getUserSessions(req.user.uid);
  const apiKeys = await authService.getUserApiKeys(req.user.uid);

  const exportData = {
    profile: userProfile,
    sessions: sessions.map(session => ({
      sessionId: session.sessionId,
      deviceInfo: session.deviceInfo,
      locationInfo: session.locationInfo,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity
    })),
    apiKeys: apiKeys.map(key => ({
      id: key.id,
      name: key.name,
      permissions: key.permissions,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt
    })),
    exportedAt: new Date().toISOString(),
    exportVersion: '1.0'
  };

  res.json({
    success: true,
    data: exportData,
    message: 'User data exported successfully'
  });
}));

// Delete user account (authenticated, requires confirmation)
usersRouter.delete('/account', requireAuth, asyncHandler(async (req: any, res: any) => {
  const { confirmation } = req.body;

  if (confirmation !== 'DELETE_MY_ACCOUNT') {
    throw new ValidationError('Account deletion requires confirmation. Send "DELETE_MY_ACCOUNT" in the confirmation field.');
  }

  // Log the account deletion request
  await authService.logSecurityEvent(req.user.uid, {
    type: 'account_deletion' as any,
    severity: 'high' as any,
    description: 'User requested account deletion',
    context: {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent') || 'unknown',
      requestPath: req.path,
      requestMethod: req.method
    },
    timestamp: new Date()
  });

  // Delete the user account
  await authService.deleteUserAccount(req.user.uid);

  logger.info('User account deleted', {
    userId: req.user.uid,
    email: req.user.email,
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: 'Account deleted successfully. All user data has been permanently removed.'
  });
}));

// Change password (authenticated)
usersRouter.post('/change-password', requireAuth, asyncHandler(async (req: any, res: any) => {
  // This would typically integrate with Firebase Auth password change
  // For now, return a placeholder response
  res.json({
    success: false,
    message: 'Password change functionality requires Firebase Auth integration - to be implemented'
  });
}));

// Request email verification (authenticated)
usersRouter.post('/verify-email', requireAuth, asyncHandler(async (req: any, res: any) => {
  // This would typically send a verification email via Firebase Auth
  // For now, return a placeholder response
  res.json({
    success: false,
    message: 'Email verification functionality requires Firebase Auth integration - to be implemented'
  });
}));

// Request password reset (public)
usersRouter.post('/reset-password', asyncHandler(async (req: any, res: any) => {
  const { email } = req.body;

  if (!email) {
    throw new ValidationError('Email is required');
  }

  // This would typically send a password reset email via Firebase Auth
  // For now, return a placeholder response
  res.json({
    success: false,
    message: 'Password reset functionality requires Firebase Auth integration - to be implemented'
  });
}));

export { usersRouter };