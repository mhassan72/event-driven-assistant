/**
 * Notifications API v1
 * API endpoints for notification management and preferences
 */

import { Router } from 'express';
import { 
  AuthenticatedRequest, 
  AuthenticatedResponse,
  UserRole
} from '../../shared/types';
import { 
  requireRole, 
  rateLimitByUser 
} from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { 
  NotificationService,
  NotificationTemplateService,
  NotificationDeliveryService,
  EmailProvider,
  PushProvider,
  SMSProvider,
  WebhookProvider,
  INotificationService,
  NotificationRequest,
  NotificationType,
  NotificationChannel,
  NotificationPriority,
  GetNotificationsOptions,
  AnalyticsOptions
} from '../../features/notification-system';
import { logger } from '../../shared/observability/logger';
import { metrics } from '../../shared/observability/metrics';
import { firestore, realtimeDb } from '../../app';
import { getMessaging } from 'firebase-admin/messaging';
import { z } from 'zod';

const notificationsRouter = Router();

// Validation schemas
const sendNotificationSchema = z.object({
  type: z.nativeEnum(NotificationType),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  data: z.record(z.string(), z.any()).optional(),
  channels: z.array(z.nativeEnum(NotificationChannel)).optional(),
  priority: z.nativeEnum(NotificationPriority).optional(),
  scheduledAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional()
});

const updatePreferencesSchema = z.object({
  channels: z.object({
    email: z.object({
      enabled: z.boolean(),
      types: z.array(z.nativeEnum(NotificationType)),
      minPriority: z.nativeEnum(NotificationPriority)
    }).optional(),
    push: z.object({
      enabled: z.boolean(),
      types: z.array(z.nativeEnum(NotificationType)),
      minPriority: z.nativeEnum(NotificationPriority)
    }).optional(),
    inApp: z.object({
      enabled: z.boolean(),
      types: z.array(z.nativeEnum(NotificationType)),
      minPriority: z.nativeEnum(NotificationPriority)
    }).optional(),
    sms: z.object({
      enabled: z.boolean(),
      types: z.array(z.nativeEnum(NotificationType)),
      minPriority: z.nativeEnum(NotificationPriority)
    }).optional(),
    webhook: z.object({
      enabled: z.boolean(),
      types: z.array(z.nativeEnum(NotificationType)),
      minPriority: z.nativeEnum(NotificationPriority),
      url: z.string().url().optional(),
      secret: z.string().optional(),
      headers: z.record(z.string(), z.string()).optional()
    }).optional()
  }).optional(),
  quietHours: z.object({
    enabled: z.boolean(),
    startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    timezone: z.string(),
    exceptions: z.array(z.nativeEnum(NotificationType)).optional()
  }).optional(),
  language: z.string().optional(),
  timezone: z.string().optional()
});

// Initialize notification service (this would typically be done via dependency injection)
let notificationService: INotificationService;

function getNotificationService(): INotificationService {
  if (!notificationService) {
    // Use imported firestore and realtimeDb instances
    if (!firestore || !realtimeDb) {
      throw new Error('Firebase services not initialized');
    }
    
    // Initialize providers
    const emailProvider = new EmailProvider(logger, metrics, {
      apiKey: process.env.EMAIL_API_KEY || '',
      fromEmail: process.env.FROM_EMAIL || 'noreply@example.com',
      fromName: process.env.FROM_NAME || 'AI Assistant'
    });
    
    const pushProvider = new PushProvider(logger, metrics, getMessaging());
    
    const smsProvider = new SMSProvider(logger, metrics, {
      apiKey: process.env.SMS_API_KEY || '',
      fromNumber: process.env.SMS_FROM_NUMBER || ''
    });
    
    const webhookProvider = new WebhookProvider(logger, metrics);
    
    // Initialize services
    const templateService = new NotificationTemplateService(firestore, logger);
    const deliveryService = new NotificationDeliveryService(
      firestore,
      realtimeDb,
      logger,
      metrics,
      templateService,
      emailProvider,
      pushProvider,
      smsProvider,
      webhookProvider
    );
    
    notificationService = new NotificationService(
      firestore,
      realtimeDb,
      logger,
      metrics,
      templateService,
      deliveryService
    );
  }
  
  return notificationService;
}

// Get user notifications
notificationsRouter.get('/', 
  rateLimitByUser({
    windowMs: 60 * 1000,
    maxRequests: 100
  }),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const userId = req.user!.uid;
      
      // Parse query parameters
      const options: GetNotificationsOptions = {
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
        unreadOnly: req.query.unreadOnly === 'true',
        types: req.query.types ? (req.query.types as string).split(',') as NotificationType[] : undefined,
        since: req.query.since ? new Date(req.query.since as string) : undefined
      };

      const service = getNotificationService();
      const notifications = await service.getUserNotifications(userId, options);

      res.json({
        success: true,
        data: {
          notifications,
          pagination: {
            limit: options.limit,
            offset: options.offset,
            hasMore: notifications.length === options.limit
          }
        }
      });

    } catch (error) {
      logger.error('Failed to get user notifications', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.uid,
        query: req.query
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve notifications'
      });
    }
  }
);

// Send notification (admin only)
notificationsRouter.post('/send',
  requireRole(UserRole.ADMIN),
  validateRequest(sendNotificationSchema),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const { userId, ...notificationData } = req.body;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'userId is required'
        });
      }

      const notificationRequest: NotificationRequest = {
        userId,
        ...notificationData,
        scheduledAt: notificationData.scheduledAt ? new Date(notificationData.scheduledAt) : undefined,
        expiresAt: notificationData.expiresAt ? new Date(notificationData.expiresAt) : undefined
      };

      const service = getNotificationService();
      const notification = await service.sendNotification(notificationRequest);

      return res.json({
        success: true,
        data: { notification }
      });

    } catch (error) {
      logger.error('Failed to send notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminId: req.user?.uid,
        body: req.body
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to send notification'
      });
    }
  }
);

// Mark notification as read
notificationsRouter.patch('/:notificationId/read',
  rateLimitByUser({
    windowMs: 60 * 1000,
    maxRequests: 200
  }),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const { notificationId } = req.params;
      const userId = req.user!.uid;

      const service = getNotificationService();
      const success = await service.markAsRead(notificationId, userId);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Notification not found or access denied'
        });
      }

      return res.json({
        success: true,
        data: { marked: true }
      });

    } catch (error) {
      logger.error('Failed to mark notification as read', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.uid,
        notificationId: req.params.notificationId
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to mark notification as read'
      });
    }
  }
);

// Mark all notifications as read
notificationsRouter.patch('/read-all',
  rateLimitByUser({
    windowMs: 60 * 1000,
    maxRequests: 10
  }),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const userId = req.user!.uid;

      const service = getNotificationService();
      const count = await service.markAllAsRead(userId);

      res.json({
        success: true,
        data: { markedCount: count }
      });

    } catch (error) {
      logger.error('Failed to mark all notifications as read', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.uid
      });

      res.status(500).json({
        success: false,
        error: 'Failed to mark all notifications as read'
      });
    }
  }
);

// Delete notification
notificationsRouter.delete('/:notificationId',
  rateLimitByUser({
    windowMs: 60 * 1000,
    maxRequests: 100
  }),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const { notificationId } = req.params;
      const userId = req.user!.uid;

      const service = getNotificationService();
      const success = await service.deleteNotification(notificationId, userId);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Notification not found or access denied'
        });
      }

      return res.json({
        success: true,
        data: { deleted: true }
      });

    } catch (error) {
      logger.error('Failed to delete notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.uid,
        notificationId: req.params.notificationId
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to delete notification'
      });
    }
  }
);

// Get notification preferences
notificationsRouter.get('/preferences',
  rateLimitByUser({
    windowMs: 60 * 1000,
    maxRequests: 50
  }),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const userId = req.user!.uid;

      const service = getNotificationService();
      const preferences = await service.getPreferences(userId);

      res.json({
        success: true,
        data: { preferences }
      });

    } catch (error) {
      logger.error('Failed to get notification preferences', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.uid
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve notification preferences'
      });
    }
  }
);

// Update notification preferences
notificationsRouter.put('/preferences',
  validateRequest(updatePreferencesSchema),
  rateLimitByUser({
    windowMs: 60 * 1000,
    maxRequests: 20
  }),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const userId = req.user!.uid;
      const updates = req.body;

      const service = getNotificationService();
      const preferences = await service.updatePreferences(userId, updates);

      res.json({
        success: true,
        data: { preferences }
      });

    } catch (error) {
      logger.error('Failed to update notification preferences', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user?.uid,
        updates: req.body
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update notification preferences'
      });
    }
  }
);

// Get notification analytics (admin only)
notificationsRouter.get('/analytics',
  requireRole(UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      const options: AnalyticsOptions = {
        userId: req.query.userId as string,
        type: req.query.type as NotificationType,
        channel: req.query.channel as NotificationChannel,
        timeRange: {
          start: new Date(req.query.startDate as string || Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(req.query.endDate as string || Date.now())
        }
      };

      const service = getNotificationService();
      const analytics = await service.getAnalytics(options);

      res.json({
        success: true,
        data: { analytics }
      });

    } catch (error) {
      logger.error('Failed to get notification analytics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        adminId: req.user?.uid,
        query: req.query
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve notification analytics'
      });
    }
  }
);

// Get notification types and channels (for UI configuration)
notificationsRouter.get('/config',
  async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    res.json({
      success: true,
      data: {
        types: Object.values(NotificationType),
        channels: Object.values(NotificationChannel),
        priorities: Object.values(NotificationPriority)
      }
    });
  }
);

export { notificationsRouter };