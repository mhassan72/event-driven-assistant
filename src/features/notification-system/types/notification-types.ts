/**
 * Notification System Types
 * Type definitions for the notification and alerting system
 */

// Core notification types
export interface NotificationRequest {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  channels?: NotificationChannel[];
  priority?: NotificationPriority;
  scheduledAt?: Date;
  expiresAt?: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  channels: NotificationChannel[];
  priority: NotificationPriority;
  status: NotificationStatus;
  createdAt: Date;
  scheduledAt?: Date;
  sentAt?: Date;
  readAt?: Date;
  expiresAt?: Date;
  deliveryResults: NotificationDeliveryResult[];
}

export enum NotificationType {
  // Credit-related notifications
  LOW_BALANCE = 'low_balance',
  BALANCE_DEPLETED = 'balance_depleted',
  CREDITS_ADDED = 'credits_added',
  USAGE_SUMMARY = 'usage_summary',
  
  // Payment-related notifications
  PAYMENT_SUCCESS = 'payment_success',
  PAYMENT_FAILED = 'payment_failed',
  PAYMENT_PENDING = 'payment_pending',
  REFUND_PROCESSED = 'refund_processed',
  
  // Task and AI-related notifications
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  TASK_PROGRESS = 'task_progress',
  IMAGE_GENERATED = 'image_generated',
  
  // System notifications
  SYSTEM_MAINTENANCE = 'system_maintenance',
  SECURITY_ALERT = 'security_alert',
  ACCOUNT_SUSPENDED = 'account_suspended',
  FEATURE_ANNOUNCEMENT = 'feature_announcement'
}

export enum NotificationChannel {
  EMAIL = 'email',
  PUSH = 'push',
  IN_APP = 'in_app',
  SMS = 'sms',
  WEBHOOK = 'webhook'
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum NotificationStatus {
  PENDING = 'pending',
  SCHEDULED = 'scheduled',
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
  EXPIRED = 'expired'
}

export interface NotificationDeliveryResult {
  channel: NotificationChannel;
  status: DeliveryStatus;
  sentAt?: Date;
  deliveredAt?: Date;
  error?: string;
  providerResponse?: any;
}

export enum DeliveryStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  BOUNCED = 'bounced'
}

// User notification preferences
export interface NotificationPreferences {
  userId: string;
  channels: NotificationChannelPreferences;
  types: NotificationTypePreferences;
  quietHours?: QuietHours;
  frequency?: NotificationFrequency;
  language?: string;
  timezone?: string;
  updatedAt: Date;
}

export interface NotificationChannelPreferences {
  email: ChannelSettings;
  push: ChannelSettings;
  inApp: ChannelSettings;
  sms: ChannelSettings;
  webhook: WebhookSettings;
}

export interface ChannelSettings {
  enabled: boolean;
  types: NotificationType[];
  minPriority: NotificationPriority;
}

export interface WebhookSettings extends ChannelSettings {
  url?: string;
  secret?: string;
  headers?: Record<string, string>;
}

export interface NotificationTypePreferences {
  [NotificationType.LOW_BALANCE]: TypeSettings;
  [NotificationType.BALANCE_DEPLETED]: TypeSettings;
  [NotificationType.CREDITS_ADDED]: TypeSettings;
  [NotificationType.USAGE_SUMMARY]: TypeSettings;
  [NotificationType.PAYMENT_SUCCESS]: TypeSettings;
  [NotificationType.PAYMENT_FAILED]: TypeSettings;
  [NotificationType.PAYMENT_PENDING]: TypeSettings;
  [NotificationType.REFUND_PROCESSED]: TypeSettings;
  [NotificationType.TASK_COMPLETED]: TypeSettings;
  [NotificationType.TASK_FAILED]: TypeSettings;
  [NotificationType.TASK_PROGRESS]: TypeSettings;
  [NotificationType.IMAGE_GENERATED]: TypeSettings;
  [NotificationType.SYSTEM_MAINTENANCE]: TypeSettings;
  [NotificationType.SECURITY_ALERT]: TypeSettings;
  [NotificationType.ACCOUNT_SUSPENDED]: TypeSettings;
  [NotificationType.FEATURE_ANNOUNCEMENT]: TypeSettings;
}

export interface TypeSettings {
  enabled: boolean;
  channels: NotificationChannel[];
  threshold?: number;
  frequency?: NotificationFrequency;
}

export interface QuietHours {
  enabled: boolean;
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  timezone: string;
  exceptions: NotificationType[]; // Types that bypass quiet hours
}

export enum NotificationFrequency {
  IMMEDIATE = 'immediate',
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly'
}

// Notification templates
export interface NotificationTemplate {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  language: string;
  subject?: string;
  title: string;
  body: string;
  htmlBody?: string;
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Notification analytics
export interface NotificationAnalytics {
  userId?: string;
  type?: NotificationType;
  channel?: NotificationChannel;
  timeRange: {
    start: Date;
    end: Date;
  };
  metrics: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    clickThrough: number;
    unsubscribed: number;
  };
  deliveryRate: number;
  readRate: number;
  clickThroughRate: number;
}

// Service interfaces
export interface INotificationService {
  // Core notification operations
  sendNotification(request: NotificationRequest): Promise<Notification>;
  scheduleNotification(request: NotificationRequest, scheduledAt: Date): Promise<Notification>;
  cancelNotification(notificationId: string): Promise<boolean>;
  
  // Bulk operations
  sendBulkNotifications(requests: NotificationRequest[]): Promise<Notification[]>;
  
  // User notification management
  getUserNotifications(userId: string, options?: GetNotificationsOptions): Promise<Notification[]>;
  markAsRead(notificationId: string, userId: string): Promise<boolean>;
  markAllAsRead(userId: string): Promise<number>;
  deleteNotification(notificationId: string, userId: string): Promise<boolean>;
  
  // Preferences management
  getPreferences(userId: string): Promise<NotificationPreferences>;
  updatePreferences(userId: string, preferences: Partial<NotificationPreferences>): Promise<NotificationPreferences>;
  
  // Analytics
  getAnalytics(options: AnalyticsOptions): Promise<NotificationAnalytics>;
}

export interface GetNotificationsOptions {
  limit?: number;
  offset?: number;
  types?: NotificationType[];
  status?: NotificationStatus[];
  unreadOnly?: boolean;
  since?: Date;
}

export interface AnalyticsOptions {
  userId?: string;
  type?: NotificationType;
  channel?: NotificationChannel;
  timeRange: {
    start: Date;
    end: Date;
  };
}

// Channel-specific interfaces
export interface IEmailProvider {
  sendEmail(to: string, subject: string, body: string, htmlBody?: string): Promise<EmailResult>;
}

export interface IPushProvider {
  sendPush(token: string, title: string, body: string, data?: any): Promise<PushResult>;
}

export interface ISMSProvider {
  sendSMS(to: string, message: string): Promise<SMSResult>;
}

export interface IWebhookProvider {
  sendWebhook(url: string, payload: any, headers?: Record<string, string>): Promise<WebhookResult>;
}

export interface EmailResult {
  messageId: string;
  status: DeliveryStatus;
  error?: string;
}

export interface PushResult {
  messageId: string;
  status: DeliveryStatus;
  error?: string;
}

export interface SMSResult {
  messageId: string;
  status: DeliveryStatus;
  error?: string;
}

export interface WebhookResult {
  status: DeliveryStatus;
  responseCode?: number;
  error?: string;
}

// Error types
export class NotificationError extends Error {
  constructor(
    message: string,
    public code: NotificationErrorCode,
    public details?: any
  ) {
    super(message);
    this.name = 'NotificationError';
  }
}

export enum NotificationErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  DELIVERY_FAILED = 'DELIVERY_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',
  CHANNEL_DISABLED = 'CHANNEL_DISABLED',
  INVALID_PREFERENCES = 'INVALID_PREFERENCES'
}