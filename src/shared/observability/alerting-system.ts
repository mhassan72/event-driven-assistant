/**
 * Alerting System for Production Monitoring
 * Handles different types of alerts and notification channels
 */

import { productionLogger } from './production-logger';

export interface Alert {
  id: string;
  type: 'info' | 'warning' | 'critical' | 'security';
  title: string;
  message: string;
  source: string;
  timestamp: Date;
  context?: Record<string, any>;
  resolved?: boolean;
  resolvedAt?: Date;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: (context: any) => boolean;
  severity: 'warning' | 'critical';
  cooldownMinutes: number;
  channels: AlertChannel[];
}

export interface AlertChannel {
  type: 'email' | 'slack' | 'webhook' | 'firebase';
  config: Record<string, any>;
  enabled: boolean;
}

export class AlertingSystem {
  private static instance: AlertingSystem;
  private alerts: Map<string, Alert> = new Map();
  private rules: Map<string, AlertRule> = new Map();
  private lastAlertTime: Map<string, Date> = new Map();

  private constructor() {
    this.setupDefaultRules();
  }

  public static getInstance(): AlertingSystem {
    if (!AlertingSystem.instance) {
      AlertingSystem.instance = new AlertingSystem();
    }
    return AlertingSystem.instance;
  }

  private setupDefaultRules(): void {
    // High error rate alert
    this.rules.set('high_error_rate', {
      id: 'high_error_rate',
      name: 'High Error Rate',
      condition: (context) => context.errorRate > 5, // 5%
      severity: 'warning',
      cooldownMinutes: 15,
      channels: [
        { type: 'firebase', config: {}, enabled: true },
        { type: 'email', config: { recipients: ['admin@example.com'] }, enabled: false }
      ]
    });

    // Critical error rate alert
    this.rules.set('critical_error_rate', {
      id: 'critical_error_rate',
      name: 'Critical Error Rate',
      condition: (context) => context.errorRate > 10, // 10%
      severity: 'critical',
      cooldownMinutes: 5,
      channels: [
        { type: 'firebase', config: {}, enabled: true },
        { type: 'email', config: { recipients: ['admin@example.com'] }, enabled: false }
      ]
    });

    // Low credit balance alert
    this.rules.set('system_low_credits', {
      id: 'system_low_credits',
      name: 'System Low Credits Pool',
      condition: (context) => context.totalSystemCredits < 10000,
      severity: 'warning',
      cooldownMinutes: 60,
      channels: [
        { type: 'firebase', config: {}, enabled: true }
      ]
    });

    // Payment processing failure alert
    this.rules.set('payment_failures', {
      id: 'payment_failures',
      name: 'Payment Processing Failures',
      condition: (context) => context.paymentFailureRate > 15, // 15%
      severity: 'critical',
      cooldownMinutes: 10,
      channels: [
        { type: 'firebase', config: {}, enabled: true }
      ]
    });

    // AI service unavailable alert
    this.rules.set('ai_service_down', {
      id: 'ai_service_down',
      name: 'AI Service Unavailable',
      condition: (context) => context.aiServiceAvailability < 90, // 90%
      severity: 'critical',
      cooldownMinutes: 5,
      channels: [
        { type: 'firebase', config: {}, enabled: true }
      ]
    });

    // Database connection issues
    this.rules.set('database_issues', {
      id: 'database_issues',
      name: 'Database Connection Issues',
      condition: (context) => context.databaseErrorRate > 5, // 5%
      severity: 'critical',
      cooldownMinutes: 5,
      channels: [
        { type: 'firebase', config: {}, enabled: true }
      ]
    });

    // Security breach attempt
    this.rules.set('security_breach', {
      id: 'security_breach',
      name: 'Security Breach Attempt',
      condition: (context) => context.suspiciousActivity === true,
      severity: 'critical',
      cooldownMinutes: 1,
      channels: [
        { type: 'firebase', config: {}, enabled: true }
      ]
    });
  }

  public createAlert(alert: Omit<Alert, 'id' | 'timestamp'>): string {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullAlert: Alert = {
      ...alert,
      id: alertId,
      timestamp: new Date()
    };

    this.alerts.set(alertId, fullAlert);
    this.processAlert(fullAlert);

    return alertId;
  }

  private async processAlert(alert: Alert): Promise<void> {
    // Log the alert
    const logMethod = alert.type === 'critical' ? 'critical' : 
                     alert.type === 'warning' ? 'warn' : 'info';
    
    productionLogger[logMethod](
      `Alert: ${alert.title}`,
      {
        alertId: alert.id,
        alertType: alert.type,
        source: alert.source,
        message: alert.message,
        context: alert.context
      }
    );

    // Send notifications based on alert type
    await this.sendNotifications(alert);
  }

  private async sendNotifications(alert: Alert): Promise<void> {
    try {
      // For now, we'll use Firebase Functions logging as the primary channel
      // In production, integrate with actual notification services
      
      if (alert.type === 'critical') {
        // Send immediate notifications for critical alerts
        await this.sendFirebaseNotification(alert);
      } else if (alert.type === 'warning') {
        // Send notifications with some delay for warnings
        setTimeout(() => this.sendFirebaseNotification(alert), 5000);
      }
    } catch (error) {
      productionLogger.error('Failed to send alert notifications', {
        alertId: alert.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async sendFirebaseNotification(alert: Alert): Promise<void> {
    // Use Firebase Functions structured logging for alerts
    productionLogger.info('ALERT_NOTIFICATION', {
      alert: {
        id: alert.id,
        type: alert.type,
        title: alert.title,
        message: alert.message,
        source: alert.source,
        timestamp: alert.timestamp.toISOString(),
        context: alert.context
      }
    });
  }

  public checkRules(context: Record<string, any>): void {
    for (const [ruleId, rule] of this.rules) {
      try {
        if (rule.condition(context)) {
          // Check cooldown
          const lastAlert = this.lastAlertTime.get(ruleId);
          const now = new Date();
          
          if (lastAlert) {
            const minutesSinceLastAlert = (now.getTime() - lastAlert.getTime()) / (1000 * 60);
            if (minutesSinceLastAlert < rule.cooldownMinutes) {
              continue; // Skip due to cooldown
            }
          }

          // Create alert
          this.createAlert({
            type: rule.severity === 'critical' ? 'critical' : 'warning',
            title: rule.name,
            message: `Alert rule triggered: ${rule.name}`,
            source: 'alerting-system',
            context: { rule: ruleId, ...context }
          });

          this.lastAlertTime.set(ruleId, now);
        }
      } catch (error) {
        productionLogger.error('Error checking alert rule', {
          ruleId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  public resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = new Date();

    productionLogger.info('Alert resolved', {
      alertId,
      resolvedAt: alert.resolvedAt.toISOString()
    });

    return true;
  }

  public getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values())
      .filter(alert => !alert.resolved)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  public getAlertHistory(hours: number = 24): Alert[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return Array.from(this.alerts.values())
      .filter(alert => alert.timestamp >= cutoff)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Convenience methods for common alerts
  public alertHighErrorRate(errorRate: number, source: string): void {
    this.checkRules({ errorRate, source });
  }

  public alertPaymentFailure(failureRate: number, source: string): void {
    this.checkRules({ paymentFailureRate: failureRate, source });
  }

  public alertAIServiceIssue(availability: number, source: string): void {
    this.checkRules({ aiServiceAvailability: availability, source });
  }

  public alertSecurityBreach(details: Record<string, any>, source: string): void {
    this.checkRules({ suspiciousActivity: true, ...details, source });
  }

  public alertDatabaseIssue(errorRate: number, source: string): void {
    this.checkRules({ databaseErrorRate: errorRate, source });
  }
}

// Export singleton instance
export const alertingSystem = AlertingSystem.getInstance();