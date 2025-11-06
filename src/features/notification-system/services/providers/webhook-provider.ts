/**
 * Webhook Provider
 * Handles webhook notification delivery
 */

import { IWebhookProvider, WebhookResult, DeliveryStatus } from '../../types';
import { IStructuredLogger } from '../../../../shared/observability/logger';
import { IMetricsCollector } from '../../../../shared/observability/metrics';
import * as crypto from 'crypto';

export class WebhookProvider implements IWebhookProvider {
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  private timeout: number;
  private maxRetries: number;

  constructor(
    logger: IStructuredLogger,
    metrics: IMetricsCollector,
    config: {
      timeout?: number;
      maxRetries?: number;
    } = {}
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.timeout = config.timeout || 10000; // 10 seconds
    this.maxRetries = config.maxRetries || 3;
  }

  async sendWebhook(url: string, payload: any, headers?: Record<string, string>): Promise<WebhookResult> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.info('Sending webhook', { 
          url: this.maskUrl(url), 
          attempt,
          payloadSize: JSON.stringify(payload).length
        });

        const result = await this.makeWebhookRequest(url, payload, headers);

        this.metrics.increment('webhook.sent', 1, {
          success: 'true',
          attempt: attempt.toString(),
          responseCode: result.responseCode?.toString() || 'unknown'
        });

        this.logger.info('Webhook sent successfully', {
          url: this.maskUrl(url),
          responseCode: result.responseCode,
          attempt,
          duration: Date.now() - startTime
        });

        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        this.logger.warn('Webhook attempt failed', {
          error: lastError instanceof Error ? lastError.message : 'Unknown error',
          url: this.maskUrl(url),
          attempt,
          duration: Date.now() - startTime
        });

        // Don't retry on client errors (4xx)
        if (error instanceof Error && error.message.includes('4')) {
          break;
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All attempts failed
    this.logger.error('Webhook delivery failed after all attempts', {
      error: lastError instanceof Error ? lastError.message : 'Unknown error',
      url: this.maskUrl(url),
      attempts: this.maxRetries,
      totalDuration: Date.now() - startTime
    });

    this.metrics.increment('webhook.failed', 1, {
      error: lastError?.message || 'unknown',
      attempts: this.maxRetries.toString()
    });

    return {
      status: DeliveryStatus.FAILED,
      error: lastError?.message || 'Unknown error after all retry attempts'
    };
  }

  private async makeWebhookRequest(url: string, payload: any, headers?: Record<string, string>): Promise<WebhookResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const body = JSON.stringify(payload);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      
      // Prepare headers
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'AI-Assistant-Notifications/1.0',
        'X-Webhook-Timestamp': timestamp,
        ...headers
      };

      // Add signature if secret is provided in headers
      if (headers?.['X-Webhook-Secret']) {
        const secret = headers['X-Webhook-Secret'];
        const signature = this.generateSignature(body, secret, timestamp);
        requestHeaders['X-Webhook-Signature'] = signature;
        delete requestHeaders['X-Webhook-Secret']; // Don't send the secret itself
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Consider 2xx responses as successful
      if (response.status >= 200 && response.status < 300) {
        return {
          status: DeliveryStatus.SENT,
          responseCode: response.status
        };
      }

      // Handle different error status codes
      let errorMessage = `HTTP ${response.status}`;
      try {
        const responseText = await response.text();
        if (responseText) {
          errorMessage += `: ${responseText.substring(0, 200)}`;
        }
      } catch {
        // Ignore response reading errors
      }

      throw new Error(errorMessage);

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Webhook request timeout after ${this.timeout}ms`);
        }
        throw error;
      }

      throw new Error('Unknown webhook request error');
    }
  }

  private generateSignature(body: string, secret: string, timestamp: string): string {
    // Create HMAC signature similar to GitHub webhooks
    const payload = `${timestamp}.${body}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return `sha256=${signature}`;
  }

  private maskUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      // If URL parsing fails, just mask the middle part
      if (url.length <= 20) {
        return url;
      }
      
      const start = url.substring(0, 10);
      const end = url.substring(url.length - 10);
      return `${start}...${end}`;
    }
  }
}