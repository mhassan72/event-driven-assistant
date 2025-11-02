/**
 * Metrics Collection
 * Performance and usage metrics tracking
 */

export interface IMetricsCollector {
  increment(name: string, value?: number, labels?: Record<string, string>): void;
  counter(name: string, value?: number, labels?: Record<string, string>): void;
  incrementCounter(name: string, labels?: Record<string, string>): void;
  histogram(name: string, value: number, labels?: Record<string, string>): void;
  gauge(name: string, value: number | (() => number), labels?: Record<string, string>): void;
  recordHttpRequest(metric: HttpRequestMetric): void;
  recordCreditOperation(metric: CreditOperationMetric): void;
  recordPayment(metric: PaymentMetric): void;
  getMetrics(type?: string): any[];
  clearMetrics(type?: string): void;
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

class MetricsCollector implements IMetricsCollector {
  private metrics: Map<string, any[]> = new Map();

  increment(name: string, value: number = 1, labels?: Record<string, string>): void {
    console.log(JSON.stringify({
      type: 'metric',
      name: 'counter',
      metric_name: name,
      value,
      labels: labels || {},
      timestamp: new Date().toISOString()
    }));
  }

  counter(name: string, value: number = 1, labels?: Record<string, string>): void {
    this.increment(name, value, labels);
  }

  incrementCounter(name: string, labels?: Record<string, string>): void {
    this.counter(name, 1, labels);
  }

  histogram(name: string, value: number, labels?: Record<string, string>): void {
    console.log(JSON.stringify({
      type: 'metric',
      name: 'histogram',
      metric_name: name,
      value,
      labels: labels || {},
      timestamp: new Date().toISOString()
    }));
  }

  gauge(name: string, value: number | (() => number), labels?: Record<string, string>): void {
    const actualValue = typeof value === 'function' ? value() : value;
    console.log(JSON.stringify({
      type: 'metric',
      name: 'gauge',
      metric_name: name,
      value: actualValue,
      labels: labels || {},
      timestamp: new Date().toISOString()
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

export const metrics = new MetricsCollector();