/**
 * Performance Monitoring and Alerting System
 * Tracks system performance and triggers alerts for anomalies
 */

import { productionLogger } from './production-logger';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface PerformanceThreshold {
  metric: string;
  warning: number;
  critical: number;
  unit: string;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private thresholds: Map<string, PerformanceThreshold> = new Map();
  private timers: Map<string, number> = new Map();

  private constructor() {
    this.setupDefaultThresholds();
    this.startPeriodicReporting();
  }

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  private setupDefaultThresholds(): void {
    // API Response Time Thresholds
    this.thresholds.set('api_response_time', {
      metric: 'api_response_time',
      warning: 2000, // 2 seconds
      critical: 5000, // 5 seconds
      unit: 'ms'
    });

    // Credit Operation Thresholds
    this.thresholds.set('credit_operation_time', {
      metric: 'credit_operation_time',
      warning: 1000, // 1 second
      critical: 3000, // 3 seconds
      unit: 'ms'
    });

    // AI Response Time Thresholds
    this.thresholds.set('ai_response_time', {
      metric: 'ai_response_time',
      warning: 10000, // 10 seconds
      critical: 30000, // 30 seconds
      unit: 'ms'
    });

    // Payment Processing Thresholds
    this.thresholds.set('payment_processing_time', {
      metric: 'payment_processing_time',
      warning: 5000, // 5 seconds
      critical: 15000, // 15 seconds
      unit: 'ms'
    });

    // Memory Usage Thresholds
    this.thresholds.set('memory_usage', {
      metric: 'memory_usage',
      warning: 80, // 80%
      critical: 95, // 95%
      unit: '%'
    });

    // Error Rate Thresholds
    this.thresholds.set('error_rate', {
      metric: 'error_rate',
      warning: 5, // 5%
      critical: 10, // 10%
      unit: '%'
    });
  }

  public startTimer(operationId: string): void {
    this.timers.set(operationId, Date.now());
  }

  public endTimer(operationId: string, metricName: string, tags?: Record<string, string>): number {
    const startTime = this.timers.get(operationId);
    if (!startTime) {
      productionLogger.warn('Timer not found for operation', { operationId });
      return 0;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(operationId);

    this.recordMetric({
      name: metricName,
      value: duration,
      unit: 'ms',
      timestamp: new Date(),
      tags
    });

    return duration;
  }

  public recordMetric(metric: PerformanceMetric): void {
    // Store metric
    if (!this.metrics.has(metric.name)) {
      this.metrics.set(metric.name, []);
    }
    
    const metricHistory = this.metrics.get(metric.name)!;
    metricHistory.push(metric);

    // Keep only last 100 metrics per type
    if (metricHistory.length > 100) {
      metricHistory.shift();
    }

    // Check thresholds
    this.checkThresholds(metric);

    // Log metric
    productionLogger.logPerformanceMetric(metric.name, metric.value, {
      unit: metric.unit,
      tags: metric.tags
    });
  }

  private checkThresholds(metric: PerformanceMetric): void {
    const threshold = this.thresholds.get(metric.name);
    if (!threshold) return;

    if (metric.value >= threshold.critical) {
      productionLogger.critical(
        `Performance critical threshold exceeded: ${metric.name}`,
        {
          metric: metric.name,
          value: metric.value,
          threshold: threshold.critical,
          unit: metric.unit,
          tags: metric.tags
        }
      );
    } else if (metric.value >= threshold.warning) {
      productionLogger.warn(
        `Performance warning threshold exceeded: ${metric.name}`,
        {
          metric: metric.name,
          value: metric.value,
          threshold: threshold.warning,
          unit: metric.unit,
          tags: metric.tags
        }
      );
    }
  }

  public getMetricSummary(metricName: string, minutes: number = 5): any {
    const metrics = this.metrics.get(metricName) || [];
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const recentMetrics = metrics.filter(m => m.timestamp >= cutoff);

    if (recentMetrics.length === 0) {
      return null;
    }

    const values = recentMetrics.map(m => m.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    return {
      count: recentMetrics.length,
      average: avg,
      minimum: min,
      maximum: max,
      unit: recentMetrics[0].unit,
      timeWindow: `${minutes} minutes`
    };
  }

  public getSystemHealth(): any {
    const now = new Date();
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    // Calculate memory usage percentage (assuming 512MB limit for Cloud Functions)
    const memoryLimitMB = 512;
    const memoryUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const memoryPercentage = (memoryUsedMB / memoryLimitMB) * 100;

    // Record memory metric
    this.recordMetric({
      name: 'memory_usage',
      value: memoryPercentage,
      unit: '%',
      timestamp: now
    });

    return {
      timestamp: now.toISOString(),
      uptime: uptime,
      memory: {
        used: memoryUsedMB,
        limit: memoryLimitMB,
        percentage: memoryPercentage,
        heap: {
          used: memoryUsage.heapUsed,
          total: memoryUsage.heapTotal
        }
      },
      metrics: {
        apiResponseTime: this.getMetricSummary('api_response_time'),
        creditOperationTime: this.getMetricSummary('credit_operation_time'),
        aiResponseTime: this.getMetricSummary('ai_response_time'),
        paymentProcessingTime: this.getMetricSummary('payment_processing_time')
      }
    };
  }

  private startPeriodicReporting(): void {
    // Report system health every 5 minutes
    setInterval(() => {
      const health = this.getSystemHealth();
      productionLogger.info('System health report', {
        component: 'performance-monitor',
        health
      });
    }, 5 * 60 * 1000); // 5 minutes
  }

  // Convenience methods for common operations
  public measureApiCall<T>(operation: () => Promise<T>, endpoint: string): Promise<T> {
    const operationId = `api_${Date.now()}_${Math.random()}`;
    this.startTimer(operationId);

    return operation()
      .then(result => {
        this.endTimer(operationId, 'api_response_time', { endpoint });
        return result;
      })
      .catch(error => {
        this.endTimer(operationId, 'api_response_time', { endpoint, error: 'true' });
        throw error;
      });
  }

  public measureCreditOperation<T>(operation: () => Promise<T>, operationType: string): Promise<T> {
    const operationId = `credit_${Date.now()}_${Math.random()}`;
    this.startTimer(operationId);

    return operation()
      .then(result => {
        this.endTimer(operationId, 'credit_operation_time', { operation: operationType });
        return result;
      })
      .catch(error => {
        this.endTimer(operationId, 'credit_operation_time', { operation: operationType, error: 'true' });
        throw error;
      });
  }

  public measureAIOperation<T>(operation: () => Promise<T>, model: string): Promise<T> {
    const operationId = `ai_${Date.now()}_${Math.random()}`;
    this.startTimer(operationId);

    return operation()
      .then(result => {
        this.endTimer(operationId, 'ai_response_time', { model });
        return result;
      })
      .catch(error => {
        this.endTimer(operationId, 'ai_response_time', { model, error: 'true' });
        throw error;
      });
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();