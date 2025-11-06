/**
 * System Monitoring Service
 * Monitors system health, performance, and triggers alerts
 */

import {
  NotificationService,
  NotificationRequest,
  NotificationType,
  NotificationChannel,
  NotificationPriority
} from '../types';
import { IStructuredLogger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';
import { Firestore } from 'firebase-admin/firestore';
import { Database } from 'firebase-admin/database';

export interface SystemHealthMetrics {
  timestamp: Date;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  activeConnections: number;
  requestsPerMinute: number;
  errorRate: number;
  averageResponseTime: number;
  queueDepth: number;
  creditSystemHealth: CreditSystemHealth;
  modelPerformance: ModelPerformanceMetrics[];
  paymentSystemHealth: PaymentSystemHealth;
}

export interface CreditSystemHealth {
  balanceAccuracy: number;
  transactionProcessingTime: number;
  ledgerIntegrity: boolean;
  fraudDetectionAlerts: number;
  failedTransactions: number;
  pendingTransactions: number;
}

export interface ModelPerformanceMetrics {
  modelId: string;
  availability: number;
  averageLatency: number;
  errorRate: number;
  throughput: number;
  costEfficiency: number;
  userSatisfaction: number;
}

export interface PaymentSystemHealth {
  successRate: number;
  averageProcessingTime: number;
  failedPayments: number;
  pendingPayments: number;
  providerStatus: Record<string, ProviderStatus>;
}

export interface ProviderStatus {
  name: string;
  available: boolean;
  latency: number;
  errorRate: number;
  lastCheck: Date;
}

export interface AlertThreshold {
  id: string;
  name: string;
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
  severity: AlertSeverity;
  enabled: boolean;
  cooldownMinutes: number;
  recipients: string[];
  channels: NotificationChannel[];
  createdAt: Date;
  updatedAt: Date;
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface SystemAlert {
  id: string;
  thresholdId: string;
  metric: string;
  currentValue: number;
  thresholdValue: number;
  severity: AlertSeverity;
  message: string;
  triggeredAt: Date;
  resolvedAt?: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export interface ISystemMonitoringService {
  // Health monitoring
  collectSystemMetrics(): Promise<SystemHealthMetrics>;
  getSystemHealth(): Promise<SystemHealthStatus>;
  
  // Alert management
  createAlertThreshold(threshold: Omit<AlertThreshold, 'id' | 'createdAt' | 'updatedAt'>): Promise<AlertThreshold>;
  updateAlertThreshold(thresholdId: string, updates: Partial<AlertThreshold>): Promise<AlertThreshold>;
  deleteAlertThreshold(thresholdId: string): Promise<boolean>;
  getAlertThresholds(): Promise<AlertThreshold[]>;
  
  // Alert processing
  checkThresholds(metrics: SystemHealthMetrics): Promise<SystemAlert[]>;
  acknowledgeAlert(alertId: string, userId: string): Promise<boolean>;
  resolveAlert(alertId: string, userId: string): Promise<boolean>;
  getActiveAlerts(): Promise<SystemAlert[]>;
  
  // Fraud detection
  detectFraudulentActivity(): Promise<FraudAlert[]>;
  
  // Performance monitoring
  monitorModelPerformance(): Promise<ModelPerformanceAlert[]>;
}

export enum SystemHealthStatus {
  HEALTHY = 'healthy',
  WARNING = 'warning',
  CRITICAL = 'critical',
  DOWN = 'down'
}

export interface FraudAlert {
  id: string;
  userId: string;
  type: FraudType;
  description: string;
  riskScore: number;
  evidence: Record<string, any>;
  triggeredAt: Date;
  status: FraudAlertStatus;
}

export enum FraudType {
  UNUSUAL_SPENDING = 'unusual_spending',
  RAPID_TRANSACTIONS = 'rapid_transactions',
  SUSPICIOUS_LOCATION = 'suspicious_location',
  ACCOUNT_TAKEOVER = 'account_takeover',
  PAYMENT_FRAUD = 'payment_fraud'
}

export enum FraudAlertStatus {
  ACTIVE = 'active',
  INVESTIGATING = 'investigating',
  RESOLVED = 'resolved',
  FALSE_POSITIVE = 'false_positive'
}

export interface ModelPerformanceAlert {
  id: string;
  modelId: string;
  type: ModelAlertType;
  description: string;
  currentValue: number;
  thresholdValue: number;
  triggeredAt: Date;
  status: AlertStatus;
}

export enum ModelAlertType {
  HIGH_LATENCY = 'high_latency',
  HIGH_ERROR_RATE = 'high_error_rate',
  LOW_AVAILABILITY = 'low_availability',
  POOR_PERFORMANCE = 'poor_performance'
}

export enum AlertStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved'
}

export class SystemMonitoringService implements ISystemMonitoringService {
  private _firestore: Firestore;
  private realtimeDb: Database;
  private logger: IStructuredLogger;
  private _metrics: IMetricsCollector;
  private notificationService: NotificationService;
  private alertCooldowns: Map<string, Date> = new Map();

  constructor(
    firestore: Firestore,
    realtimeDb: Database,
    logger: IStructuredLogger,
    metrics: IMetricsCollector,
    notificationService: NotificationService
  ) {
    this.firestore = firestore;
    this.realtimeDb = realtimeDb;
    this.logger = logger;
    this.metrics = metrics;
    this.notificationService = notificationService;
  }

  async collectSystemMetrics(): Promise<SystemHealthMetrics> {
    try {
      const timestamp = new Date();

      // Collect system metrics (in a real implementation, these would come from monitoring tools)
      const systemMetrics = await this.getSystemResourceMetrics();
      const creditHealth = await this.getCreditSystemHealth();
      const modelPerformance = await this.getModelPerformanceMetrics();
      const paymentHealth = await this.getPaymentSystemHealth();

      const metrics: SystemHealthMetrics = {
        timestamp,
        ...systemMetrics,
        creditSystemHealth: creditHealth,
        modelPerformance,
        paymentSystemHealth: paymentHealth
      };

      // Store metrics for historical analysis
      await this.storeMetrics(metrics);

      return metrics;

    } catch (error) {
      this.logger.error('Failed to collect system metrics', error);
      throw error;
    }
  }

  async getSystemHealth(): Promise<SystemHealthStatus> {
    try {
      const metrics = await this.collectSystemMetrics();
      
      // Determine overall health based on various factors
      if (metrics.errorRate > 10 || metrics.creditSystemHealth.failedTransactions > 100) {
        return SystemHealthStatus.CRITICAL;
      }
      
      if (metrics.errorRate > 5 || metrics.averageResponseTime > 5000 || 
          metrics.creditSystemHealth.fraudDetectionAlerts > 10) {
        return SystemHealthStatus.WARNING;
      }
      
      if (metrics.cpuUsage > 90 || metrics.memoryUsage > 90) {
        return SystemHealthStatus.WARNING;
      }

      return SystemHealthStatus.HEALTHY;

    } catch (error) {
      this.logger.error('Failed to get system health', error);
      return SystemHealthStatus.DOWN;
    }
  }

  async createAlertThreshold(thresholdData: Omit<AlertThreshold, 'id' | 'createdAt' | 'updatedAt'>): Promise<AlertThreshold> {
    try {
      const threshold: AlertThreshold = {
        ...thresholdData,
        id: this.firestore.collection('alert_thresholds').doc().id,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.firestore.collection('alert_thresholds').doc(threshold.id).set(threshold);

      this.logger.info('Alert threshold created', { thresholdId: threshold.id, metric: threshold.metric });
      return threshold;

    } catch (error) {
      this.logger.error('Failed to create alert threshold', { error: error instanceof Error ? error.message : 'Unknown error',  thresholdData });
      throw error;
    }
  }

  async updateAlertThreshold(thresholdId: string, updates: Partial<AlertThreshold>): Promise<AlertThreshold> {
    try {
      const thresholdRef = this.firestore.collection('alert_thresholds').doc(thresholdId);
      const thresholdDoc = await thresholdRef.get();

      if (!thresholdDoc.exists) {
        throw new Error('Alert threshold not found');
      }

      const currentThreshold = thresholdDoc.data() as AlertThreshold;
      const updatedThreshold: AlertThreshold = {
        ...currentThreshold,
        ...updates,
        id: thresholdId,
        updatedAt: new Date()
      };

      await thresholdRef.update(updatedThreshold);

      this.logger.info('Alert threshold updated', { thresholdId });
      return updatedThreshold;

    } catch (error) {
      this.logger.error('Failed to update alert threshold', { error: error instanceof Error ? error.message : 'Unknown error',  thresholdId, updates });
      throw error;
    }
  }

  async deleteAlertThreshold(thresholdId: string): Promise<boolean> {
    try {
      const thresholdRef = this.firestore.collection('alert_thresholds').doc(thresholdId);
      const thresholdDoc = await thresholdRef.get();

      if (!thresholdDoc.exists) {
        return false;
      }

      await thresholdRef.delete();

      this.logger.info('Alert threshold deleted', { thresholdId });
      return true;

    } catch (error) {
      this.logger.error('Failed to delete alert threshold', { error: error instanceof Error ? error.message : 'Unknown error',  thresholdId });
      return false;
    }
  }

  async getAlertThresholds(): Promise<AlertThreshold[]> {
    try {
      const snapshot = await this.firestore.collection('alert_thresholds').get();
      return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as AlertThreshold));

    } catch (error) {
      this.logger.error('Failed to get alert thresholds', error);
      throw error;
    }
  }

  async checkThresholds(metrics: SystemHealthMetrics): Promise<SystemAlert[]> {
    try {
      const thresholds = await this.getAlertThresholds();
      const triggeredAlerts: SystemAlert[] = [];

      for (const threshold of thresholds) {
        if (!threshold.enabled) continue;

        // Check if threshold is in cooldown
        const cooldownKey = `${threshold.id}`;
        const lastTriggered = this.alertCooldowns.get(cooldownKey);
        if (lastTriggered && Date.now() - lastTriggered.getTime() < threshold.cooldownMinutes * 60 * 1000) {
          continue;
        }

        const currentValue = this.getMetricValue(metrics, threshold.metric);
        if (currentValue === null) continue;

        const isTriggered = this.evaluateThreshold(currentValue, threshold.operator, threshold.value);

        if (isTriggered) {
          const alert = await this.createAlert(threshold, currentValue);
          triggeredAlerts.push(alert);
          
          // Set cooldown
          this.alertCooldowns.set(cooldownKey, new Date());

          // Send notifications
          await this.sendAlertNotifications(alert, threshold);
        }
      }

      return triggeredAlerts;

    } catch (error) {
      this.logger.error('Failed to check thresholds', error);
      throw error;
    }
  }

  async acknowledgeAlert(alertId: string, userId: string): Promise<boolean> {
    try {
      const alertRef = this.firestore.collection('system_alerts').doc(alertId);
      const alertDoc = await alertRef.get();

      if (!alertDoc.exists) {
        return false;
      }

      await alertRef.update({
        acknowledged: true,
        acknowledgedBy: userId,
        acknowledgedAt: new Date()
      });

      this.logger.info('Alert acknowledged', { alertId, userId });
      return true;

    } catch (error) {
      this.logger.error('Failed to acknowledge alert', { error: error instanceof Error ? error.message : 'Unknown error',  alertId, userId });
      return false;
    }
  }

  async resolveAlert(alertId: string, userId: string): Promise<boolean> {
    try {
      const alertRef = this.firestore.collection('system_alerts').doc(alertId);
      const alertDoc = await alertRef.get();

      if (!alertDoc.exists) {
        return false;
      }

      await alertRef.update({
        resolvedAt: new Date()
      });

      this.logger.info('Alert resolved', { alertId, userId });
      return true;

    } catch (error) {
      this.logger.error('Failed to resolve alert', { error: error instanceof Error ? error.message : 'Unknown error',  alertId, userId });
      return false;
    }
  }

  async getActiveAlerts(): Promise<SystemAlert[]> {
    try {
      const snapshot = await this.firestore.collection('system_alerts')
        .where('resolvedAt', '==', null)
        .orderBy('triggeredAt', 'desc')
        .get();

      return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as SystemAlert));

    } catch (error) {
      this.logger.error('Failed to get active alerts', error);
      throw error;
    }
  }

  async detectFraudulentActivity(): Promise<FraudAlert[]> {
    try {
      const fraudAlerts: FraudAlert[] = [];

      // Check for unusual spending patterns
      const unusualSpending = await this.detectUnusualSpending();
      fraudAlerts.push(...unusualSpending);

      // Check for rapid transactions
      const rapidTransactions = await this.detectRapidTransactions();
      fraudAlerts.push(...rapidTransactions);

      // Check for suspicious locations
      const suspiciousLocations = await this.detectSuspiciousLocations();
      fraudAlerts.push(...suspiciousLocations);

      // Store fraud alerts
      for (const alert of fraudAlerts) {
        await this.storeFraudAlert(alert);
        await this.sendFraudNotification(alert);
      }

      return fraudAlerts;

    } catch (error) {
      this.logger.error('Failed to detect fraudulent activity', error);
      throw error;
    }
  }

  async monitorModelPerformance(): Promise<ModelPerformanceAlert[]> {
    try {
      const performanceAlerts: ModelPerformanceAlert[] = [];
      const modelMetrics = await this.getModelPerformanceMetrics();

      for (const model of modelMetrics) {
        // Check latency
        if (model.averageLatency > 5000) {
          performanceAlerts.push(await this.createModelAlert(
            model.modelId,
            ModelAlertType.HIGH_LATENCY,
            `Model ${model.modelId} has high latency: ${model.averageLatency}ms`,
            model.averageLatency,
            5000
          ));
        }

        // Check error rate
        if (model.errorRate > 5) {
          performanceAlerts.push(await this.createModelAlert(
            model.modelId,
            ModelAlertType.HIGH_ERROR_RATE,
            `Model ${model.modelId} has high error rate: ${model.errorRate}%`,
            model.errorRate,
            5
          ));
        }

        // Check availability
        if (model.availability < 95) {
          performanceAlerts.push(await this.createModelAlert(
            model.modelId,
            ModelAlertType.LOW_AVAILABILITY,
            `Model ${model.modelId} has low availability: ${model.availability}%`,
            model.availability,
            95
          ));
        }
      }

      return performanceAlerts;

    } catch (error) {
      this.logger.error('Failed to monitor model performance', error);
      throw error;
    }
  }

  // Private helper methods
  private async getSystemResourceMetrics(): Promise<Partial<SystemHealthMetrics>> {
    // In a real implementation, these would come from system monitoring tools
    return {
      cpuUsage: Math.random() * 100,
      memoryUsage: Math.random() * 100,
      diskUsage: Math.random() * 100,
      activeConnections: Math.floor(Math.random() * 1000),
      requestsPerMinute: Math.floor(Math.random() * 10000),
      errorRate: Math.random() * 10,
      averageResponseTime: Math.random() * 2000,
      queueDepth: Math.floor(Math.random() * 100)
    };
  }

  private async getCreditSystemHealth(): Promise<CreditSystemHealth> {
    // Query credit system metrics from database
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const transactionsQuery = await this.firestore.collection('credit_transactions')
      .where('timestamp', '>=', oneHourAgo)
      .get();

    const failedTransactions = transactionsQuery.docs.filter(doc => 
      doc.data().status === 'failed'
    ).length;

    const pendingTransactions = transactionsQuery.docs.filter(doc => 
      doc.data().status === 'pending'
    ).length;

    return {
      balanceAccuracy: 99.9, // Would be calculated based on ledger verification
      transactionProcessingTime: 150, // Average processing time in ms
      ledgerIntegrity: true, // Would be verified through hash chain validation
      fraudDetectionAlerts: 0, // Would be counted from fraud detection system
      failedTransactions,
      pendingTransactions
    };
  }

  private async getModelPerformanceMetrics(): Promise<ModelPerformanceMetrics[]> {
    // Query model performance from analytics
    const modelsQuery = await this.firestore.collection('available_models').get();
    const metrics: ModelPerformanceMetrics[] = [];

    for (const modelDoc of modelsQuery.docs) {
      const modelData = modelDoc.data();
      
      metrics.push({
        modelId: modelDoc.id,
        availability: modelData.performance?.availability || 99,
        averageLatency: modelData.performance?.averageLatency || 1000,
        errorRate: modelData.performance?.errorRate || 1,
        throughput: modelData.performance?.throughput || 100,
        costEfficiency: modelData.performance?.costEfficiency || 8.5,
        userSatisfaction: modelData.performance?.userSatisfaction || 9.0
      });
    }

    return metrics;
  }

  private async getPaymentSystemHealth(): Promise<PaymentSystemHealth> {
    // Query payment system metrics
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const paymentsQuery = await this.firestore.collection('payments')
      .where('timestamp', '>=', oneHourAgo)
      .get();

    const totalPayments = paymentsQuery.size;
    const successfulPayments = paymentsQuery.docs.filter(doc => 
      doc.data().status === 'completed'
    ).length;
    const failedPayments = paymentsQuery.docs.filter(doc => 
      doc.data().status === 'failed'
    ).length;
    const pendingPayments = paymentsQuery.docs.filter(doc => 
      doc.data().status === 'pending'
    ).length;

    return {
      successRate: totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 100,
      averageProcessingTime: 2000, // Would be calculated from actual data
      failedPayments,
      pendingPayments,
      providerStatus: {
        stripe: {
          name: 'Stripe',
          available: true,
          latency: 500,
          errorRate: 0.1,
          lastCheck: new Date()
        },
        paypal: {
          name: 'PayPal',
          available: true,
          latency: 800,
          errorRate: 0.2,
          lastCheck: new Date()
        }
      }
    };
  }

  private async storeMetrics(metrics: SystemHealthMetrics): Promise<void> {
    // Store in Firestore for historical analysis
    await this.firestore.collection('system_metrics').add(metrics);

    // Store in Realtime Database for real-time monitoring
    await this.realtimeDb.ref('system_health/current').set({
      timestamp: metrics.timestamp.toISOString(),
      status: await this.getSystemHealth(),
      cpuUsage: metrics.cpuUsage,
      memoryUsage: metrics.memoryUsage,
      errorRate: metrics.errorRate,
      responseTime: metrics.averageResponseTime
    });
  }

  private getMetricValue(metrics: SystemHealthMetrics, metricPath: string): number | null {
    const parts = metricPath.split('.');
    let value: any = metrics;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }
    
    return typeof value === 'number' ? value : null;
  }

  private evaluateThreshold(currentValue: number, operator: string, thresholdValue: number): boolean {
    switch (operator) {
      case 'gt': return currentValue > thresholdValue;
      case 'gte': return currentValue >= thresholdValue;
      case 'lt': return currentValue < thresholdValue;
      case 'lte': return currentValue <= thresholdValue;
      case 'eq': return currentValue === thresholdValue;
      default: return false;
    }
  }

  private async createAlert(threshold: AlertThreshold, currentValue: number): Promise<SystemAlert> {
    const alert: SystemAlert = {
      id: this.firestore.collection('system_alerts').doc().id,
      thresholdId: threshold.id,
      metric: threshold.metric,
      currentValue,
      thresholdValue: threshold.value,
      severity: threshold.severity,
      message: `${threshold.name}: ${threshold.metric} is ${currentValue} (threshold: ${threshold.value})`,
      triggeredAt: new Date(),
      acknowledged: false
    };

    await this.firestore.collection('system_alerts').doc(alert.id).set(alert);
    return alert;
  }

  private async sendAlertNotifications(alert: SystemAlert, threshold: AlertThreshold): Promise<void> {
    const priority = this.mapSeverityToPriority(alert.severity);
    
    for (const userId of threshold.recipients) {
      const notificationRequest: NotificationRequest = {
        userId,
        type: NotificationType.SYSTEM_MAINTENANCE, // Could be more specific
        title: `System Alert: ${threshold.name}`,
        message: alert.message,
        data: {
          alertId: alert.id,
          metric: alert.metric,
          currentValue: alert.currentValue,
          thresholdValue: alert.thresholdValue,
          severity: alert.severity
        },
        channels: threshold.channels,
        priority
      };

      await this.notificationService.sendNotification(notificationRequest);
    }
  }

  private mapSeverityToPriority(severity: AlertSeverity): NotificationPriority {
    switch (severity) {
      case AlertSeverity.LOW: return NotificationPriority.LOW;
      case AlertSeverity.MEDIUM: return NotificationPriority.NORMAL;
      case AlertSeverity.HIGH: return NotificationPriority.HIGH;
      case AlertSeverity.CRITICAL: return NotificationPriority.URGENT;
      default: return NotificationPriority.NORMAL;
    }
  }

  private async detectUnusualSpending(): Promise<FraudAlert[]> {
    // Implementation would analyze spending patterns
    return [];
  }

  private async detectRapidTransactions(): Promise<FraudAlert[]> {
    // Implementation would detect rapid transaction patterns
    return [];
  }

  private async detectSuspiciousLocations(): Promise<FraudAlert[]> {
    // Implementation would analyze location patterns
    return [];
  }

  private async storeFraudAlert(alert: FraudAlert): Promise<void> {
    await this.firestore.collection('fraud_alerts').doc(alert.id).set(alert);
  }

  private async sendFraudNotification(alert: FraudAlert): Promise<void> {
    const notificationRequest: NotificationRequest = {
      userId: alert.userId,
      type: NotificationType.SECURITY_ALERT,
      title: 'Security Alert: Suspicious Activity Detected',
      message: alert.description,
      data: {
        fraudAlertId: alert.id,
        fraudType: alert.type,
        riskScore: alert.riskScore
      },
      channels: [NotificationChannel.EMAIL, NotificationChannel.PUSH, NotificationChannel.SMS],
      priority: NotificationPriority.URGENT
    };

    await this.notificationService.sendNotification(notificationRequest);
  }

  private async createModelAlert(
    modelId: string,
    type: ModelAlertType,
    description: string,
    currentValue: number,
    thresholdValue: number
  ): Promise<ModelPerformanceAlert> {
    const alert: ModelPerformanceAlert = {
      id: this.firestore.collection('model_alerts').doc().id,
      modelId,
      type,
      description,
      currentValue,
      thresholdValue,
      triggeredAt: new Date(),
      status: AlertStatus.ACTIVE
    };

    await this.firestore.collection('model_alerts').doc(alert.id).set(alert);
    return alert;
  }
}