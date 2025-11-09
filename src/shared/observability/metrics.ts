/**
 * Metrics Collection
 * Performance and usage metrics tracking
 */

export interface IMetricsCollector {
  // Core metrics methods - standardized interface
  incrementCounter(name: string, labels?: Record<string, string>): void;
  recordValue(name: string, value: number, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  recordGauge(name: string, value: number | (() => number), labels?: Record<string, string>): void;
  
  // Specialized metrics for common use cases
  recordHttpRequest(metric: HttpRequestMetric): void;
  recordCreditOperation(metric: CreditOperationMetric): void;
  recordPayment(metric: PaymentMetric): void;
  
  // Metrics management
  getMetrics(type?: string): any[];
  clearMetrics(type?: string): void;
  
  // Legacy methods for backward compatibility - will be deprecated
  /** @deprecated Use incrementCounter instead */
  increment(name: string, value?: number, labels?: Record<string, string>): void;
  /** @deprecated Use incrementCounter instead */
  counter(name: string, value?: number, labels?: Record<string, string>): void;
  /** @deprecated Use recordHistogram instead */
  histogram(name: string, value: number, labels?: Record<string, string>): void;
  /** @deprecated Use recordGauge instead */
  gauge(name: string, value: number | (() => number), labels?: Record<string, string>): void;
}

export interface HttpRequestMetric {
  method: string;
  route: string;
  statusCode: number;
  duration: number;
  userId?: string;
}

export interface CreditOperationMetric {
  operation: 'deduction' | 'addition' | 'balance_check';
  amount?: number;
  userId: string;
  success: boolean;
  duration: number;
}

export interface PaymentMetric {
  method: 'stripe' | 'crypto' | 'paypal';
  amount: number;
  currency: string;
  success: boolean;
  userId: string;
}

export interface MetricEntry {
  type: string;
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: string;
}

/**
 * Base metrics collector interface for consistent metrics collection
 */
export interface IBaseMetricsCollector {
  incrementCounter(name: string, labels?: Record<string, string>): void;
  recordValue(name: string, value: number, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  recordGauge(name: string, value: number | (() => number), labels?: Record<string, string>): void;
}

/**
 * Abstract base class for metrics collection following OOP principles
 */
abstract class BaseMetricsCollector implements IBaseMetricsCollector {
  protected readonly serviceName: string;
  protected readonly environment: string;
  
  constructor(serviceName: string, environment: string = 'development') {
    this.serviceName = serviceName;
    this.environment = environment;
  }

  incrementCounter(name: string, labels?: Record<string, string>): void {
    this.logMetric('counter', name, 1, this.enrichLabels(labels));
  }

  recordValue(name: string, value: number, labels?: Record<string, string>): void {
    this.logMetric('value', name, value, this.enrichLabels(labels));
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    this.logMetric('histogram', name, value, this.enrichLabels(labels));
  }

  recordGauge(name: string, value: number | (() => number), labels?: Record<string, string>): void {
    const actualValue = typeof value === 'function' ? value() : value;
    this.logMetric('gauge', name, actualValue, this.enrichLabels(labels));
  }

  /**
   * Enrich labels with service context
   */
  protected enrichLabels(labels?: Record<string, string>): Record<string, string> {
    return {
      service: this.serviceName,
      environment: this.environment,
      ...(labels || {})
    };
  }

  /**
   * Abstract method for metric logging - to be implemented by concrete classes
   */
  protected abstract logMetric(type: string, name: string, value: number, labels: Record<string, string>): void;
}

/**
 * Production-ready metrics collector with performance optimizations
 */
class MetricsCollector extends BaseMetricsCollector implements IMetricsCollector {
  private metrics: Map<string, any[]> = new Map();
  private batchBuffer: MetricEntry[] = [];
  private batchSize: number = 100;
  private flushInterval: number = 5000; // 5 seconds
  private flushTimer?: NodeJS.Timeout;

  constructor() {
    super('firebase-functions', process.env.NODE_ENV || 'development');
    this.startBatchFlushing();
  }

  // Core standardized methods (inherited from BaseMetricsCollector)

  // Legacy methods for backward compatibility
  increment(name: string, value: number = 1, labels?: Record<string, string>): void {
    this.logMetric('counter', name, value, this.enrichLabels(labels));
  }

  counter(name: string, value: number = 1, labels?: Record<string, string>): void {
    this.logMetric('counter', name, value, this.enrichLabels(labels));
  }

  histogram(name: string, value: number, labels?: Record<string, string>): void {
    this.recordHistogram(name, value, labels);
  }

  gauge(name: string, value: number | (() => number), labels?: Record<string, string>): void {
    this.recordGauge(name, value, labels);
  }

  /**
   * Optimized metric logging with batching for performance
   */
  protected logMetric(type: string, name: string, value: number, labels: Record<string, string>): void {
    const entry: MetricEntry = {
      type,
      name,
      value,
      labels,
      timestamp: new Date().toISOString()
    };

    // Add to batch buffer for performance
    this.batchBuffer.push(entry);

    // Flush immediately if batch is full
    if (this.batchBuffer.length >= this.batchSize) {
      this.flushBatch();
    }
  }

  /**
   * Start automatic batch flushing
   */
  private startBatchFlushing(): void {
    this.flushTimer = setInterval(() => {
      if (this.batchBuffer.length > 0) {
        this.flushBatch();
      }
    }, this.flushInterval);
  }

  /**
   * Flush batch of metrics to output
   */
  private flushBatch(): void {
    if (this.batchBuffer.length === 0) return;

    const batch = [...this.batchBuffer];
    this.batchBuffer = [];

    // Log batch as single JSON array for better performance
    console.log(JSON.stringify({
      type: 'metrics_batch',
      count: batch.length,
      metrics: batch,
      flushed_at: new Date().toISOString()
    }));
  }

  recordHttpRequest(metric: HttpRequestMetric): void {
    const key = 'http_requests';
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    this.metrics.get(key)!.push({
      ...metric,
      timestamp: Date.now()
    });

    // Record as structured metric
    this.recordValue('http_request_duration', metric.duration, {
      method: metric.method,
      route: metric.route,
      status_code: metric.statusCode.toString(),
      user_id: metric.userId || 'anonymous'
    });

    this.incrementCounter('http_requests_total', {
      method: metric.method,
      route: metric.route,
      status_code: metric.statusCode.toString()
    });
  }

  recordCreditOperation(metric: CreditOperationMetric): void {
    const key = 'credit_operations';
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    this.metrics.get(key)!.push({
      ...metric,
      timestamp: Date.now()
    });

    // Record as structured metrics
    if (metric.amount) {
      this.recordValue('credit_operation_amount', metric.amount, {
        operation: metric.operation,
        success: metric.success.toString(),
        user_id: metric.userId
      });
    }

    this.recordValue('credit_operation_duration', metric.duration, {
      operation: metric.operation,
      success: metric.success.toString(),
      user_id: metric.userId
    });

    this.incrementCounter('credit_operations_total', {
      operation: metric.operation,
      success: metric.success.toString()
    });
  }

  recordPayment(metric: PaymentMetric): void {
    const key = 'payments';
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    this.metrics.get(key)!.push({
      ...metric,
      timestamp: Date.now()
    });

    // Record as structured metrics
    this.recordValue('payment_amount', metric.amount, {
      method: metric.method,
      currency: metric.currency,
      success: metric.success.toString(),
      user_id: metric.userId
    });

    this.incrementCounter('payments_total', {
      method: metric.method,
      currency: metric.currency,
      success: metric.success.toString()
    });
  }

  getMetrics(type?: string): any[] {
    if (type) {
      return this.metrics.get(type) || [];
    }
    
    const allMetrics: any[] = [];
    for (const [key, values] of this.metrics.entries()) {
      allMetrics.push(...values.map(v => ({ type: key, ...v })));
    }
    
    return allMetrics.sort((a, b) => b.timestamp - a.timestamp);
  }

  clearMetrics(type?: string): void {
    if (type) {
      this.metrics.delete(type);
    } else {
      this.metrics.clear();
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushBatch(); // Flush remaining metrics
  }

  recordHttpRequest(metric: HttpRequestMetric): void {
    const key = 'http_requests';
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    this.metrics.get(key)!.push({
      ...metric,
      timestamp: Date.now()
    });

    // Log metric for external monitoring systems
    console.log(JSON.stringify({
      type: 'metric',
      name: 'http_request',
      value: metric.duration,
      labels: {
        method: metric.method,
        route: metric.route,
        status_code: metric.statusCode.toString(),
        user_id: metric.userId || 'anonymous'
      },
      timestamp: new Date().toISOString()
    }));
  }

  recordCreditOperation(metric: CreditOperationMetric): void {
    const key = 'credit_operations';
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    this.metrics.get(key)!.push({
      ...metric,
      timestamp: Date.now()
    });

    console.log(JSON.stringify({
      type: 'metric',
      name: 'credit_operation',
      value: metric.amount || 0,
      labels: {
        operation: metric.operation,
        success: metric.success.toString(),
        user_id: metric.userId
      },
      timestamp: new Date().toISOString()
    }));
  }

  recordPayment(metric: PaymentMetric): void {
    const key = 'payments';
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    this.metrics.get(key)!.push({
      ...metric,
      timestamp: Date.now()
    });

    console.log(JSON.stringify({
      type: 'metric',
      name: 'payment',
      value: metric.amount,
      labels: {
        method: metric.method,
        currency: metric.currency,
        success: metric.success.toString(),
        user_id: metric.userId
      },
      timestamp: new Date().toISOString()
    }));
  }

  getMetrics(type?: string): any[] {
    if (type) {
      return this.metrics.get(type) || [];
    }
    
    const allMetrics: any[] = [];
    for (const [key, values] of this.metrics.entries()) {
      allMetrics.push(...values.map(v => ({ type: key, ...v })));
    }
    
    return allMetrics.sort((a, b) => b.timestamp - a.timestamp);
  }

  clearMetrics(type?: string): void {
    if (type) {
      this.metrics.delete(type);
    } else {
      this.metrics.clear();
    }
  }
}

/**
 * Specialized metrics collector for payment processing services
 */
export class PaymentMetricsCollector extends BaseMetricsCollector {
  constructor() {
    super('payment-processing');
  }

  protected logMetric(type: string, name: string, value: number, labels: Record<string, string>): void {
    console.log(JSON.stringify({
      type: 'metric',
      name: type,
      metric_name: `payment.${name}`,
      value,
      labels,
      timestamp: new Date().toISOString()
    }));
  }

  recordPaymentInitiated(provider: string, amount: number, userId: string): void {
    this.incrementCounter('initiated', {
      provider,
      amount_range: this.getAmountRange(amount),
      user_id: userId
    });
    this.recordValue('initiated_amount', amount, { provider });
  }

  recordPaymentCompleted(provider: string, amount: number, userId: string, duration: number): void {
    this.incrementCounter('completed', {
      provider,
      amount_range: this.getAmountRange(amount),
      user_id: userId
    });
    this.recordValue('completed_amount', amount, { provider });
    this.recordValue('processing_duration', duration, { provider, status: 'completed' });
  }

  recordPaymentFailed(provider: string, amount: number, userId: string, errorType: string, duration: number): void {
    this.incrementCounter('failed', {
      provider,
      error_type: errorType,
      amount_range: this.getAmountRange(amount),
      user_id: userId
    });
    this.recordValue('processing_duration', duration, { provider, status: 'failed' });
  }

  recordRefund(provider: string, amount: number, userId: string): void {
    this.incrementCounter('refunded', {
      provider,
      amount_range: this.getAmountRange(amount),
      user_id: userId
    });
    this.recordValue('refunded_amount', amount, { provider });
  }

  private getAmountRange(amount: number): string {
    if (amount < 10) return 'small';
    if (amount < 100) return 'medium';
    if (amount < 1000) return 'large';
    return 'xlarge';
  }
}

/**
 * Specialized metrics collector for credit system services
 */
export class CreditMetricsCollector extends BaseMetricsCollector {
  constructor() {
    super('credit-system');
  }

  protected logMetric(type: string, name: string, value: number, labels: Record<string, string>): void {
    console.log(JSON.stringify({
      type: 'metric',
      name: type,
      metric_name: `credit.${name}`,
      value,
      labels,
      timestamp: new Date().toISOString()
    }));
  }

  recordCreditDeduction(userId: string, amount: number, reason: string, duration: number): void {
    this.incrementCounter('deducted', {
      user_id: userId,
      reason,
      amount_range: this.getAmountRange(amount)
    });
    this.recordValue('deducted_amount', amount, { reason });
    this.recordValue('deduction_duration', duration, { reason });
  }

  recordCreditAddition(userId: string, amount: number, source: string, duration: number): void {
    this.incrementCounter('added', {
      user_id: userId,
      source,
      amount_range: this.getAmountRange(amount)
    });
    this.recordValue('added_amount', amount, { source });
    this.recordValue('addition_duration', duration, { source });
  }

  recordBalanceCheck(userId: string, currentBalance: number, duration: number): void {
    this.incrementCounter('balance_checked', { user_id: userId });
    this.recordGauge('current_balance', currentBalance, { user_id: userId });
    this.recordValue('balance_check_duration', duration);
  }

  recordInsufficientCredits(userId: string, required: number, available: number): void {
    this.incrementCounter('insufficient_credits', {
      user_id: userId,
      required_range: this.getAmountRange(required),
      available_range: this.getAmountRange(available)
    });
  }

  private getAmountRange(amount: number): string {
    if (amount < 10) return 'small';
    if (amount < 50) return 'medium';
    if (amount < 200) return 'large';
    return 'xlarge';
  }
}

/**
 * Specialized metrics collector for AI assistant services
 */
export class AIAssistantMetricsCollector extends BaseMetricsCollector {
  constructor() {
    super('ai-assistant');
  }

  protected logMetric(type: string, name: string, value: number, labels: Record<string, string>): void {
    console.log(JSON.stringify({
      type: 'metric',
      name: type,
      metric_name: `ai.${name}`,
      value,
      labels,
      timestamp: new Date().toISOString()
    }));
  }

  recordTaskExecution(taskType: string, userId: string, duration: number, success: boolean): void {
    this.incrementCounter('tasks_executed', {
      task_type: taskType,
      user_id: userId,
      success: success.toString()
    });
    this.recordValue('task_duration', duration, { task_type: taskType, success: success.toString() });
  }

  recordTokenUsage(model: string, inputTokens: number, outputTokens: number, cost: number): void {
    this.recordValue('input_tokens', inputTokens, { model });
    this.recordValue('output_tokens', outputTokens, { model });
    this.recordValue('token_cost', cost, { model });
    this.incrementCounter('model_requests', { model });
  }

  recordImageGeneration(model: string, userId: string, duration: number, success: boolean, cost: number): void {
    this.incrementCounter('images_generated', {
      model,
      user_id: userId,
      success: success.toString()
    });
    this.recordValue('image_generation_duration', duration, { model, success: success.toString() });
    this.recordValue('image_generation_cost', cost, { model });
  }
}

/**
 * Metrics factory for creating appropriate metrics collectors
 */
export class MetricsFactory {
  private static instances: Map<string, IBaseMetricsCollector> = new Map();

  static getMetricsCollector(serviceType: 'payment' | 'credit' | 'ai' | 'general' = 'general'): IBaseMetricsCollector {
    if (!this.instances.has(serviceType)) {
      switch (serviceType) {
        case 'payment':
          this.instances.set(serviceType, new PaymentMetricsCollector());
          break;
        case 'credit':
          this.instances.set(serviceType, new CreditMetricsCollector());
          break;
        case 'ai':
          this.instances.set(serviceType, new AIAssistantMetricsCollector());
          break;
        default:
          this.instances.set(serviceType, new MetricsCollector());
      }
    }
    return this.instances.get(serviceType)!;
  }

  static createMetricsCollector(serviceName: string): IBaseMetricsCollector {
    return new (class extends BaseMetricsCollector {
      constructor() {
        super(serviceName);
      }
      
      protected logMetric(type: string, name: string, value: number, labels: Record<string, string>): void {
        console.log(JSON.stringify({
          type: 'metric',
          name: type,
          metric_name: `${this.serviceName}.${name}`,
          value,
          labels,
          timestamp: new Date().toISOString()
        }));
      }
    })();
  }

  static cleanup(): void {
    this.instances.forEach(instance => {
      if (instance instanceof MetricsCollector) {
        instance.destroy();
      }
    });
    this.instances.clear();
  }
}

// Export singleton instances
export const metrics = new MetricsCollector();
export const paymentMetrics = new PaymentMetricsCollector();
export const creditMetrics = new CreditMetricsCollector();
export const aiMetrics = new AIAssistantMetricsCollector();

/**
 * Performance monitoring utility to ensure metrics collection doesn't impact performance
 */
export class MetricsPerformanceMonitor {
  private static metricsOverhead: number[] = [];
  private static maxSamples = 100;

  static measureMetricsOverhead<T>(operation: () => T): T {
    const start = process.hrtime.bigint();
    const result = operation();
    const end = process.hrtime.bigint();
    
    const overhead = Number(end - start) / 1000000; // Convert to milliseconds
    this.recordOverhead(overhead);
    
    return result;
  }

  private static recordOverhead(overhead: number): void {
    this.metricsOverhead.push(overhead);
    
    // Keep only the last N samples
    if (this.metricsOverhead.length > this.maxSamples) {
      this.metricsOverhead.shift();
    }
  }

  static getPerformanceStats(): {
    averageOverhead: number;
    maxOverhead: number;
    minOverhead: number;
    sampleCount: number;
  } {
    if (this.metricsOverhead.length === 0) {
      return {
        averageOverhead: 0,
        maxOverhead: 0,
        minOverhead: 0,
        sampleCount: 0
      };
    }

    const sum = this.metricsOverhead.reduce((a, b) => a + b, 0);
    return {
      averageOverhead: sum / this.metricsOverhead.length,
      maxOverhead: Math.max(...this.metricsOverhead),
      minOverhead: Math.min(...this.metricsOverhead),
      sampleCount: this.metricsOverhead.length
    };
  }

  static isPerformanceAcceptable(maxOverheadMs: number = 1): boolean {
    const stats = this.getPerformanceStats();
    return stats.averageOverhead <= maxOverheadMs;
  }
}

/**
 * Async metrics collector that doesn't block the main thread
 */
export class AsyncMetricsCollector extends BaseMetricsCollector {
  private metricsQueue: MetricEntry[] = [];
  private processing = false;

  constructor(serviceName: string) {
    super(serviceName);
  }

  protected logMetric(type: string, name: string, value: number, labels: Record<string, string>): void {
    // Add to queue for async processing
    this.metricsQueue.push({
      type,
      name,
      value,
      labels,
      timestamp: new Date().toISOString()
    });

    // Process queue asynchronously
    this.processQueueAsync();
  }

  private async processQueueAsync(): Promise<void> {
    if (this.processing || this.metricsQueue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      // Process in next tick to avoid blocking
      await new Promise(resolve => setImmediate(resolve));
      
      const batch = [...this.metricsQueue];
      this.metricsQueue = [];

      // Log batch
      console.log(JSON.stringify({
        type: 'async_metrics_batch',
        service: this.serviceName,
        count: batch.length,
        metrics: batch,
        processed_at: new Date().toISOString()
      }));

    } finally {
      this.processing = false;
      
      // Process remaining items if any
      if (this.metricsQueue.length > 0) {
        setImmediate(() => this.processQueueAsync());
      }
    }
  }
}