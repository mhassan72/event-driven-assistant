/**
 * Notification Delivery Service
 * Handles the actual delivery of notifications through various channels
 */

import {
  Notification,
  NotificationChannel,
  NotificationStatus,
  DeliveryStatus,
  NotificationDeliveryResult,
  IEmailProvider,
  IPushProvider,
  ISMSProvider,
  IWebhookProvider,
  NotificationError,
  NotificationErrorCode
} from '../types';
import { INotificationTemplateService } from './notification-service';
import { IStructuredLogger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';
import { Firestore } from 'firebase-admin/firestore';
import { Database } from 'firebase-admin/database';

export interface INotificationDeliveryService {
  deliverNotification(notification: Notification): Promise<void>;
  retryFailedDelivery(notificationId: string, channel: NotificationChannel): Promise<boolean>;
}

export class NotificationDeliveryService implements INotificationDeliveryService {
  private firestore: Firestore;
  private realtimeDb: Database;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  private templateService: INotificationTemplateService;
  private emailProvider: IEmailProvider;
  private pushProvider: IPushProvider;
  private smsProvider: ISMSProvider;
  private webhookProvider: IWebhookProvider;

  constructor(
    firestore: Firestore,
    realtimeDb: Database,
    logger: IStructuredLogger,
    metrics: IMetricsCollector,
    templateService: INotificationTemplateService,
    emailProvider: IEmailProvider,
    pushProvider: IPushProvider,
    smsProvider: ISMSProvider,
    webhookProvider: IWebhookProvider
  ) {
    this.firestore = firestore;
    this.realtimeDb = realtimeDb;
    this.logger = logger;
    this.metrics = metrics;
    this.templateService = templateService;
    this.emailProvider = emailProvider;
    this.pushProvider = pushProvider;
    this.smsProvider = smsProvider;
    this.webhookProvider = webhookProvider;
  }

  async deliverNotification(notification: Notification): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting notification delivery', {
        notificationId: notification.id,
        userId: notification.userId,
        type: notification.type,
        channels: notification.channels
      });

      // Update status to sending
      await this.updateNotificationStatus(notification.id, NotificationStatus.SENDING);

      // Get user contact information
      const userContact = await this.getUserContactInfo(notification.userId);

      // Deliver to each channel in parallel
      const deliveryPromises = notification.channels.map(channel =>
        this.deliverToChannel(notification, channel, userContact)
      );

      const deliveryResults = await Promise.allSettled(deliveryPromises);

      // Process results
      const results: NotificationDeliveryResult[] = [];
      let hasSuccessfulDelivery = false;

      for (let i = 0; i < deliveryResults.length; i++) {
        const result = deliveryResults[i];
        const channel = notification.channels[i];

        if (result.status === 'fulfilled') {
          results.push(result.value);
          if (result.value.status === DeliveryStatus.SENT || result.value.status === DeliveryStatus.DELIVERED) {
            hasSuccessfulDelivery = true;
          }
        } else {
          results.push({
            channel,
            status: DeliveryStatus.FAILED,
            error: result.reason?.message || 'Unknown delivery error'
          });
        }
      }

      // Update notification with delivery results
      const finalStatus = hasSuccessfulDelivery ? NotificationStatus.SENT : NotificationStatus.FAILED;
      await this.updateNotificationWithResults(notification.id, finalStatus, results);

      // Update real-time database
      await this.updateRealtimeDeliveryStatus(notification.userId, notification.id, finalStatus);

      // Record metrics
      this.metrics.increment('notification_delivery.completed', {
        type: notification.type,
        status: finalStatus,
        channelCount: notification.channels.length,
        successfulChannels: results.filter(r => r.status === DeliveryStatus.SENT).length
      });

      this.logger.info('Notification delivery completed', {
        notificationId: notification.id,
        status: finalStatus,
        duration: Date.now() - startTime,
        results: results.map(r => ({ channel: r.channel, status: r.status }))
      });

    } catch (error) {
      this.logger.error('Notification delivery failed', error, {
        notificationId: notification.id,
        duration: Date.now() - startTime
      });

      await this.updateNotificationStatus(notification.id, NotificationStatus.FAILED);
      
      this.metrics.increment('notification_delivery.failed', {
        type: notification.type,
        error: error instanceof Error ? error.message : 'unknown'
      });

      throw error;
    }
  }

  async retryFailedDelivery(notificationId: string, channel: NotificationChannel): Promise<boolean> {
    try {
      const notificationRef = this.firestore.collection('notifications').doc(notificationId);
      const notificationDoc = await notificationRef.get();

      if (!notificationDoc.exists) {
        return false;
      }

      const notification = notificationDoc.data() as Notification;
      
      // Check if retry is allowed (not too many attempts)
      const channelResult = notification.deliveryResults.find(r => r.channel === channel);
      if (!channelResult || channelResult.status !== DeliveryStatus.FAILED) {
        return false;
      }

      // Get user contact info
      const userContact = await this.getUserContactInfo(notification.userId);

      // Retry delivery to the specific channel
      const result = await this.deliverToChannel(notification, channel, userContact);

      // Update the specific channel result
      const updatedResults = notification.deliveryResults.map(r => 
        r.channel === channel ? result : r
      );

      await notificationRef.update({
        deliveryResults: updatedResults,
        updatedAt: new Date()
      });

      this.metrics.increment('notification_delivery.retried', {
        channel,
        success: result.status === DeliveryStatus.SENT
      });

      return result.status === DeliveryStatus.SENT;

    } catch (error) {
      this.logger.error('Failed to retry notification delivery', error, { notificationId, channel });
      return false;
    }
  }

  private async deliverToChannel(
    notification: Notification, 
    channel: NotificationChannel, 
    userContact: UserContactInfo
  ): Promise<NotificationDeliveryResult> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('Delivering to channel', {
        notificationId: notification.id,
        channel,
        type: notification.type
      });

      switch (channel) {
        case NotificationChannel.EMAIL:
          return await this.deliverEmail(notification, userContact);
        
        case NotificationChannel.PUSH:
          return await this.deliverPush(notification, userContact);
        
        case NotificationChannel.SMS:
          return await this.deliverSMS(notification, userContact);
        
        case NotificationChannel.WEBHOOK:
          return await this.deliverWebhook(notification, userContact);
        
        case NotificationChannel.IN_APP:
          return await this.deliverInApp(notification);
        
        default:
          throw new NotificationError(
            `Unsupported notification channel: ${channel}`,
            NotificationErrorCode.INVALID_REQUEST
          );
      }

    } catch (error) {
      this.logger.error('Channel delivery failed', error, {
        notificationId: notification.id,
        channel,
        duration: Date.now() - startTime
      });

      return {
        channel,
        status: DeliveryStatus.FAILED,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async deliverEmail(notification: Notification, userContact: UserContactInfo): Promise<NotificationDeliveryResult> {
    if (!userContact.email) {
      return {
        channel: NotificationChannel.EMAIL,
        status: DeliveryStatus.FAILED,
        error: 'No email address available'
      };
    }

    // Get and render template
    const template = await this.templateService.getTemplate(
      notification.type, 
      NotificationChannel.EMAIL, 
      userContact.language
    );
    
    const rendered = await this.templateService.renderTemplate(template, {
      ...notification.data,
      title: notification.title,
      message: notification.message,
      userName: userContact.name
    });

    // Send email
    const result = await this.emailProvider.sendEmail(
      userContact.email,
      rendered.subject || notification.title,
      rendered.body,
      rendered.htmlBody
    );

    return {
      channel: NotificationChannel.EMAIL,
      status: result.status,
      sentAt: new Date(),
      error: result.error
    };
  }

  private async deliverPush(notification: Notification, userContact: UserContactInfo): Promise<NotificationDeliveryResult> {
    if (!userContact.pushTokens || userContact.pushTokens.length === 0) {
      return {
        channel: NotificationChannel.PUSH,
        status: DeliveryStatus.FAILED,
        error: 'No push tokens available'
      };
    }

    // Get and render template
    const template = await this.templateService.getTemplate(
      notification.type, 
      NotificationChannel.PUSH, 
      userContact.language
    );
    
    const rendered = await this.templateService.renderTemplate(template, {
      ...notification.data,
      title: notification.title,
      message: notification.message,
      userName: userContact.name
    });

    // Send to all push tokens (user might have multiple devices)
    const pushPromises = userContact.pushTokens.map(token =>
      this.pushProvider.sendPush(token, rendered.title, rendered.body, notification.data)
    );

    const pushResults = await Promise.allSettled(pushPromises);
    const hasSuccess = pushResults.some(r => r.status === 'fulfilled' && r.value.status === DeliveryStatus.SENT);

    return {
      channel: NotificationChannel.PUSH,
      status: hasSuccess ? DeliveryStatus.SENT : DeliveryStatus.FAILED,
      sentAt: new Date(),
      error: hasSuccess ? undefined : 'All push deliveries failed'
    };
  }

  private async deliverSMS(notification: Notification, userContact: UserContactInfo): Promise<NotificationDeliveryResult> {
    if (!userContact.phoneNumber) {
      return {
        channel: NotificationChannel.SMS,
        status: DeliveryStatus.FAILED,
        error: 'No phone number available'
      };
    }

    // Get and render template
    const template = await this.templateService.getTemplate(
      notification.type, 
      NotificationChannel.SMS, 
      userContact.language
    );
    
    const rendered = await this.templateService.renderTemplate(template, {
      ...notification.data,
      title: notification.title,
      message: notification.message,
      userName: userContact.name
    });

    // Send SMS
    const result = await this.smsProvider.sendSMS(userContact.phoneNumber, rendered.body);

    return {
      channel: NotificationChannel.SMS,
      status: result.status,
      sentAt: new Date(),
      error: result.error
    };
  }

  private async deliverWebhook(notification: Notification, userContact: UserContactInfo): Promise<NotificationDeliveryResult> {
    if (!userContact.webhookUrl) {
      return {
        channel: NotificationChannel.WEBHOOK,
        status: DeliveryStatus.FAILED,
        error: 'No webhook URL configured'
      };
    }

    const payload = {
      notificationId: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      priority: notification.priority,
      createdAt: notification.createdAt.toISOString()
    };

    const result = await this.webhookProvider.sendWebhook(
      userContact.webhookUrl,
      payload,
      userContact.webhookHeaders
    );

    return {
      channel: NotificationChannel.WEBHOOK,
      status: result.status,
      sentAt: new Date(),
      error: result.error
    };
  }

  private async deliverInApp(notification: Notification): Promise<NotificationDeliveryResult> {
    // In-app notifications are delivered via real-time database
    const inAppData = {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      priority: notification.priority,
      createdAt: notification.createdAt.toISOString(),
      status: 'unread'
    };

    await this.realtimeDb.ref(`notifications/${notification.userId}/${notification.id}`).set(inAppData);

    return {
      channel: NotificationChannel.IN_APP,
      status: DeliveryStatus.DELIVERED,
      sentAt: new Date(),
      deliveredAt: new Date()
    };
  }

  private async getUserContactInfo(userId: string): Promise<UserContactInfo> {
    try {
      // Get user profile
      const userRef = this.firestore.collection('users').doc(userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        throw new NotificationError('User not found', NotificationErrorCode.USER_NOT_FOUND);
      }

      const userData = userDoc.data();

      // Get notification preferences for webhook settings
      const preferencesRef = this.firestore.collection('notification_preferences').doc(userId);
      const preferencesDoc = await preferencesRef.get();
      const preferences = preferencesDoc.exists ? preferencesDoc.data() : null;

      return {
        email: userData?.email,
        phoneNumber: userData?.phoneNumber,
        name: userData?.name || userData?.displayName,
        language: preferences?.language || 'en',
        pushTokens: userData?.pushTokens || [],
        webhookUrl: preferences?.channels?.webhook?.url,
        webhookHeaders: preferences?.channels?.webhook?.headers
      };

    } catch (error) {
      this.logger.error('Failed to get user contact info', error, { userId });
      throw error;
    }
  }

  private async updateNotificationStatus(notificationId: string, status: NotificationStatus): Promise<void> {
    await this.firestore.collection('notifications').doc(notificationId).update({
      status,
      updatedAt: new Date()
    });
  }

  private async updateNotificationWithResults(
    notificationId: string, 
    status: NotificationStatus, 
    results: NotificationDeliveryResult[]
  ): Promise<void> {
    const updateData: any = {
      status,
      deliveryResults: results,
      updatedAt: new Date()
    };

    if (status === NotificationStatus.SENT) {
      updateData.sentAt = new Date();
    }

    await this.firestore.collection('notifications').doc(notificationId).update(updateData);
  }

  private async updateRealtimeDeliveryStatus(
    userId: string, 
    notificationId: string, 
    status: NotificationStatus
  ): Promise<void> {
    await this.realtimeDb.ref(`notifications/${userId}/${notificationId}/status`).set(status);
  }
}

interface UserContactInfo {
  email?: string;
  phoneNumber?: string;
  name?: string;
  language?: string;
  pushTokens?: string[];
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
}