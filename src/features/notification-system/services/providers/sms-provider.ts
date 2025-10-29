/**
 * SMS Provider
 * Handles SMS notification delivery
 */

import { ISMSProvider, SMSResult, DeliveryStatus } from '../../types';
import { IStructuredLogger } from '../../../../shared/observability/logger';
import { IMetricsCollector } from '../../../../shared/observability/metrics';

export class SMSProvider implements ISMSProvider {
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  private apiKey: string;
  private fromNumber: string;

  constructor(
    logger: IStructuredLogger,
    metrics: IMetricsCollector,
    config: {
      apiKey: string;
      fromNumber: string;
    }
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.apiKey = config.apiKey;
    this.fromNumber = config.fromNumber;
  }

  async sendSMS(to: string, message: string): Promise<SMSResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Sending SMS', { 
        to: this.maskPhoneNumber(to), 
        messageLength: message.length 
      });

      // Validate phone number format
      if (!this.isValidPhoneNumber(to)) {
        throw new Error('Invalid phone number format');
      }

      // Validate message length (SMS limit is typically 160 characters)
      if (message.length > 160) {
        this.logger.warn('SMS message exceeds 160 characters', { 
          length: message.length,
          to: this.maskPhoneNumber(to)
        });
      }

      // In a real implementation, you would use a service like Twilio, AWS SNS, etc.
      // For now, we'll simulate the SMS sending
      const messageId = this.generateMessageId();
      
      // Simulate SMS sending with potential failure
      const success = Math.random() > 0.02; // 98% success rate
      
      if (!success) {
        throw new Error('Simulated SMS delivery failure');
      }

      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

      this.metrics.increment('sms.sent', {
        success: 'true',
        messageLength: message.length.toString()
      });

      this.logger.info('SMS sent successfully', {
        to: this.maskPhoneNumber(to),
        messageId,
        duration: Date.now() - startTime
      });

      return {
        messageId,
        status: DeliveryStatus.SENT
      };

    } catch (error) {
      this.logger.error('Failed to send SMS', error, {
        to: this.maskPhoneNumber(to),
        messageLength: message.length,
        duration: Date.now() - startTime
      });

      this.metrics.increment('sms.failed', {
        error: error instanceof Error ? error.message : 'unknown'
      });

      return {
        messageId: this.generateMessageId(),
        status: DeliveryStatus.FAILED,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private isValidPhoneNumber(phoneNumber: string): boolean {
    // Basic phone number validation (E.164 format)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
  }

  private maskPhoneNumber(phoneNumber: string): string {
    if (phoneNumber.length <= 4) {
      return phoneNumber;
    }
    
    const visibleDigits = 4;
    const masked = '*'.repeat(phoneNumber.length - visibleDigits);
    return masked + phoneNumber.slice(-visibleDigits);
  }

  private generateMessageId(): string {
    return `sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Real implementation example using Twilio (commented out)
/*
import twilio from 'twilio';

export class TwilioSMSProvider implements ISMSProvider {
  private client: twilio.Twilio;
  
  constructor(
    private logger: IStructuredLogger,
    private metrics: IMetricsCollector,
    accountSid: string,
    authToken: string,
    private fromNumber: string
  ) {
    this.client = twilio(accountSid, authToken);
  }

  async sendSMS(to: string, message: string): Promise<SMSResult> {
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: to
      });

      return {
        messageId: result.sid,
        status: DeliveryStatus.SENT
      };

    } catch (error) {
      this.logger.error('Twilio SMS failed', error, { to: this.maskPhoneNumber(to) });
      
      return {
        messageId: 'failed',
        status: DeliveryStatus.FAILED,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
*/