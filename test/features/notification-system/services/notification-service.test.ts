/**
 * Notification Service Unit Tests
 * Tests for core notification functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  NotificationService,
  NotificationRequest,
  Notification,
  NotificationPreferences,
  NotificationType,
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
  NotificationError,
  NotificationErrorCode
} from '../../../../src/features/notification-system';
import { IStructuredLogger } from '../../../../src/shared/observability/logger';
import { IMetricsCollector } from '../../../../src/shared/observability/metrics';

// Mock Firebase Admin
jest.mock('firebase-admin/firestore');
jest.mock('firebase-admin/database');

// Mock dependencies
const mockLogger: IStructuredLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

const mockMetrics: IMetricsCollector = {
  increment: jest.fn(),
  histogram: jest.fn(),
  gauge: jest.fn()
};

const mockFirestore = {
  collection: jest.fn(),
  runTransaction: jest.fn()
};

const mockDatabase = {
  ref: jest.fn()
};

const mockTemplateService = {
  getTemplate: jest.fn(),
  renderTemplate: jest.fn()
};

const mockDeliveryService = {
  deliverNotification: jest.fn()
};

// Mock Firestore methods
const mockDoc = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  id: 'test-id'
};

const mockCollection = {
  doc: jest.fn(() => mockDoc),
  where: jest.fn(() => ({
    orderBy: jest.fn(() => ({
      limit: jest.fn(() => ({
        get: jest.fn()
      })),
      get: jest.fn()
    })),
    get: jest.fn()
  })),
  add: jest.fn()
};

const mockRef = {
  set: jest.fn(),
  update: jest.fn(),
  remove: jest.fn()
};

describe('NotificationService', () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockFirestore.collection.mockReturnValue(mockCollection);
    mockDatabase.ref.mockReturnValue(mockRef);

    notificationService = new NotificationService(
      mockFirestore as any,
      mockDatabase as any,
      mockLogger,
      mockMetrics,
      mockTemplateService as any,
      mockDeliveryService as any
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('sendNotification', () => {
    const mockNotificationRequest: NotificationRequest = {
      userId: 'test-user-id',
      type: NotificationType.LOW_BALANCE,
      title: 'Low Balance Alert',
      message: 'Your credit balance is running low',
      channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
      priority: NotificationPriority.HIGH
    };

    it('should send notification successfully', async () => {
      // Mock user exists
      mockDoc.get.mockResolvedValueOnce({ exists: true });
      
      // Mock preferences
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          userId: 'test-user-id',
          channels: {
            email: {
              enabled: true,
              types: [NotificationType.LOW_BALANCE],
              minPriority: NotificationPriority.NORMAL
            },
            push: {
              enabled: true,
              types: [NotificationType.LOW_BALANCE],
              minPriority: NotificationPriority.NORMAL
            }
          },
          quietHours: { enabled: false }
        })
      });

      // Mock notification creation
      mockDoc.set.mockResolvedValueOnce(undefined);
      mockDeliveryService.deliverNotification.mockResolvedValueOnce(undefined);
      mockRef.set.mockResolvedValueOnce(undefined);

      const result = await notificationService.sendNotification(mockNotificationRequest);

      expect(result).toBeDefined();
      expect(result.userId).toBe(mockNotificationRequest.userId);
      expect(result.type).toBe(mockNotificationRequest.type);
      expect(result.status).toBe(NotificationStatus.PENDING);
      expect(mockDeliveryService.deliverNotification).toHaveBeenCalledWith(result);
      expect(mockMetrics.increment).toHaveBeenCalledWith('notifications.sent', expect.any(Object));
    });

    it('should throw error for invalid request', async () => {
      const invalidRequest = {
        userId: '',
        type: NotificationType.LOW_BALANCE,
        title: '',
        message: ''
      } as NotificationRequest;

      await expect(notificationService.sendNotification(invalidRequest))
        .rejects.toThrow(NotificationError);
    });

    it('should throw error for non-existent user', async () => {
      mockDoc.get.mockResolvedValueOnce({ exists: false });

      await expect(notificationService.sendNotification(mockNotificationRequest))
        .rejects.toThrow(NotificationError);
    });

    it('should handle quiet hours by scheduling notification', async () => {
      // Mock user exists
      mockDoc.get.mockResolvedValueOnce({ exists: true });
      
      // Mock preferences with quiet hours enabled
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          userId: 'test-user-id',
          channels: {
            email: {
              enabled: true,
              types: [NotificationType.LOW_BALANCE],
              minPriority: NotificationPriority.NORMAL
            }
          },
          quietHours: {
            enabled: true,
            startTime: '22:00',
            endTime: '08:00',
            timezone: 'UTC',
            exceptions: []
          }
        })
      });

      // Mock current time to be in quiet hours
      const originalDate = Date;
      const mockDate = new Date('2023-01-01T23:00:00Z');
      global.Date = jest.fn(() => mockDate) as any;
      global.Date.now = jest.fn(() => mockDate.getTime());

      mockDoc.set.mockResolvedValueOnce(undefined);

      const result = await notificationService.sendNotification(mockNotificationRequest);

      expect(result.status).toBe(NotificationStatus.SCHEDULED);
      expect(result.scheduledAt).toBeDefined();

      // Restore Date
      global.Date = originalDate;
    });
  });

  describe('getUserNotifications', () => {
    it('should retrieve user notifications with filters', async () => {
      const mockNotifications = [
        {
          id: 'notif-1',
          userId: 'test-user-id',
          type: NotificationType.LOW_BALANCE,
          title: 'Test Notification',
          message: 'Test message',
          status: NotificationStatus.SENT,
          createdAt: new Date()
        }
      ];

      const mockSnapshot = {
        docs: mockNotifications.map(notif => ({
          id: notif.id,
          data: () => notif
        }))
      };

      mockCollection.where().orderBy().limit().get.mockResolvedValueOnce(mockSnapshot);

      const options = {
        limit: 10,
        types: [NotificationType.LOW_BALANCE],
        unreadOnly: true
      };

      const result = await notificationService.getUserNotifications('test-user-id', options);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('notif-1');
      expect(result[0].type).toBe(NotificationType.LOW_BALANCE);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read successfully', async () => {
      const mockNotification = {
        exists: true,
        data: () => ({
          userId: 'test-user-id',
          status: NotificationStatus.SENT
        })
      };

      mockDoc.get.mockResolvedValueOnce(mockNotification);
      mockDoc.update.mockResolvedValueOnce(undefined);
      mockRef.update.mockResolvedValueOnce(undefined);

      const result = await notificationService.markAsRead('notif-1', 'test-user-id');

      expect(result).toBe(true);
      expect(mockDoc.update).toHaveBeenCalledWith({
        status: NotificationStatus.READ,
        readAt: expect.any(Date)
      });
      expect(mockMetrics.increment).toHaveBeenCalledWith('notifications.read', expect.any(Object));
    });

    it('should return false for non-existent notification', async () => {
      mockDoc.get.mockResolvedValueOnce({ exists: false });

      const result = await notificationService.markAsRead('notif-1', 'test-user-id');

      expect(result).toBe(false);
    });

    it('should return false for unauthorized user', async () => {
      const mockNotification = {
        exists: true,
        data: () => ({
          userId: 'other-user-id',
          status: NotificationStatus.SENT
        })
      };

      mockDoc.get.mockResolvedValueOnce(mockNotification);

      const result = await notificationService.markAsRead('notif-1', 'test-user-id');

      expect(result).toBe(false);
    });
  });

  describe('updatePreferences', () => {
    it('should update notification preferences successfully', async () => {
      const currentPreferences = {
        userId: 'test-user-id',
        channels: {
          email: {
            enabled: true,
            types: [NotificationType.LOW_BALANCE],
            minPriority: NotificationPriority.NORMAL
          }
        },
        updatedAt: new Date()
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => currentPreferences
      });

      mockDoc.set.mockResolvedValueOnce(undefined);

      const updates = {
        channels: {
          push: {
            enabled: true,
            types: [NotificationType.TASK_COMPLETED],
            minPriority: NotificationPriority.HIGH
          }
        }
      };

      const result = await notificationService.updatePreferences('test-user-id', updates);

      expect(result.userId).toBe('test-user-id');
      expect(result.channels.push).toEqual(updates.channels.push);
      expect(mockDoc.set).toHaveBeenCalled();
      expect(mockMetrics.increment).toHaveBeenCalledWith('notification_preferences.updated');
    });
  });

  describe('getPreferences', () => {
    it('should return existing preferences', async () => {
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

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockPreferences
      });

      const result = await notificationService.getPreferences('test-user-id');

      expect(result).toEqual(mockPreferences);
    });

    it('should return default preferences for new user', async () => {
      mockDoc.get.mockResolvedValueOnce({ exists: false });

      const result = await notificationService.getPreferences('test-user-id');

      expect(result.userId).toBe('test-user-id');
      expect(result.channels.email.enabled).toBe(true);
      expect(result.channels.push.enabled).toBe(true);
    });
  });

  describe('scheduleNotification', () => {
    it('should schedule notification for future delivery', async () => {
      const scheduledAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      
      // Mock user exists
      mockDoc.get.mockResolvedValueOnce({ exists: true });
      
      // Mock preferences
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          userId: 'test-user-id',
          channels: {
            email: {
              enabled: true,
              types: [NotificationType.LOW_BALANCE],
              minPriority: NotificationPriority.NORMAL
            }
          }
        })
      });

      mockDoc.set.mockResolvedValueOnce(undefined);

      const mockNotificationRequest: NotificationRequest = {
        userId: 'test-user-id',
        type: NotificationType.LOW_BALANCE,
        title: 'Scheduled Notification',
        message: 'This is a scheduled notification'
      };

      const result = await notificationService.scheduleNotification(mockNotificationRequest, scheduledAt);

      expect(result.status).toBe(NotificationStatus.SCHEDULED);
      expect(result.scheduledAt).toEqual(scheduledAt);
      expect(mockDoc.set).toHaveBeenCalledTimes(2); // Once for notification, once for scheduled_notifications
    });
  });

  describe('cancelNotification', () => {
    it('should cancel pending notification successfully', async () => {
      const mockNotification = {
        exists: true,
        data: () => ({
          status: NotificationStatus.PENDING
        })
      };

      mockDoc.get.mockResolvedValueOnce(mockNotification);
      mockDoc.update.mockResolvedValueOnce(undefined);

      const result = await notificationService.cancelNotification('notif-1');

      expect(result).toBe(true);
      expect(mockDoc.update).toHaveBeenCalledWith({
        status: NotificationStatus.FAILED,
        updatedAt: expect.any(Date)
      });
    });

    it('should not cancel already sent notification', async () => {
      const mockNotification = {
        exists: true,
        data: () => ({
          status: NotificationStatus.SENT
        })
      };

      mockDoc.get.mockResolvedValueOnce(mockNotification);

      const result = await notificationService.cancelNotification('notif-1');

      expect(result).toBe(false);
      expect(mockDoc.update).not.toHaveBeenCalled();
    });
  });
});