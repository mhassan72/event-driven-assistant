/**
 * Webhook Validator Utilities
 * Validates webhook signatures and payloads from payment providers
 */

import { PaymentProvider } from '../../../shared/types/payment-system';

export interface WebhookValidationResult {
  isValid: boolean;
  provider: PaymentProvider;
  eventType: string;
  errors: string[];
  parsedPayload?: any;
}

export interface WebhookSignatureValidation {
  isValid: boolean;
  algorithm: string;
  timestamp?: number;
  errors: string[];
}

export class WebhookValidator {
  /**
   * Validate webhook signature for different payment providers
   */
  static validateSignature(
    payload: string,
    signature: string,
    secret: string,
    provider: PaymentProvider
  ): WebhookSignatureValidation {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          return this.validateStripeSignature(payload, signature, secret);
        case PaymentProvider.PAYPAL:
          return this.validatePayPalSignature(payload, signature, secret);
        default:
          return {
            isValid: false,
            algorithm: 'unknown',
            errors: [`Unsupported payment provider: ${provider}`]
          };
      }
    } catch (error) {
      return {
        isValid: false,
        algorithm: 'unknown',
        errors: [error instanceof Error ? error.message : 'Unknown validation error']
      };
    }
  }

  /**
   * Validate complete webhook including signature and payload
   */
  static validateWebhook(
    payload: string,
    headers: Record<string, string>,
    secret: string,
    provider: PaymentProvider
  ): WebhookValidationResult {
    const errors: string[] = [];
    
    try {
      // Get signature from headers
      const signature = this.extractSignature(headers, provider);
      if (!signature) {
        errors.push('Missing webhook signature in headers');
        return {
          isValid: false,
          provider,
          eventType: 'unknown',
          errors
        };
      }

      // Validate signature
      const signatureValidation = this.validateSignature(payload, signature, secret, provider);
      if (!signatureValidation.isValid) {
        errors.push(...signatureValidation.errors);
      }

      // Parse payload
      let parsedPayload: any;
      try {
        parsedPayload = JSON.parse(payload);
      } catch (parseError) {
        errors.push('Invalid JSON payload');
        return {
          isValid: false,
          provider,
          eventType: 'unknown',
          errors
        };
      }

      // Extract event type
      const eventType = this.extractEventType(parsedPayload, provider);
      
      // Validate payload structure
      const structureValidation = this.validatePayloadStructure(parsedPayload, provider);
      if (!structureValidation.isValid) {
        errors.push(...structureValidation.errors);
      }

      return {
        isValid: errors.length === 0,
        provider,
        eventType,
        errors,
        parsedPayload: errors.length === 0 ? parsedPayload : undefined
      };

    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown webhook validation error');
      return {
        isValid: false,
        provider,
        eventType: 'unknown',
        errors
      };
    }
  }

  /**
   * Validate Stripe webhook signature
   */
  private static validateStripeSignature(
    payload: string,
    signature: string,
    secret: string
  ): WebhookSignatureValidation {
    try {
      // Parse Stripe signature format: t=timestamp,v1=signature
      const elements = signature.split(',');
      const signatureElements: Record<string, string> = {};
      
      for (const element of elements) {
        const [key, value] = element.split('=');
        signatureElements[key] = value;
      }

      const timestamp = parseInt(signatureElements.t);
      const expectedSignature = signatureElements.v1;

      if (!timestamp || !expectedSignature) {
        return {
          isValid: false,
          algorithm: 'sha256',
          errors: ['Invalid Stripe signature format']
        };
      }

      // Check timestamp (should be within 5 minutes)
      const currentTime = Math.floor(Date.now() / 1000);
      if (Math.abs(currentTime - timestamp) > 300) {
        return {
          isValid: false,
          algorithm: 'sha256',
          timestamp,
          errors: ['Webhook timestamp is too old']
        };
      }

      // For actual implementation, would use crypto.createHmac to verify signature
      // const expectedSignature = crypto.createHmac('sha256', secret)
      //   .update(`${timestamp}.${payload}`)
      //   .digest('hex');

      // Mock validation for now
      const isValid = expectedSignature.length > 0; // Simplified check

      return {
        isValid,
        algorithm: 'sha256',
        timestamp,
        errors: isValid ? [] : ['Invalid Stripe signature']
      };

    } catch (error) {
      return {
        isValid: false,
        algorithm: 'sha256',
        errors: [error instanceof Error ? error.message : 'Stripe signature validation error']
      };
    }
  }

  /**
   * Validate PayPal webhook signature
   */
  private static validatePayPalSignature(
    payload: string,
    signature: string,
    secret: string
  ): WebhookSignatureValidation {
    try {
      // PayPal uses different signature validation
      // For actual implementation, would verify using PayPal's webhook verification
      
      // Mock validation for now
      const isValid = signature.length > 0; // Simplified check

      return {
        isValid,
        algorithm: 'sha256',
        errors: isValid ? [] : ['Invalid PayPal signature']
      };

    } catch (error) {
      return {
        isValid: false,
        algorithm: 'sha256',
        errors: [error instanceof Error ? error.message : 'PayPal signature validation error']
      };
    }
  }

  /**
   * Extract signature from webhook headers
   */
  private static extractSignature(headers: Record<string, string>, provider: PaymentProvider): string | null {
    switch (provider) {
      case PaymentProvider.STRIPE:
        return headers['stripe-signature'] || headers['Stripe-Signature'] || null;
      case PaymentProvider.PAYPAL:
        return headers['paypal-transmission-sig'] || headers['PayPal-Transmission-Sig'] || null;
      default:
        return null;
    }
  }

  /**
   * Extract event type from webhook payload
   */
  private static extractEventType(payload: any, provider: PaymentProvider): string {
    switch (provider) {
      case PaymentProvider.STRIPE:
        return payload.type || 'unknown';
      case PaymentProvider.PAYPAL:
        return payload.event_type || 'unknown';
      default:
        return 'unknown';
    }
  }

  /**
   * Validate webhook payload structure
   */
  private static validatePayloadStructure(
    payload: any,
    provider: PaymentProvider
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          if (!payload.id) errors.push('Missing Stripe event ID');
          if (!payload.type) errors.push('Missing Stripe event type');
          if (!payload.data) errors.push('Missing Stripe event data');
          if (!payload.created) errors.push('Missing Stripe event timestamp');
          break;

        case PaymentProvider.PAYPAL:
          if (!payload.id) errors.push('Missing PayPal event ID');
          if (!payload.event_type) errors.push('Missing PayPal event type');
          if (!payload.resource) errors.push('Missing PayPal event resource');
          if (!payload.create_time) errors.push('Missing PayPal event timestamp');
          break;

        default:
          errors.push(`Unknown provider payload structure: ${provider}`);
      }

      return {
        isValid: errors.length === 0,
        errors
      };

    } catch (error) {
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Payload structure validation error']
      };
    }
  }

  /**
   * Sanitize webhook payload for logging
   */
  static sanitizePayloadForLogging(payload: any): any {
    const sanitized = { ...payload };
    
    // Remove sensitive fields
    const sensitiveFields = [
      'card',
      'payment_method',
      'customer',
      'billing_details',
      'shipping',
      'source'
    ];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
      
      // Also check nested data objects
      if (sanitized.data && sanitized.data.object && sanitized.data.object[field]) {
        sanitized.data.object[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Check if webhook is a duplicate based on ID and timestamp
   */
  static isDuplicateWebhook(
    eventId: string,
    timestamp: number,
    recentEvents: Array<{ id: string; timestamp: number }>
  ): boolean {
    // Check if we've seen this exact event ID recently
    const duplicateById = recentEvents.some(event => event.id === eventId);
    
    // Check if we've seen an event with the same timestamp very recently (within 1 second)
    const duplicateByTimestamp = recentEvents.some(event => 
      Math.abs(event.timestamp - timestamp) < 1000
    );

    return duplicateById || duplicateByTimestamp;
  }

  /**
   * Extract retry information from webhook headers
   */
  static extractRetryInfo(headers: Record<string, string>): {
    isRetry: boolean;
    attemptNumber?: number;
    maxAttempts?: number;
  } {
    // Stripe retry headers
    const stripeRetryAttempt = headers['stripe-retry-attempt'] || headers['Stripe-Retry-Attempt'];
    
    // PayPal retry headers (if any)
    const paypalRetryAttempt = headers['paypal-retry-attempt'] || headers['PayPal-Retry-Attempt'];

    const attemptNumber = parseInt(stripeRetryAttempt || paypalRetryAttempt || '0');
    
    return {
      isRetry: attemptNumber > 0,
      attemptNumber: attemptNumber > 0 ? attemptNumber : undefined,
      maxAttempts: 3 // Most providers retry up to 3 times
    };
  }
}