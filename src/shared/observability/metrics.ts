/**
 * Metrics Collection
 * Performance and usage metrics tracking
 */

interface HttpRequestMetric {
  method: string;
  route: string;
  statusCode: number;
  duration: number;
  userId?: string;
}

interface CreditOperationMetric {
  operation: 'deduction' | 'addition' | 'balance_check';
  amount?: number;
  userId: string;
  success: boolean;
  duration: number;
}

interface PaymentMetric {
  method: 'stripe' | 'crypto' | 'paypal';
  amount: number;
  currency: string;
  success: boolean;
  userId: string;
}

class MetricsCollector {
  private metrics: Map<string, any[]> = new Map();

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