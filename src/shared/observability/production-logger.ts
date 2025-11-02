/**
 * Production Logger with Structured Logging and Log Aggregation
 * Provides comprehensive logging for production monitoring
 */

import { logger as functionsLogger } from 'firebase-functions/v2';

export interface LogContext {
  userId?: string;
  requestId?: string;
  operationId?: string;
  workflowId?: string;
  transactionId?: string;
  sessionId?: string;
  feature?: string;
  component?: string;
  method?: string;
  duration?: number;
  creditsUsed?: number;
  model?: string;
  [key: string]: any;
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  message: string;
  context?: LogContext;
  error?: Error;
  timestamp?: Date;
  environment?: string;
  service?: string;
  version?: string;
}

export class ProductionLogger {
  private static instance: ProductionLogger;
  private environment: string;
  private service: string;
  private version: string;

  private constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.service = 'integrated-credit-system';
    this.version = process.env.npm_package_version || '1.0.0';
  }

  public static getInstance(): ProductionLogger {
    if (!ProductionLogger.instance) {
      ProductionLogger.instance = new ProductionLogger();
    }
    return ProductionLogger.instance;
  }

  private formatLogEntry(entry: LogEntry): any {
    return {
      timestamp: entry.timestamp || new Date().toISOString(),
      level: entry.level,
      message: entry.message,
      service: this.service,
      environment: this.environment,
      version: this.version,
      context: entry.context || {},
      error: entry.error ? {
        name: entry.error.name,
        message: entry.error.message,
        stack: entry.error.stack,
      } : undefined,
    };
  }

  public debug(message: string, context?: LogContext): void {
    const logEntry = this.formatLogEntry({ level: 'debug', message, context });
    functionsLogger.debug(logEntry);
  }

  public info(message: string, context?: LogContext): void {
    const logEntry = this.formatLogEntry({ level: 'info', message, context });
    functionsLogger.info(logEntry);
  }

  public warn(message: string, context?: LogContext, error?: Error): void {
    const logEntry = this.formatLogEntry({ level: 'warn', message, context, error });
    functionsLogger.warn(logEntry);
  }

  public error(message: string, context?: LogContext, error?: Error): void {
    const logEntry = this.formatLogEntry({ level: 'error', message, context, error });
    functionsLogger.error(logEntry);
  }

  public critical(message: string, context?: LogContext, error?: Error): void {
    const logEntry = this.formatLogEntry({ level: 'critical', message, context, error });
    functionsLogger.error(logEntry); // Firebase Functions doesn't have critical level
    
    // Send to alerting system for critical issues
    this.sendCriticalAlert(message, context, error);
  }

  // Specialized logging methods for different operations
  public logCreditOperation(operation: string, userId: string, amount: number, context?: LogContext): void {
    this.info(`Credit operation: ${operation}`, {
      ...context,
      userId,
      creditsUsed: amount,
      feature: 'credit-system',
      component: 'credit-service',
    });
  }

  public logPaymentOperation(operation: string, userId: string, amount: number, paymentMethod: string, context?: LogContext): void {
    this.info(`Payment operation: ${operation}`, {
      ...context,
      userId,
      amount,
      paymentMethod,
      feature: 'payment-system',
      component: 'payment-service',
    });
  }

  public logAIInteraction(userId: string, model: string, creditsUsed: number, duration: number, context?: LogContext): void {
    this.info('AI interaction completed', {
      ...context,
      userId,
      model,
      creditsUsed,
      duration,
      feature: 'ai-assistant',
      component: 'ai-service',
    });
  }

  public logSecurityEvent(event: string, userId?: string, context?: LogContext): void {
    this.warn(`Security event: ${event}`, {
      ...context,
      userId,
      feature: 'security',
      component: 'auth-middleware',
    });
  }

  public logPerformanceMetric(operation: string, duration: number, context?: LogContext): void {
    this.info(`Performance metric: ${operation}`, {
      ...context,
      duration,
      feature: 'performance',
      component: 'metrics',
    });
  }

  private async sendCriticalAlert(message: string, context?: LogContext, error?: Error): Promise<void> {
    try {
      // In production, integrate with alerting services like PagerDuty, Slack, etc.
      // For now, we'll use Firebase Functions logging with special markers
      functionsLogger.error({
        alert: 'CRITICAL',
        message,
        context,
        error: error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : undefined,
        timestamp: new Date().toISOString(),
        service: this.service,
        environment: this.environment,
      });
    } catch (alertError) {
      functionsLogger.error('Failed to send critical alert', { alertError });
    }
  }
}

// Export singleton instance
export const productionLogger = ProductionLogger.getInstance();