/**
 * System Monitoring Service Unit Tests
 * Tests for system monitoring and alerting functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  SystemMonitoringService,
  SystemHealthMetrics,
  SystemHealthStatus,
  AlertThreshold,
  AlertSeverity,
  SystemAlert
} from '../../../../src/features/notification-system';
import { IStructuredLogger } from '../../../../src/shared/observability/logger';
import { IMetricsCollector } from '../../../../src/shared/observability/metrics';

// Mock Firebase Admin
jest.mock('firebase-admin/firestore');
jest.mock('firebase-admin/database');

// Mock dependencies
const mockLogger: IStructuredLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

const mockMetrics: IMetricsCollector = {
  increment: jest.fn(),
  histogram: jest.fn(),
  gauge: jest.fn()
};

const mockFirestore = {
  collection: jest.fn()
};

const mockDatabase = {
  ref: jest.fn()
};

const mockNotificationService = {
  sendNotification: jest.fn()
};

// Mock Firestore methods
const mockDoc = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  id: 'test-id'
};

const mockCollection = {
  doc: jest.fn(() => mockDoc),
  where: jest.fn(() => ({
    orderBy: jest.fn(() => ({
      get: jest.fn()
    })),
    get: jest.fn()
  })),
  add: jest.fn(),
  get: jest.fn()
};

const mockRef = {
  set: jest.fn()
};

describe('SystemMonitoringService', () => {
  let monitoringService: SystemMonitoringService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockFirestore.collection.mockReturnValue(mockCollection);
    mockDatabase.ref.mockReturnValue(mockRef);

    monitoringService = new SystemMonitoringService(
      mockFirestore as any,
      mockDatabase as any,
      mockLogger,
      mockMetrics,
      mockNotificationService as any
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('collectSystemMetrics', () => {
    it('should collect and store system metrics successfully', async () => {
      // Mock Firestore queries for credit and payment metrics
      const mockTransactionsSnapshot = {
        docs: [
          { data: () => ({ status: 'failed' }) },
          { data: () => ({ status: 'completed' }) },
          { data: () => ({ status: 'pending' }) }
        ]
      };

      const mockPaymentsSnapshot = {
        size: 10,
        docs: [
          { data: () => ({ status: 'completed' }) },
          { data: () => ({ status: 'failed' }) },
          { data: () => ({ status: 'pending' }) }
        ]
      };

      const mockModelsSnapshot = {
        docs: [
          {
            id: 'model-1',
            data: () => ({
              performance: {
                availability: 99,
                averageLatency: 1000,
                errorRate: 1
              }
            })
          }
        ]
      };

      mockCollection.where().get
        .mockResolvedValueOnce(mockTransactionsSnapshot)
        .mockResolvedValueOnce(mockPaymentsSnapshot);
      
      mockCollection.get.mockResolvedValueOnce(mockModelsSnapshot);

      mockCollection.add.mockResolvedValueOnce(undefined);
      mockRef.set.mockResolvedValueOnce(undefined);

      const metrics = await monitoringService.collectSystemMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.timestamp).toBeInstanceOf(Date);
      expect(metrics.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(metrics.memoryUsage).toBeGreaterThanOrEqual(0);
      expect(metrics.creditSystemHealth).toBeDefined();
      expect(metrics.modelPerformance).toHaveLength(1);
      expect(metrics.paymentSystemHealth).toBeDefined();

      // Verify metrics are stored
      expect(mockCollection.add).toHaveBeenCalledWith(metrics);
      expect(mockRef.set).toHaveBeenCalled();
    });
  });

  describe('getSystemHealth', () => {
    it('should return HEALTHY status for good metrics', async () => {
      // Mock good system metrics
      jest.spyOn(monitoringService, 'collectSystemMetrics').mockResolvedValue({
        timestamp: new Date(),
        cpuUsage: 50,
        memoryUsage: 60,
        diskUsage: 40,
        activeConnections: 100,
        requestsPerMinute: 1000,
        errorRate: 1, // Low error rate
        averageResponseTime: 500,
        queueDepth: 10,
        creditSystemHealth: {
          balanceAccuracy: 99.9,
          transactionProcessingTime: 150,
          ledgerIntegrity: true,
          fraudDetectionAlerts: 2,
          failedTransactions: 5, // Low failed transactions
          pendingTransactions: 10
        },
        modelPerformance: [],
        paymentSystemHealth: {
          successRate: 99,
          averageProcessingTime: 2000,
          failedPayments: 1,
          pendingPayments: 2,
          providerStatus: {}
        }
      });

      const health = await monitoringService.getSystemHealth();

      expect(health).toBe(SystemHealthStatus.HEALTHY);
    });

    it('should return CRITICAL status for high error rate', async () => {
      jest.spyOn(monitoringService, 'collectSystemMetrics').mockResolvedValue({
        timestamp: new Date(),
        cpuUsage: 50,
        memoryUsage: 60,
        diskUsage: 40,
        activeConnections: 100,
        requestsPerMinute: 1000,
        errorRate: 15, // High error rate
        averageResponseTime: 500,
        queueDepth: 10,
        creditSystemHealth: {
          balanceAccuracy: 99.9,
          transactionProcessingTime: 150,
          ledgerIntegrity: true,
          fraudDetectionAlerts: 2,
          failedTransactions: 5,
          pendingTransactions: 10
        },
        modelPerformance: [],
        paymentSystemHealth: {
          successRate: 99,
          averageProcessingTime: 2000,
          failedPayments: 1,
          pendingPayments: 2,
          providerStatus: {}
        }
      });

      const health = await monitoringService.getSystemHealth();

      expect(health).toBe(SystemHealthStatus.CRITICAL);
    });

    it('should return WARNING status for high resource usage', async () => {
      jest.spyOn(monitoringService, 'collectSystemMetrics').mockResolvedValue({
        timestamp: new Date(),
        cpuUsage: 95, // High CPU usage
        memoryUsage: 60,
        diskUsage: 40,
        activeConnections: 100,
        requestsPerMinute: 1000,
        errorRate: 2,
        averageResponseTime: 500,
        queueDepth: 10,
        creditSystemHealth: {
          balanceAccuracy: 99.9,
          transactionProcessingTime: 150,
          ledgerIntegrity: true,
          fraudDetectionAlerts: 2,
          failedTransactions: 5,
          pendingTransactions: 10
        },
        modelPerformance: [],
        paymentSystemHealth: {
          successRate: 99,
          averageProcessingTime: 2000,
          failedPayments: 1,
          pendingPayments: 2,
          providerStatus: {}
        }
      });

      const health = await monitoringService.getSystemHealth();

      expect(health).toBe(SystemHealthStatus.WARNING);
    });
  });

  describe('createAlertThreshold', () => {
    it('should create alert threshold successfully', async () => {
      const thresholdData = {
        name: 'High CPU Usage',
        metric: 'cpuUsage',
        operator: 'gt' as const,
        value: 80,
        severity: AlertSeverity.HIGH,
        enabled: true,
        cooldownMinutes: 15,
        recipients: ['admin@example.com'],
        channels: ['email']
      };

      mockDoc.set.mockResolvedValueOnce(undefined);

      const result = await monitoringService.createAlertThreshold(thresholdData);

      expect(result).toBeDefined();
      expect(result.name).toBe(thresholdData.name);
      expect(result.metric).toBe(thresholdData.metric);
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(mockDoc.set).toHaveBeenCalledWith(result);
    });
  });

  describe('checkThresholds', () => {
    it('should trigger alert when threshold is exceeded', async () => {
      const mockThresholds: AlertThreshold[] = [
        {
          id: 'threshold-1',
          name: 'High CPU Usage',
          metric: 'cpuUsage',
          operator: 'gt',
          value: 80,
          severity: AlertSeverity.HIGH,
          enabled: true,
          cooldownMinutes: 15,
          recipients: ['admin@example.com'],
          channels: ['email'],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const mockMetrics: SystemHealthMetrics = {
        timestamp: new Date(),
        cpuUsage: 90, // Exceeds threshold
        memoryUsage: 60,
        diskUsage: 40,
        activeConnections: 100,
        requestsPerMinute: 1000,
        errorRate: 2,
        averageResponseTime: 500,
        queueDepth: 10,
        creditSystemHealth: {
          balanceAccuracy: 99.9,
          transactionProcessingTime: 150,
          ledgerIntegrity: true,
          fraudDetectionAlerts: 2,
          failedTransactions: 5,
          pendingTransactions: 10
        },
        modelPerformance: [],
        paymentSystemHealth: {
          successRate: 99,
          averageProcessingTime: 2000,
          failedPayments: 1,
          pendingPayments: 2,
          providerStatus: {}
        }
      };

      jest.spyOn(monitoringService, 'getAlertThresholds').mockResolvedValue(mockThresholds);
      mockDoc.set.mockResolvedValueOnce(undefined);
      mockNotificationService.sendNotification.mockResolvedValueOnce(undefined);

      const alerts = await monitoringService.checkThresholds(mockMetrics);

      expect(alerts).toHaveLength(1);
      expect(alerts[0].metric).toBe('cpuUsage');
      expect(alerts[0].currentValue).toBe(90);
      expect(alerts[0].thresholdValue).toBe(80);
      expect(alerts[0].severity).toBe(AlertSeverity.HIGH);
      expect(mockNotificationService.sendNotification).toHaveBeenCalled();
    });

    it('should not trigger alert when threshold is not exceeded', async () => {
      const mockThresholds: AlertThreshold[] = [
        {
          id: 'threshold-1',
          name: 'High CPU Usage',
          metric: 'cpuUsage',
          operator: 'gt',
          value: 80,
          severity: AlertSeverity.HIGH,
          enabled: true,
          cooldownMinutes: 15,
          recipients: ['admin@example.com'],
          channels: ['email'],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const mockMetrics: SystemHealthMetrics = {
        timestamp: new Date(),
        cpuUsage: 70, // Below threshold
        memoryUsage: 60,
        diskUsage: 40,
        activeConnections: 100,
        requestsPerMinute: 1000,
        errorRate: 2,
        averageResponseTime: 500,
        queueDepth: 10,
        creditSystemHealth: {
          balanceAccuracy: 99.9,
          transactionProcessingTime: 150,
          ledgerIntegrity: true,
          fraudDetectionAlerts: 2,
          failedTransactions: 5,
          pendingTransactions: 10
        },
        modelPerformance: [],
        paymentSystemHealth: {
          successRate: 99,
          averageProcessingTime: 2000,
          failedPayments: 1,
          pendingPayments: 2,
          providerStatus: {}
        }
      };

      jest.spyOn(monitoringService, 'getAlertThresholds').mockResolvedValue(mockThresholds);

      const alerts = await monitoringService.checkThresholds(mockMetrics);

      expect(alerts).toHaveLength(0);
      expect(mockNotificationService.sendNotification).not.toHaveBeenCalled();
    });

    it('should respect cooldown period', async () => {
      const mockThresholds: AlertThreshold[] = [
        {
          id: 'threshold-1',
          name: 'High CPU Usage',
          metric: 'cpuUsage',
          operator: 'gt',
          value: 80,
          severity: AlertSeverity.HIGH,
          enabled: true,
          cooldownMinutes: 15,
          recipients: ['admin@example.com'],
          channels: ['email'],
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const mockMetrics: SystemHealthMetrics = {
        timestamp: new Date(),
        cpuUsage: 90,
        memoryUsage: 60,
        diskUsage: 40,
        activeConnections: 100,
        requestsPerMinute: 1000,
        errorRate: 2,
        averageResponseTime: 500,
        queueDepth: 10,
        creditSystemHealth: {
          balanceAccuracy: 99.9,
          transactionProcessingTime: 150,
          ledgerIntegrity: true,
          fraudDetectionAlerts: 2,
          failedTransactions: 5,
          pendingTransactions: 10
        },
        modelPerformance: [],
        paymentSystemHealth: {
          successRate: 99,
          averageProcessingTime: 2000,
          failedPayments: 1,
          pendingPayments: 2,
          providerStatus: {}
        }
      };

      jest.spyOn(monitoringService, 'getAlertThresholds').mockResolvedValue(mockThresholds);

      // Set cooldown (simulate recent alert)
      (monitoringService as any).alertCooldowns.set('threshold-1', new Date());

      const alerts = await monitoringService.checkThresholds(mockMetrics);

      expect(alerts).toHaveLength(0);
      expect(mockNotificationService.sendNotification).not.toHaveBeenCalled();
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge alert successfully', async () => {
      const mockAlert = {
        exists: true,
        data: () => ({
          id: 'alert-1',
          acknowledged: false
        })
      };

      mockDoc.get.mockResolvedValueOnce(mockAlert);
      mockDoc.update.mockResolvedValueOnce(undefined);

      const result = await monitoringService.acknowledgeAlert('alert-1', 'admin-user');

      expect(result).toBe(true);
      expect(mockDoc.update).toHaveBeenCalledWith({
        acknowledged: true,
        acknowledgedBy: 'admin-user',
        acknowledgedAt: expect.any(Date)
      });
    });

    it('should return false for non-existent alert', async () => {
      mockDoc.get.mockResolvedValueOnce({ exists: false });

      const result = await monitoringService.acknowledgeAlert('alert-1', 'admin-user');

      expect(result).toBe(false);
      expect(mockDoc.update).not.toHaveBeenCalled();
    });
  });

  describe('resolveAlert', () => {
    it('should resolve alert successfully', async () => {
      const mockAlert = {
        exists: true,
        data: () => ({
          id: 'alert-1',
          resolvedAt: null
        })
      };

      mockDoc.get.mockResolvedValueOnce(mockAlert);
      mockDoc.update.mockResolvedValueOnce(undefined);

      const result = await monitoringService.resolveAlert('alert-1', 'admin-user');

      expect(result).toBe(true);
      expect(mockDoc.update).toHaveBeenCalledWith({
        resolvedAt: expect.any(Date)
      });
    });
  });

  describe('getActiveAlerts', () => {
    it('should retrieve active alerts successfully', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          metric: 'cpuUsage',
          currentValue: 90,
          severity: AlertSeverity.HIGH,
          triggeredAt: new Date()
        }
      ];

      const mockSnapshot = {
        docs: mockAlerts.map(alert => ({
          id: alert.id,
          data: () => alert
        }))
      };

      mockCollection.where().orderBy().get.mockResolvedValueOnce(mockSnapshot);

      const result = await monitoringService.getActiveAlerts();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('alert-1');
      expect(result[0].metric).toBe('cpuUsage');
    });
  });
});