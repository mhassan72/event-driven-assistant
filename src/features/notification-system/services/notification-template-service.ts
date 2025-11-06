/**
 * Notification Template Service
 * Manages notification templates and rendering
 */

import {
  NotificationType,
  NotificationChannel,
  NotificationTemplate,
  NotificationError,
  NotificationErrorCode
} from '../types';
import { IStructuredLogger } from '../../../shared/observability/logger';
import { Firestore } from 'firebase-admin/firestore';

export interface INotificationTemplateService {
  getTemplate(type: NotificationType, channel: NotificationChannel, language?: string): Promise<NotificationTemplate>;
  renderTemplate(template: NotificationTemplate, variables: Record<string, any>): Promise<{
    subject?: string;
    title: string;
    body: string;
    htmlBody?: string;
  }>;
  createTemplate(template: Omit<NotificationTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotificationTemplate>;
  updateTemplate(templateId: string, updates: Partial<NotificationTemplate>): Promise<NotificationTemplate>;
  deleteTemplate(templateId: string): Promise<boolean>;
}

export class NotificationTemplateService implements INotificationTemplateService {
  private firestore: Firestore;
  private logger: IStructuredLogger;
  private templateCache: Map<string, NotificationTemplate> = new Map();

  constructor(firestore: Firestore, logger: IStructuredLogger) {
    this.firestore = firestore;
    this.logger = logger;
  }

  async getTemplate(type: NotificationType, channel: NotificationChannel, language = 'en'): Promise<NotificationTemplate> {
    const cacheKey = `${type}-${channel}-${language}`;
    
    // Check cache first
    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey)!;
    }

    try {
      // Try to find specific template
      let query = this.firestore.collection('notification_templates')
        .where('type', '==', type)
        .where('channel', '==', channel)
        .where('language', '==', language)
        .limit(1);

      let snapshot = await query.get();

      // If no template found for specific language, try English as fallback
      if (snapshot.empty && language !== 'en') {
        query = this.firestore.collection('notification_templates')
          .where('type', '==', type)
          .where('channel', '==', channel)
          .where('language', '==', 'en')
          .limit(1);

        snapshot = await query.get();
      }

      // If still no template found, use default template
      if (snapshot.empty) {
        const defaultTemplate = this.getDefaultTemplate(type, channel, language);
        this.templateCache.set(cacheKey, defaultTemplate);
        return defaultTemplate;
      }

      const template = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as NotificationTemplate;
      this.templateCache.set(cacheKey, template);
      return template;

    } catch (error) {
      this.logger.error('Failed to get notification template', { error: error instanceof Error ? error.message : 'Unknown error',  type, channel, language });
      
      // Return default template as fallback
      const defaultTemplate = this.getDefaultTemplate(type, channel, language);
      return defaultTemplate;
    }
  }

  async renderTemplate(template: NotificationTemplate, variables: Record<string, any>): Promise<{
    subject?: string;
    title: string;
    body: string;
    htmlBody?: string;
  }> {
    try {
      const rendered = {
        subject: template.subject ? this.replaceVariables(template.subject, variables) : undefined,
        title: this.replaceVariables(template.title, variables),
        body: this.replaceVariables(template.body, variables),
        htmlBody: template.htmlBody ? this.replaceVariables(template.htmlBody, variables) : undefined
      };

      return rendered;

    } catch (error) {
      this.logger.error('Failed to render notification template', { error: error instanceof Error ? error.message : 'Unknown error',  
        templateId: template.id, 
        variables 
      });
      throw new NotificationError(
        'Template rendering failed',
        NotificationErrorCode.TEMPLATE_NOT_FOUND
      );
    }
  }

  async createTemplate(templateData: Omit<NotificationTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotificationTemplate> {
    try {
      const template: NotificationTemplate = {
        ...templateData,
        id: this.firestore.collection('notification_templates').doc().id,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.firestore.collection('notification_templates').doc(template.id).set(template);

      // Clear cache for this template type
      this.clearTemplateCache(template.type, template.channel, template.language);

      this.logger.info('Notification template created', { templateId: template.id });
      return template;

    } catch (error) {
      this.logger.error('Failed to create notification template', { error: error instanceof Error ? error.message : 'Unknown error',  templateData });
      throw error;
    }
  }

  async updateTemplate(templateId: string, updates: Partial<NotificationTemplate>): Promise<NotificationTemplate> {
    try {
      const templateRef = this.firestore.collection('notification_templates').doc(templateId);
      const templateDoc = await templateRef.get();

      if (!templateDoc.exists) {
        throw new NotificationError(
          'Template not found',
          NotificationErrorCode.TEMPLATE_NOT_FOUND
        );
      }

      const currentTemplate = templateDoc.data() as NotificationTemplate;
      const updatedTemplate: NotificationTemplate = {
        ...currentTemplate,
        ...updates,
        id: templateId,
        updatedAt: new Date()
      };

      await templateRef.update(updatedTemplate);

      // Clear cache for this template
      this.clearTemplateCache(currentTemplate.type, currentTemplate.channel, currentTemplate.language);

      this.logger.info('Notification template updated', { templateId });
      return updatedTemplate;

    } catch (error) {
      this.logger.error('Failed to update notification template', { error: error instanceof Error ? error.message : 'Unknown error',  templateId, updates });
      throw error;
    }
  }

  async deleteTemplate(templateId: string): Promise<boolean> {
    try {
      const templateRef = this.firestore.collection('notification_templates').doc(templateId);
      const templateDoc = await templateRef.get();

      if (!templateDoc.exists) {
        return false;
      }

      const template = templateDoc.data() as NotificationTemplate;
      await templateRef.delete();

      // Clear cache for this template
      this.clearTemplateCache(template.type, template.channel, template.language);

      this.logger.info('Notification template deleted', { templateId });
      return true;

    } catch (error) {
      this.logger.error('Failed to delete notification template', { error: error instanceof Error ? error.message : 'Unknown error',  templateId });
      return false;
    }
  }

  private replaceVariables(text: string, variables: Record<string, any>): string {
    let result = text;

    // Replace {{variable}} patterns
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, String(value || ''));
    }

    // Replace any remaining unreplaced variables with empty string
    result = result.replace(/{{[^}]+}}/g, '');

    return result;
  }

  private clearTemplateCache(type: NotificationType, channel: NotificationChannel, language: string): void {
    const cacheKey = `${type}-${channel}-${language}`;
    this.templateCache.delete(cacheKey);
  }

  private getDefaultTemplate(type: NotificationType, channel: NotificationChannel, language: string): NotificationTemplate {
    const templates = this.getDefaultTemplates();
    const key = `${type}-${channel}`;
    
    if (templates[key]) {
      return {
        id: `default-${key}-${language}`,
        type,
        channel,
        language,
        ...templates[key],
        variables: this.extractVariables(templates[key].title + ' ' + templates[key].body),
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    // Fallback generic template
    return {
      id: `default-generic-${language}`,
      type,
      channel,
      language,
      title: '{{title}}',
      body: '{{message}}',
      variables: ['title', 'message'],
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private getDefaultTemplates(): Record<string, { subject?: string; title: string; body: string; htmlBody?: string }> {
    return {
      // Low Balance Templates
      [`${NotificationType.LOW_BALANCE}-${NotificationChannel.EMAIL}`]: {
        subject: 'Low Credit Balance Alert',
        title: 'Your credit balance is running low',
        body: 'Hi {{userName}}, your current balance is {{currentBalance}} credits. Consider topping up to continue using our AI services.',
        htmlBody: '<h2>Low Credit Balance</h2><p>Hi {{userName}},</p><p>Your current balance is <strong>{{currentBalance}} credits</strong>.</p><p>Consider topping up to continue using our AI services.</p>'
      },
      [`${NotificationType.LOW_BALANCE}-${NotificationChannel.PUSH}`]: {
        title: 'Low Credit Balance',
        body: 'Your balance is {{currentBalance}} credits. Tap to top up.'
      },
      [`${NotificationType.LOW_BALANCE}-${NotificationChannel.IN_APP}`]: {
        title: 'Low Credit Balance',
        body: 'Your current balance is {{currentBalance}} credits. Top up now to continue using AI services.'
      },

      // Balance Depleted Templates
      [`${NotificationType.BALANCE_DEPLETED}-${NotificationChannel.EMAIL}`]: {
        subject: 'Credit Balance Depleted',
        title: 'Your credit balance has been depleted',
        body: 'Hi {{userName}}, your credit balance is now 0. Please top up to continue using our AI services.',
        htmlBody: '<h2>Credit Balance Depleted</h2><p>Hi {{userName}},</p><p>Your credit balance is now <strong>0</strong>.</p><p>Please top up to continue using our AI services.</p>'
      },
      [`${NotificationType.BALANCE_DEPLETED}-${NotificationChannel.PUSH}`]: {
        title: 'Credits Depleted',
        body: 'Your balance is 0. Tap to purchase more credits.'
      },

      // Credits Added Templates
      [`${NotificationType.CREDITS_ADDED}-${NotificationChannel.EMAIL}`]: {
        subject: 'Credits Added to Your Account',
        title: 'Credits successfully added',
        body: 'Hi {{userName}}, {{creditsAdded}} credits have been added to your account. Your new balance is {{newBalance}} credits.',
        htmlBody: '<h2>Credits Added</h2><p>Hi {{userName}},</p><p><strong>{{creditsAdded}} credits</strong> have been added to your account.</p><p>Your new balance is <strong>{{newBalance}} credits</strong>.</p>'
      },
      [`${NotificationType.CREDITS_ADDED}-${NotificationChannel.PUSH}`]: {
        title: 'Credits Added',
        body: '{{creditsAdded}} credits added. New balance: {{newBalance}}'
      },

      // Payment Success Templates
      [`${NotificationType.PAYMENT_SUCCESS}-${NotificationChannel.EMAIL}`]: {
        subject: 'Payment Successful',
        title: 'Payment processed successfully',
        body: 'Hi {{userName}}, your payment of {{paymentAmount}} has been processed successfully. {{creditsAdded}} credits have been added to your account.',
        htmlBody: '<h2>Payment Successful</h2><p>Hi {{userName}},</p><p>Your payment of <strong>{{paymentAmount}}</strong> has been processed successfully.</p><p><strong>{{creditsAdded}} credits</strong> have been added to your account.</p>'
      },
      [`${NotificationType.PAYMENT_SUCCESS}-${NotificationChannel.PUSH}`]: {
        title: 'Payment Successful',
        body: 'Payment of {{paymentAmount}} processed. {{creditsAdded}} credits added.'
      },

      // Payment Failed Templates
      [`${NotificationType.PAYMENT_FAILED}-${NotificationChannel.EMAIL}`]: {
        subject: 'Payment Failed',
        title: 'Payment could not be processed',
        body: 'Hi {{userName}}, your payment of {{paymentAmount}} could not be processed. Please try again or contact support.',
        htmlBody: '<h2>Payment Failed</h2><p>Hi {{userName}},</p><p>Your payment of <strong>{{paymentAmount}}</strong> could not be processed.</p><p>Please try again or contact support.</p>'
      },
      [`${NotificationType.PAYMENT_FAILED}-${NotificationChannel.PUSH}`]: {
        title: 'Payment Failed',
        body: 'Payment of {{paymentAmount}} failed. Please try again.'
      },

      // Task Completed Templates
      [`${NotificationType.TASK_COMPLETED}-${NotificationChannel.EMAIL}`]: {
        subject: 'Task Completed',
        title: 'Your AI task has been completed',
        body: 'Hi {{userName}}, your {{taskType}} task "{{taskTitle}}" has been completed successfully.',
        htmlBody: '<h2>Task Completed</h2><p>Hi {{userName}},</p><p>Your <strong>{{taskType}}</strong> task "{{taskTitle}}" has been completed successfully.</p>'
      },
      [`${NotificationType.TASK_COMPLETED}-${NotificationChannel.PUSH}`]: {
        title: 'Task Completed',
        body: 'Your {{taskType}} task "{{taskTitle}}" is ready.'
      },

      // Image Generated Templates
      [`${NotificationType.IMAGE_GENERATED}-${NotificationChannel.EMAIL}`]: {
        subject: 'Image Generated',
        title: 'Your AI-generated image is ready',
        body: 'Hi {{userName}}, your image generation task has been completed. The image is now available in your gallery.',
        htmlBody: '<h2>Image Generated</h2><p>Hi {{userName}},</p><p>Your image generation task has been completed.</p><p>The image is now available in your gallery.</p>'
      },
      [`${NotificationType.IMAGE_GENERATED}-${NotificationChannel.PUSH}`]: {
        title: 'Image Ready',
        body: 'Your AI-generated image is ready to view.'
      },

      // Security Alert Templates
      [`${NotificationType.SECURITY_ALERT}-${NotificationChannel.EMAIL}`]: {
        subject: 'Security Alert',
        title: 'Security alert for your account',
        body: 'Hi {{userName}}, we detected {{alertType}} on your account. If this was not you, please secure your account immediately.',
        htmlBody: '<h2>Security Alert</h2><p>Hi {{userName}},</p><p>We detected <strong>{{alertType}}</strong> on your account.</p><p>If this was not you, please secure your account immediately.</p>'
      },
      [`${NotificationType.SECURITY_ALERT}-${NotificationChannel.PUSH}`]: {
        title: 'Security Alert',
        body: 'We detected {{alertType}} on your account. Please review.'
      },
      [`${NotificationType.SECURITY_ALERT}-${NotificationChannel.SMS}`]: {
        title: 'Security Alert',
        body: 'Security alert: {{alertType}} detected on your account. If not you, secure your account now.'
      }
    };
  }

  private extractVariables(text: string): string[] {
    const matches = text.match(/{{[^}]+}}/g) || [];
    return matches.map(match => match.replace(/[{}]/g, '').trim());
  }
}