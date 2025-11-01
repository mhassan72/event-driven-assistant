/**
 * Admin Model Service Integration Tests
 * Tests for the AdminModelService class functionality
 */

import { AdminModelService } from '../../src/features/ai-assistant/services/admin-model-service';
import { ModelManagementService } from '../../src/features/ai-assistant/services/model-management-service';
import { logger } from '../../src/shared/observability/logger';
import { metrics } from '../../src/shared/observability/metrics';
import * as admin from 'firebase-admin';
import { AIModel, ModelCategory, ModelPricing } from '../../src/shared/types';

// Mock Firebase Admin
jest.mock('firebase-admin');

describe('AdminModelService Integration Tests', () => {
  let adminModelService: AdminModelService;
  let mockFirestore: any;
  let mockModelManagementService: any;

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
      runTransaction: jest.fn()
    };

    // Mock ModelManagementService
    mockModelManagementService = {
      registerModel: jest.fn(),
      updateModel: jest.fn(),
      deactivateModel: jest.fn(),
      getModelById: jest.fn(),
      getActiveModels: jest.fn(),
      getModelAnalytics: jest.fn(),
      updateModelPerformance: jest.fn()
    };

    adminModelService = new AdminModelService(
      mockFirestore,
      logger,
      metrics,
      mockModelManagementService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Model Configuration Management', () => {
    const testModel: AIModel = {
      id: 'test-model-1',
      name: 'Test Model 1',
      description: 'A test model for unit testing',
      category: ModelCategory.TEXT_GENERATION,
      provider: 'test-provider',
      apiEndpoint: 'https://api.test.com/v1/models/test-model-1',
      isActive: true,
      capabilities: {
        maxTokens: 4096,
        supportsStreaming: true,
        supportsImages: false,
        supportsTools: true,
        contextWindow: 4096
      },
      pricing: {
        modelId: 'test-model-1',
        category: ModelCategory.TEXT_GENERATION,
        costPer1kInputTokens: 5,
        costPer1kOutputTokens: 8,
        minimumCost: 1,
        currency: 'credits',
        lastUpdated: new Date()
      },
      performance: {
        averageLatency: 1200,
        tokensPerSecond: 150,
        qualityScore: 8.5,
        speedScore: 9.0,
        costScore: 8.8,
        reliabilityScore: 9.2
      },
      metadata: {
        addedAt: new Date(),
        lastUpdated: new Date(),
        addedBy: 'admin',
        tags: ['test']
      }
    };

    it('should add a new model successfully', async () => {
      mockModelManagementService.registerModel.mockResolvedValue(undefined);
      mockFirestore.add.mockResolvedValue({ id: 'audit-log-1' });

      await adminModelService.addModel(testModel);

      expect(mockModelManagementService.registerModel).toHaveBeenCalledWith(testModel);
      expect(mockFirestore.collection).toHaveBeenCalledWith('admin_audit_log');
      expect(mockFirestore.add).toHaveBeenCalled();
    });

    it('should update an existing model', async () => {
      const updates = { name: 'Updated Test Model', isActive: false };
      mockModelManagementService.updateModel.mockResolvedValue(undefined);
      mockFirestore.add.mockResolvedValue({ id: 'audit-log-2' });

      await adminModelService.updateModel('test-model-1', updates);

      expect(mockModelManagementService.updateModel).toHaveBeenCalledWith('test-model-1', updates);
      expect(mockFirestore.collection).toHaveBeenCalledWith('admin_audit_log');
    });

    it('should delete a model (soft delete)', async () => {
      mockModelManagementService.deactivateModel.mockResolvedValue(undefined);
      mockModelManagementService.getModelById.mockResolvedValue(testModel);
      mockModelManagementService.updateModel.mockResolvedValue(undefined);
      mockFirestore.add.mockResolvedValue({ id: 'audit-log-3' });

      await adminModelService.deleteModel('test-model-1');

      expect(mockModelManagementService.deactivateModel).toHaveBeenCalledWith('test-model-1');
      expect(mockModelManagementService.updateModel).toHaveBeenCalledWith('test-model-1', expect.objectContaining({
        metadata: expect.objectContaining({
          deprecated: true,
          deletedBy: 'admin'
        })
      }));
    });

    it('should get a specific model', async () => {
      mockModelManagementService.getModelById.mockResolvedValue(testModel);

      const result = await adminModelService.getModel('test-model-1');

      expect(result).toEqual(testModel);
      expect(mockModelManagementService.getModelById).toHaveBeenCalledWith('test-model-1');
    });

    it('should get all models including inactive ones', async () => {
      const mockModels = [testModel, { ...testModel, id: 'test-model-2', isActive: false }];
      mockFirestore.get.mockResolvedValue({
        docs: mockModels.map(model => ({
          id: model.id,
          data: () => model
        }))
      });

      const result = await adminModelService.getAllModels();

      expect(result).toHaveLength(2);
      expect(mockFirestore.collection).toHaveBeenCalledWith('available_models');
    });

    it('should handle errors when adding model', async () => {
      const error = new Error('Database connection failed');
      mockModelManagementService.registerModel.mockRejectedValue(error);

      await expect(adminModelService.addModel(testModel)).rejects.toThrow(error);
    });
  });

  describe('Pricing Configuration', () => {
    const testPricing: ModelPricing = {
      modelId: 'test-model-1',
      category: ModelCategory.TEXT_GENERATION,
      costPer1kInputTokens: 6,
      costPer1kOutputTokens: 10,
      minimumCost: 2,
      currency: 'credits',
      lastUpdated: new Date()
    };

    it('should update model pricing', async () => {
      mockModelManagementService.updateModel.mockResolvedValue(undefined);
      mockFirestore.add.mockResolvedValue({ id: 'audit-log-4' });

      await adminModelService.updateModelPricing('test-model-1', testPricing);

      expect(mockModelManagementService.updateModel).toHaveBeenCalledWith('test-model-1', { pricing: testPricing });
    });

    it('should get pricing configuration', async () => {
      const mockPricingConfig = {
        globalSettings: {
          defaultCurrency: 'credits',
          minimumCreditCost: 1,
          pricingUpdateFrequency: 'weekly',
          autoAdjustPricing: false
        },
        categoryMultipliers: {
          [ModelCategory.TEXT_GENERATION]: 1.0,
          [ModelCategory.VISION_MODEL]: 1.5,
          [ModelCategory.IMAGE_GENERATION]: 2.0,
          [ModelCategory.EMBEDDINGS]: 0.5
        },
        qualityPremiums: {
          'standard': 1.0,
          'high': 1.3,
          'premium': 1.6
        },
        volumeDiscounts: [],
        lastUpdated: new Date()
      };

      mockFirestore.get.mockResolvedValue({
        exists: true,
        data: () => mockPricingConfig
      });

      const result = await adminModelService.getPricingConfiguration();

      expect(result).toEqual(mockPricingConfig);
      expect(mockFirestore.collection).toHaveBeenCalledWith('admin_config');
      expect(mockFirestore.doc).toHaveBeenCalledWith('pricing');
    });

    it('should create default pricing configuration if none exists', async () => {
      mockFirestore.get.mockResolvedValue({ exists: false });
      mockFirestore.set.mockResolvedValue(undefined);

      const result = await adminModelService.getPricingConfiguration();

      expect(result.globalSettings.defaultCurrency).toBe('credits');
      expect(mockFirestore.set).toHaveBeenCalled();
    });

    it('should update pricing configuration', async () => {
      const newConfig = {
        globalSettings: {
          defaultCurrency: 'credits',
          minimumCreditCost: 2,
          pricingUpdateFrequency: 'daily',
          autoAdjustPricing: true
        },
        categoryMultipliers: {
          [ModelCategory.TEXT_GENERATION]: 1.1,
          [ModelCategory.VISION_MODEL]: 1.6,
          [ModelCategory.IMAGE_GENERATION]: 2.2,
          [ModelCategory.EMBEDDINGS]: 0.6
        },
        qualityPremiums: {
          'standard': 1.0,
          'high': 1.4,
          'premium': 1.8
        },
        volumeDiscounts: [],
        lastUpdated: new Date()
      };

      mockFirestore.set.mockResolvedValue(undefined);
      mockFirestore.add.mockResolvedValue({ id: 'audit-log-5' });

      await adminModelService.updatePricingConfiguration(newConfig);

      expect(mockFirestore.set).toHaveBeenCalledWith(expect.objectContaining({
        ...newConfig,
        lastUpdated: expect.any(Date)
      }));
    });
  });

  describe('Performance Monitoring', () => {
    it('should get model performance metrics', async () => {
      const mockAnalytics = {
        usage: {
          totalRequests: 1000,
          totalTokensProcessed: 50000,
          totalCreditsConsumed: 5000,
          uniqueUsers: 100,
          averageRequestSize: 50,
          medianRequestSize: 45,
          requestSizeDistribution: [],
          peakUsageHours: [],
          usageByDayOfWeek: [],
          seasonalPatterns: [],
          featureUsage: [],
          taskTypeDistribution: [],
          geographicUsage: []
        },
        performance: {
          averageLatency: 1200,
          errorRate: 0.5,
          userSatisfactionScore: 8.5
        },
        lastUpdated: new Date(),
        dataFreshness: {
          lastUpdated: new Date(),
          updateFrequency: 'hourly' as any,
          staleness: 0,
          isStale: false
        }
      };

      mockModelManagementService.getModelAnalytics.mockResolvedValue(mockAnalytics);

      const timeRange = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        granularity: 'day' as any
      };

      const result = await adminModelService.getModelPerformanceMetrics('test-model-1', timeRange);

      expect(result.modelId).toBe('test-model-1');
      expect(result.metrics.totalRequests).toBe(1000);
      expect(result.metrics.successRate).toBe(99.5); // 100 - 0.5 error rate
      expect(mockModelManagementService.getModelAnalytics).toHaveBeenCalledWith('test-model-1', timeRange);
    });

    it('should update model performance', async () => {
      const performance = {
        averageLatency: 1100,
        tokensPerSecond: 160,
        qualityScore: 8.7,
        speedScore: 9.2,
        costScore: 8.9,
        reliabilityScore: 9.3
      };

      mockModelManagementService.updateModelPerformance.mockResolvedValue(undefined);
      mockFirestore.add.mockResolvedValue({ id: 'audit-log-6' });

      await adminModelService.updateModelPerformance('test-model-1', performance);

      expect(mockModelManagementService.updateModelPerformance).toHaveBeenCalledWith('test-model-1', performance);
    });

    it('should get system performance overview', async () => {
      const mockModels = [
        { ...testModel, isActive: true },
        { ...testModel, id: 'test-model-2', isActive: false }
      ];

      mockFirestore.get.mockResolvedValue({
        docs: mockModels.map(model => ({
          id: model.id,
          data: () => model
        }))
      });

      const result = await adminModelService.getSystemPerformanceOverview();

      expect(result.totalModels).toBe(2);
      expect(result.activeModels).toBe(1);
      expect(result.systemHealth).toBeDefined();
      expect(result.overallMetrics).toBeDefined();
    });
  });

  describe('Analytics Dashboard', () => {
    it('should get model usage analytics', async () => {
      mockModelManagementService.getActiveModels.mockResolvedValue([testModel]);

      const result = await adminModelService.getModelUsageAnalytics();

      expect(result.timeRange).toBeDefined();
      expect(result.totalRequests).toBeDefined();
      expect(result.totalCreditsConsumed).toBeDefined();
      expect(result.uniqueUsers).toBeDefined();
    });

    it('should get revenue analytics', async () => {
      mockModelManagementService.getActiveModels.mockResolvedValue([testModel]);

      const result = await adminModelService.getRevenueAnalytics();

      expect(result.timeRange).toBeDefined();
      expect(result.totalRevenue).toBeDefined();
      expect(result.averageRevenuePerUser).toBeDefined();
      expect(result.projectedMonthlyRevenue).toBeDefined();
    });

    it('should get user behavior analytics', async () => {
      const result = await adminModelService.getUserBehaviorAnalytics();

      expect(result.timeRange).toBeDefined();
      expect(result.totalUsers).toBeDefined();
      expect(result.activeUsers).toBeDefined();
      expect(result.sessionDuration).toBeDefined();
    });
  });

  describe('User Preference Analysis', () => {
    it('should get user preference analytics', async () => {
      mockFirestore.get.mockResolvedValue({ size: 250 });

      const result = await adminModelService.getUserPreferenceAnalytics();

      expect(result.totalUsers).toBeDefined();
      expect(result.preferencesSet).toBe(250);
      expect(result.modelPreferences).toBeDefined();
      expect(result.selectionCriteria).toBeDefined();
    });

    it('should get model recommendations', async () => {
      const result = await adminModelService.getModelRecommendations();

      expect(Array.isArray(result)).toBe(true);
    });

    it('should get user-specific recommendations', async () => {
      const result = await adminModelService.getModelRecommendations('user-123');

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Cost Optimization', () => {
    it('should get cost optimization report', async () => {
      const result = await adminModelService.getCostOptimizationReport();

      expect(result.generatedAt).toBeDefined();
      expect(result.timeRange).toBeDefined();
      expect(result.currentCosts).toBeDefined();
      expect(result.opportunities).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.projectedSavings).toBeDefined();
    });

    it('should optimize model pricing', async () => {
      mockFirestore.get.mockResolvedValue({
        docs: [testModel].map(model => ({
          id: model.id,
          data: () => model
        }))
      });
      mockFirestore.add.mockResolvedValue({ id: 'audit-log-7' });

      const result = await adminModelService.optimizeModelPricing('cost_reduction');

      expect(result.strategy).toBe('cost_reduction');
      expect(result.changes).toBeDefined();
      expect(result.projectedImpact).toBeDefined();
      expect(result.implementationPlan).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle model management service errors', async () => {
      const error = new Error('Model service unavailable');
      mockModelManagementService.registerModel.mockRejectedValue(error);

      await expect(adminModelService.addModel(testModel)).rejects.toThrow(error);
    });

    it('should handle firestore errors', async () => {
      const error = new Error('Firestore connection failed');
      mockFirestore.get.mockRejectedValue(error);

      await expect(adminModelService.getAllModels()).rejects.toThrow(error);
    });

    it('should handle missing model gracefully', async () => {
      mockModelManagementService.getModelById.mockResolvedValue(null);

      const result = await adminModelService.getModel('non-existent-model');

      expect(result).toBeNull();
    });
  });

  describe('Audit Logging', () => {
    it('should log admin actions', async () => {
      mockModelManagementService.registerModel.mockResolvedValue(undefined);
      mockFirestore.add.mockResolvedValue({ id: 'audit-log-8' });

      await adminModelService.addModel(testModel);

      expect(mockFirestore.collection).toHaveBeenCalledWith('admin_audit_log');
      expect(mockFirestore.add).toHaveBeenCalledWith(expect.objectContaining({
        action: 'add_model',
        data: expect.objectContaining({
          modelId: 'test-model-1',
          model: testModel
        })
      }));
    });

    it('should log pricing updates', async () => {
      mockModelManagementService.updateModel.mockResolvedValue(undefined);
      mockFirestore.add.mockResolvedValue({ id: 'audit-log-9' });

      const pricing = {
        modelId: 'test-model-1',
        category: ModelCategory.TEXT_GENERATION,
        costPer1kInputTokens: 7,
        costPer1kOutputTokens: 12,
        minimumCost: 3,
        currency: 'credits',
        lastUpdated: new Date()
      };

      await adminModelService.updateModelPricing('test-model-1', pricing);

      expect(mockFirestore.add).toHaveBeenCalledWith(expect.objectContaining({
        action: 'update_pricing',
        data: expect.objectContaining({
          modelId: 'test-model-1',
          pricing
        })
      }));
    });
  });
});