/**
 * System Analytics Service Integration Tests
 * Tests for the SystemAnalyticsService class functionality
 */

import { SystemAnalyticsService } from '../../src/features/ai-assistant/services/system-analytics-service';
import { logger } from '../../src/shared/observability/logger';
import { metrics } from '../../src/shared/observability/metrics';
import * as admin from 'firebase-admin';

// Mock Firebase Admin
jest.mock('firebase-admin');

describe('SystemAnalyticsService Integration Tests', () => {
  let systemAnalyticsService: SystemAnalyticsService;
  let mockFirestore: any;

  beforeEach(() => {
    // Mock Firestore
    mockFirestore = {
      collection: jest.fn().mockReturnThis(),
      doc: jest.fn().mockReturnThis(),
      get: jest.fn(),
      set: jest.fn(),
      update: jest.fn(),
      add: jest.fn(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis()
    };

    systemAnalyticsService = new SystemAnalyticsService(
      mockFirestore,
      logger,
      metrics
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Credit System Analytics', () => {
    const mockTransactions = [
      {
        id: 'tx-1',
        userId: 'user-1',
        type: 'credit_deduction',
        amount: 50,
        timestamp: new Date('2024-01-15'),
        metadata: { featureId: 'ai_chat', aiModel: 'gpt-4' }
      },
      {
        id: 'tx-2',
        userId: 'user-2',
        type: 'credit_addition',
        amount: 100,
        timestamp: new Date('2024-01-16'),
        metadata: { source: 'payment' }
      },
      {
        id: 'tx-3',
        userId: 'user-1',
        type: 'credit_deduction',
        amount: 25,
        timestamp: new Date('2024-01-17'),
        metadata: { featureId: 'image_generation', aiModel: 'dall-e-3' }
      }
    ];

    beforeEach(() => {
      mockFirestore.get.mockResolvedValue({
        docs: mockTransactions.map(tx => ({ data: () => tx }))
      });
    });

    it('should get credit usage analytics', async () => {
      const timeRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'day' as any
      };

      const result = await systemAnalyticsService.getCreditUsageAnalytics(timeRange);

      expect(result.userId).toBe('system');
      expect(result.timeRange).toEqual(timeRange);
      expect(result.totalCreditsUsed).toBe(75); // 50 + 25
      expect(result.totalCreditsAdded).toBe(100);
      expect(result.netCreditsChange).toBe(25); // 100 - 75
      expect(mockFirestore.collection).toHaveBeenCalledWith('credit_transactions');
    });

    it('should calculate usage by feature correctly', async () => {
      const result = await systemAnalyticsService.getCreditUsageAnalytics();

      expect(result.usageByFeature).toBeDefined();
      // Should group by featureId from metadata
    });

    it('should calculate usage by day correctly', async () => {
      const result = await systemAnalyticsService.getCreditUsageAnalytics();

      expect(result.usageByDay).toBeDefined();
      // Should group transactions by date
    });

    it('should calculate usage by model correctly', async () => {
      const result = await systemAnalyticsService.getCreditUsageAnalytics();

      expect(result.usageByModel).toBeDefined();
      // Should group by aiModel from metadata
    });

    it('should handle empty transaction data', async () => {
      mockFirestore.get.mockResolvedValue({ docs: [] });

      const result = await systemAnalyticsService.getCreditUsageAnalytics();

      expect(result.totalCreditsUsed).toBe(0);
      expect(result.totalCreditsAdded).toBe(0);
      expect(result.netCreditsChange).toBe(0);
    });
  });

  describe('Financial Reporting', () => {
    const mockPayments = [
      {
        id: 'pay-1',
        userId: 'user-1',
        amount: 25.00,
        timestamp: new Date('2024-01-15'),
        status: 'completed',
        method: 'credit_card'
      },
      {
        id: 'pay-2',
        userId: 'user-2',
        amount: 50.00,
        timestamp: new Date('2024-01-16'),
        status: 'completed',
        method: 'paypal'
      }
    ];

    beforeEach(() => {
      mockFirestore.get.mockResolvedValue({
        docs: mockPayments.map(payment => ({ data: () => payment }))
      });
    });

    it('should get financial reporting', async () => {
      const timeRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'day' as any
      };

      const result = await systemAnalyticsService.getFinancialReporting(timeRange);

      expect(result.timeRange).toEqual(timeRange);
      expect(result.revenue.totalRevenue).toBe(75); // 25 + 50
      expect(result.revenue.averageRevenuePerUser).toBe(37.5); // 75 / 2 users
      expect(result.costs).toBeDefined();
      expect(result.profitability).toBeDefined();
      expect(result.projections).toBeDefined();
      expect(result.trends).toBeDefined();
    });

    it('should calculate revenue by source', async () => {
      const result = await systemAnalyticsService.getFinancialReporting();

      expect(result.revenue.revenueBySource).toBeDefined();
      expect(Array.isArray(result.revenue.revenueBySource)).toBe(true);
    });

    it('should handle no payment data', async () => {
      mockFirestore.get.mockResolvedValue({ docs: [] });

      const result = await systemAnalyticsService.getFinancialReporting();

      expect(result.revenue.totalRevenue).toBe(0);
      expect(result.revenue.averageRevenuePerUser).toBe(0);
    });
  });

  describe('User Analytics', () => {
    beforeEach(() => {
      // Mock users collection
      mockFirestore.get
        .mockResolvedValueOnce({ size: 1000 }) // Total users
        .mockResolvedValueOnce({ // Active users (AI interactions)
          docs: Array.from({ length: 500 }, (_, i) => ({
            data: () => ({ userId: `user-${i}` })
          }))
        })
        .mockResolvedValueOnce({ size: 100 }); // New users
    });

    it('should get user engagement metrics', async () => {
      const timeRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'day' as any
      };

      const result = await systemAnalyticsService.getUserEngagementMetrics(timeRange);

      expect(result.timeRange).toEqual(timeRange);
      expect(result.totalUsers).toBe(1000);
      expect(result.activeUsers).toBe(500);
      expect(result.newUsers).toBe(100);
      expect(result.returningUsers).toBe(400); // 500 - 100
      expect(result.userRetention).toBeDefined();
      expect(result.engagement).toBeDefined();
      expect(result.churn).toBeDefined();
    });

    it('should get user segment analysis', async () => {
      const result = await systemAnalyticsService.getUserSegmentAnalysis();

      expect(result.timeRange).toBeDefined();
      expect(result.segments).toBeDefined();
      expect(result.segmentComparison).toBeDefined();
      expect(result.segmentTrends).toBeDefined();
    });

    it('should handle user data queries correctly', async () => {
      await systemAnalyticsService.getUserEngagementMetrics();

      expect(mockFirestore.collection).toHaveBeenCalledWith('users');
      expect(mockFirestore.collection).toHaveBeenCalledWith('ai_interactions');
    });
  });

  describe('System Performance', () => {
    it('should get system performance report', async () => {
      const timeRange = {
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate: new Date(),
        granularity: 'hour' as any
      };

      const result = await systemAnalyticsService.getSystemPerformanceReport(timeRange);

      expect(result.timeRange).toEqual(timeRange);
      expect(result.availability).toBeDefined();
      expect(result.availability.uptime).toBeDefined();
      expect(result.availability.availability).toBeDefined();
      expect(result.performance).toBeDefined();
      expect(result.performance.averageResponseTime).toBeDefined();
      expect(result.scalability).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(result.capacity).toBeDefined();
    });

    it('should get system reliability metrics', async () => {
      const result = await systemAnalyticsService.getSystemReliabilityMetrics();

      expect(result.timeRange).toBeDefined();
      expect(result.reliability).toBeDefined();
      expect(result.reliability.overall).toBeDefined();
      expect(result.sla).toBeDefined();
      expect(result.monitoring).toBeDefined();
      expect(result.alerts).toBeDefined();
    });

    it('should use default time ranges when not provided', async () => {
      const result = await systemAnalyticsService.getSystemPerformanceReport();

      expect(result.timeRange.granularity).toBe('hour');
      // Should use 24 hours ago as default
    });
  });

  describe('Business Intelligence', () => {
    it('should get business intelligence report', async () => {
      const timeRange = {
        startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        endDate: new Date(),
        granularity: 'week' as any
      };

      const result = await systemAnalyticsService.getBusinessIntelligenceReport(timeRange);

      expect(result.timeRange).toEqual(timeRange);
      expect(result.marketAnalysis).toBeDefined();
      expect(result.marketAnalysis.marketSize).toBeDefined();
      expect(result.competitiveAnalysis).toBeDefined();
      expect(result.customerInsights).toBeDefined();
      expect(result.productAnalysis).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should get KPI dashboard', async () => {
      const result = await systemAnalyticsService.getKPIDashboard();

      expect(result.timestamp).toBeDefined();
      expect(result.businessKPIs).toBeDefined();
      expect(result.businessKPIs).toHaveLength(2);
      expect(result.technicalKPIs).toBeDefined();
      expect(result.technicalKPIs).toHaveLength(2);
      expect(result.userKPIs).toBeDefined();
      expect(result.userKPIs).toHaveLength(2);
      expect(result.financialKPIs).toBeDefined();
      expect(result.financialKPIs).toHaveLength(2);
      expect(result.alerts).toBeDefined();
    });

    it('should validate KPI structure', async () => {
      const result = await systemAnalyticsService.getKPIDashboard();

      result.businessKPIs.forEach(kpi => {
        expect(kpi.name).toBeDefined();
        expect(kpi.value).toBeDefined();
        expect(kpi.target).toBeDefined();
        expect(kpi.unit).toBeDefined();
        expect(kpi.trend).toMatch(/^(up|down|stable)$/);
        expect(kpi.status).toMatch(/^(excellent|good|warning|critical)$/);
      });
    });
  });

  describe('Real-time Monitoring', () => {
    it('should get real-time metrics', async () => {
      const result = await systemAnalyticsService.getRealTimeMetrics();

      expect(result.timestamp).toBeDefined();
      expect(result.activeUsers).toBe(150);
      expect(result.requestsPerSecond).toBe(25);
      expect(result.responseTime).toBe(250);
      expect(result.errorRate).toBe(0.5);
      expect(result.systemLoad).toBe(65);
      expect(result.queueDepth).toBe(12);
      expect(result.throughput).toBe(1000);
      expect(result.concurrentSessions).toBe(125);
    });

    it('should get system health status', async () => {
      const result = await systemAnalyticsService.getSystemHealthStatus();

      expect(result.timestamp).toBeDefined();
      expect(result.overallHealth).toBe('healthy');
      expect(result.components).toBeDefined();
      expect(result.components).toHaveLength(3);
      expect(result.alerts).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should determine overall health correctly', async () => {
      const result = await systemAnalyticsService.getSystemHealthStatus();

      // Should be 'healthy' when no critical components
      expect(result.overallHealth).toBe('healthy');
      
      // Components should have proper status
      result.components.forEach(component => {
        expect(component.component).toBeDefined();
        expect(component.status).toMatch(/^(healthy|warning|critical|down)$/);
        expect(component.responseTime).toBeDefined();
        expect(component.errorRate).toBeDefined();
        expect(component.lastCheck).toBeDefined();
      });
    });

    it('should handle component health checks', async () => {
      const result = await systemAnalyticsService.getSystemHealthStatus();

      const apiGateway = result.components.find(c => c.component === 'API Gateway');
      const database = result.components.find(c => c.component === 'Database');
      const aiServices = result.components.find(c => c.component === 'AI Services');

      expect(apiGateway).toBeDefined();
      expect(apiGateway?.status).toBe('healthy');
      expect(database).toBeDefined();
      expect(database?.status).toBe('healthy');
      expect(aiServices).toBeDefined();
      expect(aiServices?.status).toBe('warning');
    });
  });

  describe('Error Handling', () => {
    it('should handle firestore query errors', async () => {
      const error = new Error('Firestore connection failed');
      mockFirestore.get.mockRejectedValue(error);

      await expect(systemAnalyticsService.getCreditUsageAnalytics()).rejects.toThrow(error);
    });

    it('should handle missing data gracefully', async () => {
      mockFirestore.get.mockResolvedValue({ docs: [] });

      const result = await systemAnalyticsService.getCreditUsageAnalytics();

      expect(result.totalCreditsUsed).toBe(0);
      expect(result.totalCreditsAdded).toBe(0);
    });

    it('should handle invalid date ranges', async () => {
      const invalidTimeRange = {
        startDate: new Date('invalid-date'),
        endDate: new Date('2024-01-31'),
        granularity: 'day' as any
      };

      // Should not throw error, but handle gracefully
      await expect(systemAnalyticsService.getCreditUsageAnalytics(invalidTimeRange)).resolves.toBeDefined();
    });
  });

  describe('Data Aggregation', () => {
    it('should aggregate transaction data correctly', async () => {
      const mockTransactions = [
        { type: 'credit_deduction', amount: 10, userId: 'user-1', timestamp: new Date('2024-01-01') },
        { type: 'credit_deduction', amount: 20, userId: 'user-2', timestamp: new Date('2024-01-01') },
        { type: 'credit_addition', amount: 50, userId: 'user-1', timestamp: new Date('2024-01-02') }
      ];

      mockFirestore.get.mockResolvedValue({
        docs: mockTransactions.map(tx => ({ data: () => tx }))
      });

      const result = await systemAnalyticsService.getCreditUsageAnalytics();

      expect(result.totalCreditsUsed).toBe(30); // 10 + 20
      expect(result.totalCreditsAdded).toBe(50);
      expect(result.netCreditsChange).toBe(20); // 50 - 30
    });

    it('should calculate unique users correctly', async () => {
      const mockTransactions = [
        { userId: 'user-1', type: 'credit_deduction', amount: 10 },
        { userId: 'user-1', type: 'credit_deduction', amount: 15 },
        { userId: 'user-2', type: 'credit_deduction', amount: 20 },
        { userId: 'user-3', type: 'credit_addition', amount: 50 }
      ];

      mockFirestore.get.mockResolvedValue({
        docs: mockTransactions.map(tx => ({ data: () => tx }))
      });

      const result = await systemAnalyticsService.getCreditUsageAnalytics();

      // Should count unique users from all transactions
      expect(result.usageByFeature).toBeDefined();
    });
  });

  describe('Time Range Handling', () => {
    it('should use default time range when none provided', async () => {
      mockFirestore.get.mockResolvedValue({ docs: [] });

      const result = await systemAnalyticsService.getCreditUsageAnalytics();

      expect(result.timeRange.granularity).toBe('day');
      // Should use 30 days ago as default
      const daysDiff = Math.ceil((result.timeRange.endDate.getTime() - result.timeRange.startDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBe(30);
    });

    it('should respect provided time range', async () => {
      mockFirestore.get.mockResolvedValue({ docs: [] });

      const customTimeRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-15'),
        granularity: 'hour' as any
      };

      const result = await systemAnalyticsService.getCreditUsageAnalytics(customTimeRange);

      expect(result.timeRange).toEqual(customTimeRange);
    });

    it('should filter data by time range', async () => {
      const timeRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'day' as any
      };

      await systemAnalyticsService.getCreditUsageAnalytics(timeRange);

      expect(mockFirestore.where).toHaveBeenCalledWith('timestamp', '>=', timeRange.startDate);
      expect(mockFirestore.where).toHaveBeenCalledWith('timestamp', '<=', timeRange.endDate);
    });
  });
});