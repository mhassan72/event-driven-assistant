/**
 * Notification Delivery Service Unit Tests
 * Tests for notification delivery functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  NotificationDeliveryService,
  Notification,
  NotificationChannel,
  NotificationStatus,
  DeliveryStatus,
  NotificationType,
  NotificationPriority
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
  collection: jest.fn()
};

const mockDatabase = {
  ref: jest.fn()
};

const mockTemplateService = {
  getTemplate: jest.fn(),
  renderTemplate: jest.fn()
};

const mockEmailProvider = {
  sendEmail: jest.fn()
};

const mockPushProvider = {
  sendPush: jest.fn()
};

const mockSMSProvider = {
  sendSMS: jest.fn()
};

const mockWebhookProvider = {
  sendWebhook: jest.fn()
};

// Mock Firestore methods
const mockDoc = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn()
};

const mockCollection = {
  doc: jest.fn(() => mockDoc)
};

const mockRef = {
  set: jest.fn(),
  update: jest.fn()
};

describe('NotificationDeliveryService', () => {
  let deliveryService: NotificationDeliveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockFirestore.collection.mockReturnValue(mockCollection);
    mockDatabase.ref.mockReturnValue(mockRef);

    deliveryService = new NotificationDeliveryService(
      mockFirestore as any,
      mockDatabase as any,
      mockLogger,
      mockMetrics,
      mockTemplateService as any,
      mockEmailProvider as any,
      mockPushProvider as any,
      mockSMSProvider as any,
      mockWebhookProvider as any
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('deliverNotification', () => {
    const mockNotification: Notification = {
      id: 'notif-1',
      userId: 'test-user-id',
      type: NotificationType.LOW_BALANCE,
      title: 'Low Balance Alert',
      message: 'Your credit balance is running low',
      channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH],
      priority: NotificationPriority.HIGH,
      status: NotificationStatus.PENDING,
      createdAt: new Date(),
      deliveryResults: []
    };

    it('should deliver notification to all channels successfully', async () => {
      // Mock user contact info
      const mockUserDoc = {
        exists: true,
        data: () => ({
          email: 'test@example.com',
          name: 'Test User',
          pushTokens: ['token1', 'token2']
        })
      };

      mockDoc.get.mockResolvedValueOnce(mockUserDoc);
      mockDoc.get.mockResolvedValueOnce({ exists: false }); // No preferences

      // Mock template service
      mockTemplateService.getTemplate.mockResolvedValue({
        id: 'template-1',
        title: 'Low Balance Alert',
        body: 'Your balance is low'
      });

      mockTemplateService.renderTemplate.mockResolvedValue({
        title: 'Low Balance Alert',
        body: 'Your balance is low',
        subject: 'Low Balance Alert'
      });

      // Mock successful delivery
      mockEmailProvider.sendEmail.mockResolvedValue({
        messageId: 'email-1',
        status: DeliveryStatus.SENT
      });

      mockPushProvider.sendPush.mockResolvedValue({
        messageId: 'push-1',
        status: DeliveryStatus.SENT
      });

      // Mock Firestore updates
      mockDoc.update.mockResolvedValue(undefined);
      mockRef.set.mockResolvedValue(undefined);

      await deliveryService.deliverNotification(mockNotification);

      expect(mockEmailProvider.sendEmail).toHaveBeenCalledWith(
        'test@example.com',
        'Low Balance Alert',
        'Your balance is low',
        undefined
      );

      expect(mockPushProvider.sendPush).toHaveBeenCalledWith(
        'token1',
        'Low Balance Alert',
        'Your balance is low',
        undefined
      );

      expect(mockDoc.update).toHaveBeenCalledWith({
        status: NotificationStatus.SENT,
        deliveryResults: expect.arrayContaining([
          expect.objectContaining({
            channel: NotificationChannel.EMAIL,
            status: DeliveryStatus.SENT
          }),
          expect.objectContaining({
            channel: NotificationChannel.PUSH,
            status: DeliveryStatus.SENT
          })
        ]),
        updatedAt: expect.any(Date),
        sentAt: expect.any(Date)
      });

      expect(mockMetrics.increment).toHaveBeenCalledWith('notification_delivery.completed', expect.any(Object));
    });

    it('should handle delivery failures gracefully', async () => {
      // Mock user contact info
      const mockUserDoc = {
        exists: true,
        data: () => ({
          email: 'test@example.com',
          name: 'Test User'
        })
      };

      mockDoc.get.mockResolvedValueOnce(mockUserDoc);
      mockDoc.get.mockResolvedValueOnce({ exists: false });

      // Mock template service
      mockTemplateService.getTemplate.mockResolvedValue({
        id: 'template-1',
        title: 'Low Balance Alert',
        body: 'Your balance is low'
      });

      mockTemplateService.renderTemplate.mockResolvedValue({
        title: 'Low Balance Alert',
        body: 'Your balance is low'
      });

      // Mock failed delivery
      mockEmailProvider.sendEmail.mockResolvedValue({
        messageId: 'email-1',
        status: DeliveryStatus.FAILED,
        error: 'SMTP error'
      });

      mockDoc.update.mockResolvedValue(undefined);
      mockRef.set.mockResolvedValue(undefined);

      const singleChannelNotification = {
        ...mockNotification,
        channels: [NotificationChannel.EMAIL]
      };

      await deliveryService.deliverNotification(singleChannelNotification);

      expect(mockDoc.update).toHaveBeenCalledWith({
        status: NotificationStatus.FAILED,
        deliveryResults: expect.arrayContaining([
          expect.objectContaining({
            channel: NotificationChannel.EMAIL,
            status: DeliveryStatus.FAILED,
            error: 'SMTP error'
          })
        ]),
        updatedAt: expect.any(Date)
      });
    });

    it('should handle missing user contact information', async () => {
      // Mock user with no email
      const mockUserDoc = {
        exists: true,
        data: () => ({
          name: 'Test User'
          // No email field
        })
      };

      mockDoc.get.mockResolvedValueOnce(mockUserDoc);
      mockDoc.get.mockResolvedValueOnce({ exists: false });

      mockTemplateService.getTemplate.mockResolvedValue({
        id: 'template-1',
        title: 'Low Balance Alert',
        body: 'Your balance is low'
      });

      mockTemplateService.renderTemplate.mockResolvedValue({
        title: 'Low Balance Alert',
        body: 'Your balance is low'
      });

      mockDoc.update.mockResolvedValue(undefined);
      mockRef.set.mockResolvedValue(undefined);

      const emailNotification = {
        ...mockNotification,
        channels: [NotificationChannel.EMAIL]
      };

      await deliveryService.deliverNotification(emailNotification);

      expect(mockDoc.update).toHaveBeenCalledWith({
        status: NotificationStatus.FAILED,
        deliveryResults: expect.arrayContaining([
          expect.objectContaining({
            channel: NotificationChannel.EMAIL,
            status: DeliveryStatus.FAILED,
            error: 'No email address available'
          })
        ]),
        updatedAt: expect.any(Date)
      });
    });

    it('should deliver in-app notifications via real-time database', async () => {
      // Mock user contact info
      const mockUserDoc = {
        exists: true,
        data: () => ({
          name: 'Test User'
        })
      };

      mockDoc.get.mockResolvedValueOnce(mockUserDoc);
      mockDoc.get.mockResolvedValueOnce({ exists: false });

      mockDoc.update.mockResolvedValue(undefined);
      mockRef.set.mockResolvedValue(undefined);

      const inAppNotification = {
        ...mockNotification,
        channels: [NotificationChannel.IN_APP]
      };

      await deliveryService.deliverNotification(inAppNotification);

      expect(mockRef.set).toHaveBeenCalledWith({
        id: mockNotification.id,
        type: mockNotification.type,
        title: mockNotification.title,
        message: mockNotification.message,
        data: mockNotification.data,
        priority: mockNotification.priority,
        createdAt: mockNotification.createdAt.toISOString(),
        status: 'unread'
      });

      expect(mockDoc.update).toHaveBeenCalledWith({
        status: NotificationStatus.SENT,
        deliveryResults: expect.arrayContaining([
          expect.objectContaining({
            channel: NotificationChannel.IN_APP,
            status: DeliveryStatus.DELIVERED
          })
        ]),
        updatedAt: expect.any(Date),
        sentAt: expect.any(Date)
      });
    });
  });

  describe('retryFailedDelivery', () => {
    it('should retry failed delivery successfully', async () => {
      const mockNotification = {
        exists: true,
        data: () => ({
          id: 'notif-1',
          userId: 'test-user-id',
          type: NotificationType.LOW_BALANCE,
          deliveryResults: [
            {
              channel: NotificationChannel.EMAIL,
              status: DeliveryStatus.FAILED,
              error: 'Temporary failure'
            }
          ]
        })
      };

      const mockUserDoc = {
        exists: true,
        data: () => ({
          email: 'test@example.com',
          name: 'Test User'
        })
      };

      mockDoc.get.mockResolvedValueOnce(mockNotification);
      mockDoc.get.mockResolvedValueOnce(mockUserDoc);
      mockDoc.get.mockResolvedValueOnce({ exists: false });

      mockTemplateService.getTemplate.mockResolvedValue({
        id: 'template-1',
        title: 'Low Balance Alert',
        body: 'Your balance is low'
      });

      mockTemplateService.renderTemplate.mockResolvedValue({
        title: 'Low Balance Alert',
        body: 'Your balance is low'
      });

      // Mock successful retry
      mockEmailProvider.sendEmail.mockResolvedValue({
        messageId: 'email-retry-1',
        status: DeliveryStatus.SENT
      });

      mockDoc.update.mockResolvedValue(undefined);

      const result = await deliveryService.retryFailedDelivery('notif-1', NotificationChannel.EMAIL);

      expect(result).toBe(true);
      expect(mockEmailProvider.sendEmail).toHaveBeenCalled();
      expect(mockDoc.update).toHaveBeenCalledWith({
        deliveryResults: expect.arrayContaining([
          expect.objectContaining({
            channel: NotificationChannel.EMAIL,
            status: DeliveryStatus.SENT
          })
        ]),
        updatedAt: expect.any(Date)
      });

      expect(mockMetrics.increment).toHaveBeenCalledWith('notification_delivery.retried', {
        channel: NotificationChannel.EMAIL,
        success: true
      });
    });

    it('should return false for non-existent notification', async () => {
      mockDoc.get.mockResolvedValueOnce({ exists: false });

      const result = await deliveryService.retryFailedDelivery('notif-1', NotificationChannel.EMAIL);

      expect(result).toBe(false);
    });

    it('should return false for channel that was not failed', async () => {
      const mockNotification = {
        exists: true,
        data: () => ({
          deliveryResults: [
            {
              channel: NotificationChannel.EMAIL,
              status: DeliveryStatus.SENT // Not failed
            }
          ]
        })
      };

      mockDoc.get.mockResolvedValueOnce(mockNotification);

      const result = await deliveryService.retryFailedDelivery('notif-1', NotificationChannel.EMAIL);

      expect(result).toBe(false);
    });
  });
});