/**
 * Dashboard Service
 * Provides operational dashboards and metrics collection
 */

import {
  SystemHealthMetrics,
  SystemHealthStatus,
  AlertSeverity,
  SystemAlert,
  FraudAlert,
  ModelPerformanceAlert
} from './system-monitoring-service';
import { IStructuredLogger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';
import { Firestore } from 'firebase-admin/firestore';

export interface DashboardMetrics {
  systemOverview: SystemOverview;
  creditSystemMetrics: CreditSystemDashboard;
  paymentMetrics: PaymentDashboard;
  modelMetrics: ModelDashboard;
  userMetrics: UserDashboard;
  alertSummary: AlertSummary;
}

export interface SystemOverview {
  status: SystemHealthStatus;
  uptime: number;
  totalUsers: number;
  activeUsers: number;
  totalTransactions: number;
  totalRevenue: number;
  systemLoad: number;
  errorRate: number;
}

export interface CreditSystemDashboard {
  totalCreditsIssued: number;
  totalCreditsConsumed: number;
  activeBalances: number;
  averageBalance: number;
  transactionVolume: number;
  fraudAlerts: number;
  ledgerIntegrity: boolean;
}

export interface PaymentDashboard {
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  totalRevenue: number;
  averageTransactionValue: number;
  paymentMethods: PaymentMethodBreakdown[];
  revenueByDay: RevenueDataPoint[];
}

export interface ModelDashboard {
  totalModels: number;
  activeModels: number;
  totalRequests: number;
  averageLatency: number;
  topModels: ModelUsageStats[];
  performanceAlerts: number;
}

export interface UserDashboard {
  totalUsers: number;
  newUsersToday: number;
  activeUsers: number;
  userGrowth: UserGrowthDataPoint[];
  topUsers: UserUsageStats[];
}

export interface AlertSummary {
  totalAlerts: number;
  criticalAlerts: number;
  unacknowledgedAlerts: number;
  recentAlerts: SystemAlert[];
  alertsByType: AlertTypeBreakdown[];
}

export interface PaymentMethodBreakdown {
  method: string;
  count: number;
  revenue: number;
  percentage: number;
}

export interface RevenueDataPoint {
  date: string;
  revenue: number;
  transactions: number;
}

export interface ModelUsageStats {
  modelId: string;
  name: string;
  requests: number;
  revenue: number;
  averageLatency: number;
  errorRate: number;
}

export interface UserGrowthDataPoint {
  date: string;
  newUsers: number;
  totalUsers: number;
}

export interface UserUsageStats {
  userId: string;
  email: string;
  creditsConsumed: number;
  totalSpent: number;
  lastActive: Date;
}

export interface AlertTypeBreakdown {
  type: string;
  count: number;
  severity: AlertSeverity;
}

export interface IDashboardService {
  getDashboardMetrics(timeRange?: TimeRange): Promise<DashboardMetrics>;
  getSystemOverview(): Promise<SystemOverview>;
  getCreditSystemMetrics(timeRange?: TimeRange): Promise<CreditSystemDashboard>;
  getPaymentMetrics(timeRange?: TimeRange): Promise<PaymentDashboard>;
  getModelMetrics(timeRange?: TimeRange): Promise<ModelDashboard>;
  getUserMetrics(timeRange?: TimeRange): Promise<UserDashboard>;
  getAlertSummary(): Promise<AlertSummary>;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export class DashboardService implements IDashboardService {
  private firestore: Firestore;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;

  constructor(
    firestore: Firestore,
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ) {
    this.firestore = firestore;
    this.logger = logger;
    this.metrics = metrics;
  }

  async getDashboardMetrics(timeRange?: TimeRange): Promise<DashboardMetrics> {
    try {
      const [
        systemOverview,
        creditSystemMetrics,
        paymentMetrics,
        modelMetrics,
        userMetrics,
        alertSummary
      ] = await Promise.all([
        this.getSystemOverview(),
        this.getCreditSystemMetrics(timeRange),
        this.getPaymentMetrics(timeRange),
        this.getModelMetrics(timeRange),
        this.getUserMetrics(timeRange),
        this.getAlertSummary()
      ]);

      return {
        systemOverview,
        creditSystemMetrics,
        paymentMetrics,
        modelMetrics,
        userMetrics,
        alertSummary
      };

    } catch (error) {
      this.logger.error('Failed to get dashboard metrics', error);
      throw error;
    }
  }

  async getSystemOverview(): Promise<SystemOverview> {
    // Implementation would gather real system metrics
    return {
      status: SystemHealthStatus.HEALTHY,
      uptime: 99.9,
      totalUsers: 1250,
      activeUsers: 89,
      totalTransactions: 15420,
      totalRevenue: 12450.50,
      systemLoad: 45.2,
      errorRate: 0.1
    };
  }

  async getCreditSystemMetrics(timeRange?: TimeRange): Promise<CreditSystemDashboard> {
    // Implementation would query credit system data
    return {
      totalCreditsIssued: 2500000,
      totalCreditsConsumed: 1850000,
      activeBalances: 1200,
      averageBalance: 542,
      transactionVolume: 8950,
      fraudAlerts: 2,
      ledgerIntegrity: true
    };
  }

  async getPaymentMetrics(timeRange?: TimeRange): Promise<PaymentDashboard> {
    // Implementation would query payment data
    return {
      totalPayments: 450,
      successfulPayments: 442,
      failedPayments: 8,
      totalRevenue: 12450.50,
      averageTransactionValue: 27.67,
      paymentMethods: [
        { method: 'Credit Card', count: 320, revenue: 8850.50, percentage: 71.1 },
        { method: 'PayPal', count: 85, revenue: 2100.00, percentage: 16.9 },
        { method: 'Crypto', count: 45, revenue: 1500.00, percentage: 12.0 }
      ],
      revenueByDay: [] // Would be populated with actual data
    };
  }

  async getModelMetrics(timeRange?: TimeRange): Promise<ModelDashboard> {
    // Implementation would query model usage data
    return {
      totalModels: 12,
      activeModels: 10,
      totalRequests: 25420,
      averageLatency: 1250,
      topModels: [], // Would be populated with actual data
      performanceAlerts: 1
    };
  }

  async getUserMetrics(timeRange?: TimeRange): Promise<UserDashboard> {
    // Implementation would query user data
    return {
      totalUsers: 1250,
      newUsersToday: 15,
      activeUsers: 89,
      userGrowth: [], // Would be populated with actual data
      topUsers: [] // Would be populated with actual data
    };
  }

  async getAlertSummary(): Promise<AlertSummary> {
    // Implementation would query alert data
    return {
      totalAlerts: 5,
      criticalAlerts: 1,
      unacknowledgedAlerts: 2,
      recentAlerts: [], // Would be populated with actual data
      alertsByType: [] // Would be populated with actual data
    };
  }
}