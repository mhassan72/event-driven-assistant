/**
 * Push Notification Provider
 * Handles push notification delivery via Firebase Cloud Messaging
 */

import { IPushProvider, PushResult, DeliveryStatus } from '../../types';
import { IStructuredLogger } from '../../../../shared/observability/logger';
import { IMetricsCollector } from '../../../../shared/observability/metrics';
import { messaging } from 'firebase-admin';

export class PushProvider implements IPushProvider {
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  private messaging: messaging.Messaging;

  constructor(
    logger: IStructuredLogger,
    metrics: IMetricsCollector,
    messagingInstance: messaging.Messaging
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.messaging = messagingInstance;
  }

  async sendPush(token: string, title: string, body: string, data?: any): Promise<PushResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Sending push notification', { token: token.substring(0, 20) + '...', title });

      const message: messaging.Message = {
        token,
        notification: {
          title,
          body
        },
        data: data ? this.stringifyData(data) : undefined,
        android: {
          notification: {
            channelId: 'default',
            priority: 'high' as messaging.AndroidNotificationPriority
          }
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title,
                body
              },
              badge: 1,
              sound: 'default'
            }
          }
        }
      };

      const messageId = await this.messaging.send(message);

      this.metrics.increment('push.sent', {
        success: 'true'
      });

      this.logger.info('Push notification sent successfully', {
        messageId,
        duration: Date.now() - startTime
      });

      return {
        messageId,
        status: DeliveryStatus.SENT
      };

    } catch (error) {
      this.logger.error('Failed to send push notification', error, {
        token: token.substring(0, 20) + '...',
        title,
        duration: Date.now() - startTime
      });

      this.metrics.increment('push.failed', {
        error: error instanceof Error ? error.message : 'unknown'
      });

      // Check if it's a token error (invalid/unregistered token)
      const isTokenError = error instanceof Error && (
        error.message.includes('registration-token-not-registered') ||
        error.message.includes('invalid-registration-token')
      );

      return {
        messageId: this.generateMessageId(),
        status: isTokenError ? DeliveryStatus.BOUNCED : DeliveryStatus.FAILED,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async sendMulticast(tokens: string[], title: string, body: string, data?: any): Promise<PushResult[]> {
    if (tokens.length === 0) {
      return [];
    }

    try {
      this.logger.info('Sending multicast push notification', { 
        tokenCount: tokens.length, 
        title 
      });

      const message: messaging.MulticastMessage = {
        tokens,
        notification: {
          title,
          body
        },
        data: data ? this.stringifyData(data) : undefined,
        android: {
          notification: {
            channelId: 'default',
            priority: 'high' as messaging.AndroidNotificationPriority
          }
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title,
                body
              },
              badge: 1,
              sound: 'default'
            }
          }
        }
      };

      const response = await this.messaging.sendMulticast(message);

      const results: PushResult[] = [];
      
      for (let i = 0; i < response.responses.length; i++) {
        const result = response.responses[i];
        
        if (result.success) {
          results.push({
            messageId: result.messageId!,
            status: DeliveryStatus.SENT
          });
        } else {
          const error = result.error!;
          const isTokenError = error.code === 'messaging/registration-token-not-registered' ||
                              error.code === 'messaging/invalid-registration-token';
          
          results.push({
            messageId: this.generateMessageId(),
            status: isTokenError ? DeliveryStatus.BOUNCED : DeliveryStatus.FAILED,
            error: error.message
          });
        }
      }

      this.metrics.increment('push.multicast', {
        total: tokens.length,
        successful: response.successCount,
        failed: response.failureCount
      });

      return results;

    } catch (error) {
      this.logger.error('Failed to send multicast push notification', error, {
        tokenCount: tokens.length,
        title
      });

      // Return failed results for all tokens
      return tokens.map(() => ({
        messageId: this.generateMessageId(),
        status: DeliveryStatus.FAILED,
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }

  private stringifyData(data: any): Record<string, string> {
    const stringData: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        stringData[key] = value;
      } else {
        stringData[key] = JSON.stringify(value);
      }
    }
    
    return stringData;
  }

  private generateMessageId(): string {
    return `push_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}