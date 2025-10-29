/**
 * Notification Service
 * Core service for managing user notifications and alerts
 */

import { 
  INotificationService,
  NotificationRequest,
  Notification,
  NotificationPreferences,
  NotificationAnalytics,
  GetNotificationsOptions,
  AnalyticsOptions,
  NotificationType,
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
  DeliveryStatus,
  NotificationError,
  NotificationErrorCode,
  NotificationFrequency
} from '../types';
import { IStructuredLogger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';
import { Firestore } from 'firebase-admin/firestore';
import { Database } from 'firebase-admin/database';

export class NotificationService implements INotificationService {
  private firestore: Firestore;
  private realtimeDb: Database;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  private templateService: INotificationTemplateService;
  private deliveryService: INotificationDeliveryService;

  constructor(
    firestore: Firestore,
    realtimeDb: Database,
    logger: IStructuredLogger,
    metrics: IMetricsCollector,
    templateService: INotificationTemplateService,
    deliveryService: INotificationDeliveryService
  ) {
    this.firestore = firestore;
    this.realtimeDb = realtimeDb;
    this.logger = logger;
    this.metrics = metrics;
    this.templateService = templateService;
    this.deliveryService = deliveryService;
  }

  async sendNotification(request: NotificationRequest): Promise<Notification> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Sending notification', { 
        userId: request.userId, 
        type: request.type,
        channels: request.channels 
      });

      // Validate request
      await this.validateNotificationRequest(request);

      // Get user preferences
      const preferences = await this.getPreferences(request.userId);
      
      // Apply user preferences to determine channels
      const effectiveChannels = this.applyUserPreferences(request, preferences);
      
      if (effectiveChannels.length === 0) {
        throw new NotificationError(
          'No enabled channels for notification type',
          NotificationErrorCode.CHANNEL_DISABLED
        );
      }

      // Check quiet hours
      if (this.isInQuietHours(preferences) && !this.bypassesQuietHours(request.type, preferences)) {
        // Schedule for after quiet hours
        const scheduledAt = this.calculateNextDeliveryTime(preferences);
        return this.scheduleNotification(request, scheduledAt);
      }

      // Create notification record
      const notification = await this.createNotification(request, effectiveChannels);

      // Send through delivery service
      await this.deliveryService.deliverNotification(notification);

      // Update real-time database for immediate UI updates
      await this.updateRealtimeNotification(notification);

      // Record metrics
      this.metrics.increment('notifications.sent', {
        type: request.type,
        priority: request.priority || NotificationPriority.NORMAL
      });

      this.logger.info('Notification sent successfully', { 
        notificationId: notification.id,
        userId: request.userId,
        type: request.type,
        duration: Date.now() - startTime
      });

      return notification;

    } catch (error) {
      this.logger.error('Failed to send notification', error, {
        userId: request.userId,
        type: request.type,
        duration: Date.now() - startTime
      });

      this.metrics.increment('notifications.failed', {
        type: request.type,
        error: error instanceof Error ? error.message : 'unknown'
      });

      throw error;
    }
  }

  async scheduleNotification(request: NotificationRequest, scheduledAt: Date): Promise<Notification> {
    try {
      this.logger.info('Scheduling notification', { 
        userId: request.userId, 
        type: request.type,
        scheduledAt: scheduledAt.toISOString()
      });

      // Validate request
      await this.validateNotificationRequest(request);

      // Get user preferences for channel determination
      const preferences = await this.getPreferences(request.userId);
      const effectiveChannels = this.applyUserPreferences(request, preferences);

      // Create scheduled notification record
      const notification = await this.createNotification(request, effectiveChannels, scheduledAt);

      // Store in scheduled notifications collection for processing
      await this.firestore.collection('scheduled_notifications').doc(notification.id).set({
        ...notification,
        scheduledAt: scheduledAt,
        processed: false
      });

      this.metrics.increment('notifications.scheduled', {
        type: request.type
      });

      return notification;

    } catch (error) {
      this.logger.error('Failed to schedule notification', error, {
        userId: request.userId,
        type: request.type,
        scheduledAt: scheduledAt.toISOString()
      });

      throw error;
    }
  }

  async cancelNotification(notificationId: string): Promise<boolean> {
    try {
      const notificationRef = this.firestore.collection('notifications').doc(notificationId);
      const notification = await notificationRef.get();

      if (!notification.exists) {
        return false;
      }

      const notificationData = notification.data() as Notification;

      // Can only cancel pending or scheduled notifications
      if (![NotificationStatus.PENDING, NotificationStatus.SCHEDULED].includes(notificationData.status)) {
        return false;
      }

      // Update status to cancelled
      await notificationRef.update({
        status: NotificationStatus.FAILED,
        updatedAt: new Date()
      });

      // Remove from scheduled notifications if applicable
      if (notificationData.status === NotificationStatus.SCHEDULED) {
        await this.firestore.collection('scheduled_notifications').doc(notificationId).delete();
      }

      this.logger.info('Notification cancelled', { notificationId });
      this.metrics.increment('notifications.cancelled');

      return true;

    } catch (error) {
      this.logger.error('Failed to cancel notification', error, { notificationId });
      return false;
    }
  }

  async sendBulkNotifications(requests: NotificationRequest[]): Promise<Notification[]> {
    const results: Notification[] = [];
    const batchSize = 10; // Process in batches to avoid overwhelming the system

    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchPromises = batch.map(request => 
        this.sendNotification(request).catch(error => {
          this.logger.error('Bulk notification failed', error, { 
            userId: request.userId, 
            type: request.type 
          });
          return null;
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(result => result !== null) as Notification[]);
    }

    this.metrics.increment('notifications.bulk_sent', {
      total: requests.length,
      successful: results.length
    });

    return results;
  }

  async getUserNotifications(userId: string, options: GetNotificationsOptions = {}): Promise<Notification[]> {
    try {
      let query = this.firestore.collection('notifications')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc');

      // Apply filters
      if (options.types && options.types.length > 0) {
        query = query.where('type', 'in', options.types);
      }

      if (options.status && options.status.length > 0) {
        query = query.where('status', 'in', options.status);
      }

      if (options.unreadOnly) {
        query = query.where('readAt', '==', null);
      }

      if (options.since) {
        query = query.where('createdAt', '>=', options.since);
      }

      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.offset(options.offset);
      }

      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));

    } catch (error) {
      this.logger.error('Failed to get user notifications', error, { userId, options });
      throw error;
    }
  }

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      const notificationRef = this.firestore.collection('notifications').doc(notificationId);
      const notification = await notificationRef.get();

      if (!notification.exists) {
        return false;
      }

      const notificationData = notification.data() as Notification;
      
      // Verify ownership
      if (notificationData.userId !== userId) {
        return false;
      }

      // Update read status
      await notificationRef.update({
        status: NotificationStatus.READ,
        readAt: new Date()
      });

      // Update real-time database
      await this.realtimeDb.ref(`notifications/${userId}/${notificationId}`).update({
        status: NotificationStatus.READ,
        readAt: new Date().toISOString()
      });

      this.metrics.increment('notifications.read', {
        type: notificationData.type
      });

      return true;

    } catch (error) {
      this.logger.error('Failed to mark notification as read', error, { notificationId, userId });
      return false;
    }
  }

  async markAllAsRead(userId: string): Promise<number> {
    try {
      const unreadQuery = this.firestore.collection('notifications')
        .where('userId', '==', userId)
        .where('readAt', '==', null);

      const snapshot = await unreadQuery.get();
      const batch = this.firestore.batch();
      
      snapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          status: NotificationStatus.READ,
          readAt: new Date()
        });
      });

      await batch.commit();

      // Update real-time database
      const updates: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        updates[`notifications/${userId}/${doc.id}/status`] = NotificationStatus.READ;
        updates[`notifications/${userId}/${doc.id}/readAt`] = new Date().toISOString();
      });

      if (Object.keys(updates).length > 0) {
        await this.realtimeDb.ref().update(updates);
      }

      this.metrics.increment('notifications.mark_all_read', {
        count: snapshot.size
      });

      return snapshot.size;

    } catch (error) {
      this.logger.error('Failed to mark all notifications as read', error, { userId });
      throw error;
    }
  }

  async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    try {
      const notificationRef = this.firestore.collection('notifications').doc(notificationId);
      const notification = await notificationRef.get();

      if (!notification.exists) {
        return false;
      }

      const notificationData = notification.data() as Notification;
      
      // Verify ownership
      if (notificationData.userId !== userId) {
        return false;
      }

      // Delete from Firestore
      await notificationRef.delete();

      // Delete from real-time database
      await this.realtimeDb.ref(`notifications/${userId}/${notificationId}`).remove();

      this.metrics.increment('notifications.deleted');

      return true;

    } catch (error) {
      this.logger.error('Failed to delete notification', error, { notificationId, userId });
      return false;
    }
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      const preferencesRef = this.firestore.collection('notification_preferences').doc(userId);
      const preferences = await preferencesRef.get();

      if (preferences.exists) {
        return preferences.data() as NotificationPreferences;
      }

      // Return default preferences
      return this.getDefaultPreferences(userId);

    } catch (error) {
      this.logger.error('Failed to get notification preferences', error, { userId });
      return this.getDefaultPreferences(userId);
    }
  }

  async updatePreferences(userId: string, preferences: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    try {
      const preferencesRef = this.firestore.collection('notification_preferences').doc(userId);
      const currentPreferences = await this.getPreferences(userId);

      const updatedPreferences: NotificationPreferences = {
        ...currentPreferences,
        ...preferences,
        userId,
        updatedAt: new Date()
      };

      await preferencesRef.set(updatedPreferences);

      this.logger.info('Notification preferences updated', { userId });
      this.metrics.increment('notification_preferences.updated');

      return updatedPreferences;

    } catch (error) {
      this.logger.error('Failed to update notification preferences', error, { userId });
      throw error;
    }
  }

  async getAnalytics(options: AnalyticsOptions): Promise<NotificationAnalytics> {
    try {
      let query = this.firestore.collection('notifications')
        .where('createdAt', '>=', options.timeRange.start)
        .where('createdAt', '<=', options.timeRange.end);

      if (options.userId) {
        query = query.where('userId', '==', options.userId);
      }

      if (options.type) {
        query = query.where('type', '==', options.type);
      }

      const snapshot = await query.get();
      const notifications = snapshot.docs.map(doc => doc.data() as Notification);

      // Calculate metrics
      const metrics = {
        sent: notifications.length,
        delivered: notifications.filter(n => n.status === NotificationStatus.DELIVERED).length,
        read: notifications.filter(n => n.status === NotificationStatus.READ).length,
        failed: notifications.filter(n => n.status === NotificationStatus.FAILED).length,
        clickThrough: 0, // Would need additional tracking
        unsubscribed: 0 // Would need additional tracking
      };

      const deliveryRate = metrics.sent > 0 ? (metrics.delivered / metrics.sent) * 100 : 0;
      const readRate = metrics.delivered > 0 ? (metrics.read / metrics.delivered) * 100 : 0;
      const clickThroughRate = 0; // Would need additional tracking

      return {
        userId: options.userId,
        type: options.type,
        channel: options.channel,
        timeRange: options.timeRange,
        metrics,
        deliveryRate,
        readRate,
        clickThroughRate
      };

    } catch (error) {
      this.logger.error('Failed to get notification analytics', error, { options });
      throw error;
    }
  }

  // Private helper methods
  private async validateNotificationRequest(request: NotificationRequest): Promise<void> {
    if (!request.userId || !request.type || !request.title || !request.message) {
      throw new NotificationError(
        'Missing required notification fields',
        NotificationErrorCode.INVALID_REQUEST
      );
    }

    // Validate user exists
    const userRef = this.firestore.collection('users').doc(request.userId);
    const user = await userRef.get();
    
    if (!user.exists) {
      throw new NotificationError(
        'User not found',
        NotificationErrorCode.USER_NOT_FOUND
      );
    }
  }

  private applyUserPreferences(request: NotificationRequest, preferences: NotificationPreferences): NotificationChannel[] {
    const requestChannels = request.channels || Object.values(NotificationChannel);
    const enabledChannels: NotificationChannel[] = [];

    for (const channel of requestChannels) {
      const channelSettings = preferences.channels[channel];
      
      if (channelSettings?.enabled && 
          channelSettings.types.includes(request.type) &&
          this.meetsPriorityRequirement(request.priority || NotificationPriority.NORMAL, channelSettings.minPriority)) {
        enabledChannels.push(channel);
      }
    }

    return enabledChannels;
  }

  private meetsPriorityRequirement(requestPriority: NotificationPriority, minPriority: NotificationPriority): boolean {
    const priorityOrder = {
      [NotificationPriority.LOW]: 0,
      [NotificationPriority.NORMAL]: 1,
      [NotificationPriority.HIGH]: 2,
      [NotificationPriority.URGENT]: 3
    };

    return priorityOrder[requestPriority] >= priorityOrder[minPriority];
  }

  private isInQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quietHours?.enabled) {
      return false;
    }

    const now = new Date();
    const timezone = preferences.quietHours.timezone || 'UTC';
    
    // This is a simplified implementation - in production, you'd use a proper timezone library
    const currentTime = now.toLocaleTimeString('en-US', { 
      timeZone: timezone, 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const startTime = preferences.quietHours.startTime;
    const endTime = preferences.quietHours.endTime;

    return currentTime >= startTime && currentTime <= endTime;
  }

  private bypassesQuietHours(type: NotificationType, preferences: NotificationPreferences): boolean {
    return preferences.quietHours?.exceptions?.includes(type) || false;
  }

  private calculateNextDeliveryTime(preferences: NotificationPreferences): Date {
    if (!preferences.quietHours?.enabled) {
      return new Date();
    }

    const now = new Date();
    const endTime = preferences.quietHours.endTime;
    const [hours, minutes] = endTime.split(':').map(Number);
    
    const nextDelivery = new Date(now);
    nextDelivery.setHours(hours, minutes, 0, 0);
    
    // If the end time is today but already passed, schedule for tomorrow
    if (nextDelivery <= now) {
      nextDelivery.setDate(nextDelivery.getDate() + 1);
    }

    return nextDelivery;
  }

  private async createNotification(
    request: NotificationRequest, 
    channels: NotificationChannel[], 
    scheduledAt?: Date
  ): Promise<Notification> {
    const notification: Notification = {
      id: this.firestore.collection('notifications').doc().id,
      userId: request.userId,
      type: request.type,
      title: request.title,
      message: request.message,
      data: request.data,
      channels,
      priority: request.priority || NotificationPriority.NORMAL,
      status: scheduledAt ? NotificationStatus.SCHEDULED : NotificationStatus.PENDING,
      createdAt: new Date(),
      scheduledAt,
      expiresAt: request.expiresAt,
      deliveryResults: []
    };

    // Save to Firestore
    await this.firestore.collection('notifications').doc(notification.id).set(notification);

    return notification;
  }

  private async updateRealtimeNotification(notification: Notification): Promise<void> {
    const realtimeData = {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      status: notification.status,
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt?.toISOString() || null
    };

    await this.realtimeDb.ref(`notifications/${notification.userId}/${notification.id}`).set(realtimeData);
  }

  private getDefaultPreferences(userId: string): NotificationPreferences {
    return {
      userId,
      channels: {
        email: {
          enabled: true,
          types: Object.values(NotificationType),
          minPriority: NotificationPriority.NORMAL
        },
        push: {
          enabled: true,
          types: [
            NotificationType.LOW_BALANCE,
            NotificationType.TASK_COMPLETED,
            NotificationType.PAYMENT_SUCCESS,
            NotificationType.SECURITY_ALERT
          ],
          minPriority: NotificationPriority.NORMAL
        },
        inApp: {
          enabled: true,
          types: Object.values(NotificationType),
          minPriority: NotificationPriority.LOW
        },
        sms: {
          enabled: false,
          types: [NotificationType.SECURITY_ALERT, NotificationType.ACCOUNT_SUSPENDED],
          minPriority: NotificationPriority.URGENT
        },
        webhook: {
          enabled: false,
          types: [],
          minPriority: NotificationPriority.NORMAL
        }
      },
      types: Object.values(NotificationType).reduce((acc, type) => {
        acc[type] = {
          enabled: true,
          channels: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
          frequency: NotificationFrequency.IMMEDIATE
        };
        return acc;
      }, {} as any),
      quietHours: {
        enabled: false,
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'UTC',
        exceptions: [NotificationType.SECURITY_ALERT, NotificationType.ACCOUNT_SUSPENDED]
      },
      frequency: NotificationFrequency.IMMEDIATE,
      language: 'en',
      timezone: 'UTC',
      updatedAt: new Date()
    };
  }
}

// Additional service interfaces
export interface INotificationTemplateService {
  getTemplate(type: NotificationType, channel: NotificationChannel, language?: string): Promise<any>;
  renderTemplate(template: any, variables: Record<string, any>): Promise<{ subject?: string; title: string; body: string; htmlBody?: string }>;
}

export interface INotificationDeliveryService {
  deliverNotification(notification: Notification): Promise<void>;
}