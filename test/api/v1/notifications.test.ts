/**
 * Notifications API v1 Unit Tests
 * Tests for notification API endpoints
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { notificationsRouter } from '../../../src/api/v1/notifications';
import { 
  NotificationType,
  NotificationChannel,
  NotificationPriority,
  NotificationStatus
} from '../../../src/features/notification-system';

// Mock Firebase Admin
jest.mock('firebase-admin');
jest.mock('../../../src/shared/observability/logger');
jest.mock('../../../src/shared/observability/metrics');

// Mock authentication middleware
jest.mock('../../../src/api/middleware/auth', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.user = {
      uid: 'test-user-id',
      email: 'test@example.com',
      roles: ['user'],
      permissions: ['view_notifications']
    };
    next();
  },
  requireRole: (role: string) => (req: any, res: any, next: any) => {
    if (role === 'admin' && !req.user?.roles?.includes('admin')) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  },
  rateLimitByUser: (options: any) => (req: any, res: any, next: any) => next()
}));

// Mock validation middleware
jest.mock('../../../src/api/middleware/validation', () => ({
  validateRequest: (schema: any) => (req: any, res: any, next: any) => next()
}));

// Mock notification service
const mockNotificationService = {
  getUserNotifications: jest.fn(),
  sendNotification: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  deleteNotification: jest.fn(),
  getPreferences: jest.fn(),
  updatePreferences: jest.fn(),
  getAnalytics: jest.fn()
};

// Mock the service getter
jest.mock('../../../src/api/v1/notifications', () => {
  const originalModule = jest.requireActual('../../../src/api/v1/notifications');
  return {
    ...originalModule,
    getNotificationService: () => mockNotificationService
  };
});

describe('Notifications API v1', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    
    app = express();
    app.use(express.json());
    app.use('/notifications', notificationsRouter);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /notifications', () => {
    it('should retrieve user notifications successfully', async () => {
      const mockNotifications = [
        {
          id: 'notif-1',
          userId: 'test-user-id',
          type: NotificationType.LOW_BALANCE,
          title: 'Low Balance Alert',
          message: 'Your balance is low',
          status: NotificationStatus.SENT,
          createdAt: new Date()
        }
      ];

      mockNotificationService.getUserNotifications.mockResolvedValue(mockNotifications);

      const response = await request(app)
        .get('/notifications')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notifications).toHaveLength(1);
      expect(response.body.data.notifications[0].id).toBe('notif-1');
      expect(mockNotificationService.getUserNotifications).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({
          limit: 50,
          offset: 0
        })
      );
    });

    it('should handle query parameters correctly', async () => {
      mockNotificationService.getUserNotifications.mockResolvedValue([]);

      await request(app)
        .get('/notifications')
        .query({
          limit: '10',
          offset: '20',
          unreadOnly: 'true',
          types: 'low_balance,task_completed'
        })
        .expect(200);

      expect(mockNotificationService.getUserNotifications).toHaveBeenCalledWith(
        'test-user-id',
        expect.objectContaining({
          limit: 10,
          offset: 20,
          unreadOnly: true,
          types: ['low_balance', 'task_completed']
        })
      );
    });

    it('should handle service errors', async () => {
      mockNotificationService.getUserNotifications.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/notifications')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to retrieve notifications');
    });
  });

  describe('PATCH /notifications/:notificationId/read', () => {
    it('should mark notification as read successfully', async () => {
      mockNotificationService.markAsRead.mockResolvedValue(true);

      const response = await request(app)
        .patch('/notifications/notif-1/read')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.marked).toBe(true);
      expect(mockNotificationService.markAsRead).toHaveBeenCalledWith('notif-1', 'test-user-id');
    });

    it('should return 404 for non-existent notification', async () => {
      mockNotificationService.markAsRead.mockResolvedValue(false);

      const response = await request(app)
        .patch('/notifications/notif-1/read')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Notification not found or access denied');
    });
  });

  describe('PATCH /notifications/read-all', () => {
    it('should mark all notifications as read successfully', async () => {
      mockNotificationService.markAllAsRead.mockResolvedValue(5);

      const response = await request(app)
        .patch('/notifications/read-all')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.markedCount).toBe(5);
      expect(mockNotificationService.markAllAsRead).toHaveBeenCalledWith('test-user-id');
    });
  });

  describe('DELETE /notifications/:notificationId', () => {
    it('should delete notification successfully', async () => {
      mockNotificationService.deleteNotification.mockResolvedValue(true);

      const response = await request(app)
        .delete('/notifications/notif-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted).toBe(true);
      expect(mockNotificationService.deleteNotification).toHaveBeenCalledWith('notif-1', 'test-user-id');
    });

    it('should return 404 for non-existent notification', async () => {
      mockNotificationService.deleteNotification.mockResolvedValue(false);

      const response = await request(app)
        .delete('/notifications/notif-1')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Notification not found or access denied');
    });
  });

  describe('GET /notifications/preferences', () => {
    it('should retrieve notification preferences successfully', async () => {
      const mockPreferences = {
        userId: 'test-user-id',
        channels: {
          email: {
            enabled: true,
            types: [NotificationType.LOW_BALANCE],
            minPriority: NotificationPriority.NORMAL
          }
        }
      };

      mockNotificationService.getPreferences.mockResolvedValue(mockPreferences);

      const response = await request(app)
        .get('/notifications/preferences')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.preferences).toEqual(mockPreferences);
      expect(mockNotificationService.getPreferences).toHaveBeenCalledWith('test-user-id');
    });
  });

  describe('PUT /notifications/preferences', () => {
    it('should update notification preferences successfully', async () => {
      const updates = {
        channels: {
          push: {
            enabled: true,
            types: [NotificationType.TASK_COMPLETED],
            minPriority: NotificationPriority.HIGH
          }
        }
      };

      const updatedPreferences = {
        userId: 'test-user-id',
        ...updates,
        updatedAt: new Date()
      };

      mockNotificationService.updatePreferences.mockResolvedValue(updatedPreferences);

      const response = await request(app)
        .put('/notifications/preferences')
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.preferences).toEqual(updatedPreferences);
      expect(mockNotificationService.updatePreferences).toHaveBeenCalledWith('test-user-id', updates);
    });
  });

  describe('GET /notifications/config', () => {
    it('should return notification configuration', async () => {
      const response = await request(app)
        .get('/notifications/config')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.types).toContain(NotificationType.LOW_BALANCE);
      expect(response.body.data.channels).toContain(NotificationChannel.EMAIL);
      expect(response.body.data.priorities).toContain(NotificationPriority.HIGH);
    });
  });

  describe('Admin endpoints', () => {
    beforeEach(() => {
      // Mock admin user
      jest.mocked(require('../../../src/api/middleware/auth').requireAuth).mockImplementation(
        (req: any, res: any, next: any) => {
          req.user = {
            uid: 'admin-user-id',
            email: 'admin@example.com',
            roles: ['admin'],
            permissions: ['view_notifications', 'send_notifications']
          };
          next();
        }
      );
    });

    describe('POST /notifications/send', () => {
      it('should send notification successfully for admin', async () => {
        const notificationRequest = {
          userId: 'target-user-id',
          type: NotificationType.SYSTEM_MAINTENANCE,
          title: 'System Maintenance',
          message: 'Scheduled maintenance tonight',
          priority: NotificationPriority.HIGH
        };

        const mockNotification = {
          id: 'notif-1',
          ...notificationRequest,
          status: NotificationStatus.SENT,
          createdAt: new Date()
        };

        mockNotificationService.sendNotification.mockResolvedValue(mockNotification);

        const response = await request(app)
          .post('/notifications/send')
          .send(notificationRequest)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.notification.id).toBe('notif-1');
        expect(mockNotificationService.sendNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'target-user-id',
            type: NotificationType.SYSTEM_MAINTENANCE
          })
        );
      });

      it('should return 400 for missing userId', async () => {
        const notificationRequest = {
          type: NotificationType.SYSTEM_MAINTENANCE,
          title: 'System Maintenance',
          message: 'Scheduled maintenance tonight'
        };

        const response = await request(app)
          .post('/notifications/send')
          .send(notificationRequest)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('userId is required');
      });
    });

    describe('GET /notifications/analytics', () => {
      it('should retrieve notification analytics for admin', async () => {
        const mockAnalytics = {
          timeRange: {
            start: new Date('2023-01-01'),
            end: new Date('2023-01-31')
          },
          metrics: {
            sent: 100,
            delivered: 95,
            read: 80,
            failed: 5,
            clickThrough: 20,
            unsubscribed: 2
          },
          deliveryRate: 95,
          readRate: 84.2,
          clickThroughRate: 21.1
        };

        mockNotificationService.getAnalytics.mockResolvedValue(mockAnalytics);

        const response = await request(app)
          .get('/notifications/analytics')
          .query({
            startDate: '2023-01-01T00:00:00Z',
            endDate: '2023-01-31T23:59:59Z'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.analytics).toEqual(mockAnalytics);
        expect(mockNotificationService.getAnalytics).toHaveBeenCalledWith(
          expect.objectContaining({
            timeRange: {
              start: new Date('2023-01-01T00:00:00Z'),
              end: new Date('2023-01-31T23:59:59Z')
            }
          })
        );
      });
    });
  });
});