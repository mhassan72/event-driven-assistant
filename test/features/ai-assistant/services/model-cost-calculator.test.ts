/**
 * Model Cost Calculator Tests
 * Unit tests for cost estimation, dynamic pricing, budget validation, and cost optimization
 */

import { 
  ModelCostCalculator, 
  IModelCostCalculator,
  CostEstimationRequest,
  RequestPriority,
  ImageSize,
  QualityLevel
} from '@features/ai-assistant/services/model-cost-calculator';
import { 
  AIModel, 
  ModelCategory, 
  BudgetLimits,
  ModelRequirements,
  TaskType
} from '@shared/types';
import * as admin from 'firebase-admin';

// Mock dependencies
const mockFirestore = {
  collection: jest.fn(),
  runTransaction: jest.fn()
} as any;

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
} as any;

const mockMetrics = {
  increment: jest.fn(),
  histogram: jest.fn(),
  gauge: jest.fn()
} as any;

describe('ModelCostCalculator', () => {
  let service: IModelCostCalculator;
  let mockCollection: any;
  let mockDoc: any;

  const testModel: AIModel = {
    id: 'test-model',
    name: 'Test Model',
    description: 'A test model for cost calculation',
    category: ModelCategory.TEXT_GENERATION,
    provider: 'test-provider',
    apiEndpoint: 'https://api.test.com/v1',
    isActive: true,
    capabilities: {
      maxTokens: 4096,
      supportsStreaming: true,
      supportsImages: false,
      supportsTools: true,
      contextWindow: 4096
    },
    pricing: {
      modelId: 'test-model',
      category: ModelCategory.TEXT_GENERATION,
      costPer1kInputTokens: 10,
      costPer1kOutputTokens: 15,
      minimumCost: 2,
      currency: 'credits',
      lastUpdated: new Date()
    },
    performance: {
      averageLatency: 1500,
      tokensPerSecond: 120,
      qualityScore: 8.5,
      speedScore: 9.0,
      costScore: 7.5,
      reliabilityScore: 9.2
    },
    metadata: {
      addedAt: new Date(),
      lastUpdated: new Date(),
      addedBy: 'test-admin',
      tags: ['test', 'cost-calculation']
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockDoc = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: jest.fn().mockReturnValue(testModel)
      }),
      update: jest.fn().mockResolvedValue(undefined),
      exists: true,
      data: jest.fn().mockReturnValue(testModel)
    };
    
    mockCollection = {
      doc: jest.fn().mockReturnValue(mockDoc),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: [],
        empty: true
      }),
      add: jest.fn().mockResolvedValue({ id: 'test-id' })
    };
    
    mockFirestore.collection.mockReturnValue(mockCollection);
    mockFirestore.runTransaction.mockImplementation((callback: any) => callback({
      get: jest.fn().mockResolvedValue(mockDoc),
      set: jest.fn(),
      update: jest.fn()
    }));
    
    service = new ModelCostCalculator(mockFirestore, mockLogger, mockMetrics);
    
    // Mock the getModelById method to return appropriate models
    jest.spyOn(service as any, 'getModelById').mockImplementation((...args: unknown[]) => {
      const modelId = args[0] as string;
      if (modelId === 'test-model') {
        return Promise.resolve(testModel);
      } else if (modelId === 'image-model') {
        return Promise.resolve({
          ...testModel,
          id: 'image-model',
          category: ModelCategory.IMAGE_GENERATION,
          pricing: {
            ...testModel.pricing,
            costPerImage: 50
          }
        });
      }
      return Promise.resolve(null);
    });
  });

  describe('Cost Estimation', () => {
    const basicRequest: CostEstimationRequest = {
      inputTokens: 1000,
      expectedOutputTokens: 500,
      priority: RequestPriority.NORMAL
    };

    it('should estimate request cost correctly for text generation', async () => {
      const result = await service.estimateRequestCost(testModel, basicRequest);

      // Expected: (1000/1000 * 10) + (500/1000 * 15) = 10 + 7.5 = 17.5
      expect(result.baseCost).toBeGreaterThan(0);
      expect(result.adjustedCost).toBeGreaterThan(0);
      expect(result.breakdown.inputTokenCost).toBe(10);
      expect(result.breakdown.outputTokenCost).toBe(7.5);
      expect(result.breakdown.total).toBeGreaterThanOrEqual(17.5);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.factors).toBeDefined();
      expect(result.alternatives).toBeDefined();
    });

    it('should apply minimum cost when calculated cost is below minimum', async () => {
      const smallRequest: CostEstimationRequest = {
        inputTokens: 10,
        expectedOutputTokens: 5,
        priority: RequestPriority.NORMAL
      };

      const result = await service.estimateRequestCost(testModel, smallRequest);

      // Should apply minimum cost of 2 credits
      expect(result.baseCost).toBe(2);
    });

    it('should apply priority adjustments correctly', async () => {
      const urgentRequest: CostEstimationRequest = {
        ...basicRequest,
        priority: RequestPriority.URGENT
      };

      const result = await service.estimateRequestCost(testModel, urgentRequest);

      expect(result.breakdown.priorityAdjustment).toBeGreaterThan(0);
      expect(result.adjustedCost).toBeGreaterThan(17.5); // Base cost + priority premium
    });

    it('should calculate image generation costs', async () => {
      const imageModel: AIModel = {
        ...testModel,
        id: 'image-model',
        category: ModelCategory.IMAGE_GENERATION,
        pricing: {
          ...testModel.pricing,
          costPerImage: 50
        }
      };

      const imageRequest: CostEstimationRequest = {
        inputTokens: 100,
        expectedOutputTokens: 0,
        imageCount: 2,
        imageSize: ImageSize.MEDIUM,
        quality: QualityLevel.HIGH
      };

      const result = await service.estimateRequestCost(imageModel, imageRequest);

      expect(result.breakdown.imageCost).toBeGreaterThan(0);
      // Should apply size and quality multipliers
      expect(result.breakdown.imageCost).toBeGreaterThan(100); // 2 images * 50 * multipliers
    });

    it('should include feature costs', async () => {
      const requestWithFeatures: CostEstimationRequest = {
        ...basicRequest,
        features: ['streaming', 'tools']
      };

      const result = await service.estimateRequestCost(testModel, requestWithFeatures);

      expect(result.breakdown.featureCosts.length).toBeGreaterThan(0);
      const totalFeatureCost = result.breakdown.featureCosts.reduce((sum: number, fc: any) => sum + fc.cost, 0);
      expect(totalFeatureCost).toBeGreaterThan(0);
    });
  });

  describe('Task Cost Estimation', () => {
    const taskRequirements: ModelRequirements = {
      taskType: TaskType.QUICK_CHAT,
      inputSize: 1000,
      expectedOutputSize: 500,
      maxBudget: 100,
      maxLatency: 3000,
      qualityThreshold: 7
    };

    it('should estimate task cost with model comparisons', async () => {
      // Mock available models
      const mockModels = [testModel];
      jest.spyOn(service as any, 'getAvailableModelsForTask').mockResolvedValue(mockModels);

      const result = await service.estimateTaskCost(TaskType.QUICK_CHAT, taskRequirements);

      expect(result.taskType).toBe(TaskType.QUICK_CHAT);
      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(result.costRange.minimum).toBeDefined();
      expect(result.costRange.maximum).toBeDefined();
      expect(result.recommendedModels.length).toBeGreaterThan(0);
      expect(result.budgetImpact).toBeDefined();
    });

    it('should handle no available models gracefully', async () => {
      jest.spyOn(service as any, 'getAvailableModelsForTask').mockResolvedValue([]);

      await expect(service.estimateTaskCost(TaskType.QUICK_CHAT, taskRequirements))
        .rejects.toThrow('No models available for task type: quick_chat');
    });
  });

  describe('Batch Cost Estimation', () => {
    it('should calculate batch costs with discounts', async () => {
      const batchRequests = [
        {
          modelId: 'test-model',
          requests: [
            { inputTokens: 1000, expectedOutputTokens: 500, priority: RequestPriority.NORMAL },
            { inputTokens: 800, expectedOutputTokens: 400, priority: RequestPriority.NORMAL }
          ]
        }
      ];

      // Mock model retrieval
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue(testModel);

      const result = await service.estimateBatchCost(batchRequests);

      expect(result.totalCost).toBeGreaterThan(0);
      expect(result.individualCosts.length).toBe(2);
      expect(result.breakdown.subtotal).toBeGreaterThan(0);
      expect(result.breakdown.perRequestAverage).toBeGreaterThan(0);
    });

    it('should apply batch discounts for large batches', async () => {
      const largeBatch = [
        {
          modelId: 'test-model',
          requests: Array(25).fill({ inputTokens: 100, expectedOutputTokens: 50, priority: RequestPriority.NORMAL })
        }
      ];

      const result = await service.estimateBatchCost(largeBatch);

      expect(result.batchDiscount).toBeGreaterThan(0);
      expect(result.savings).toBeGreaterThan(0);
    });
  });

  describe('Dynamic Pricing', () => {
    it('should get dynamic pricing with adjustments', async () => {
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue(testModel);

      const context = {
        timeOfDay: 14, // Peak hours
        dayOfWeek: 2,
        systemLoad: 0.9, // High load
        userTier: 'premium' as any,
        region: 'us-east-1'
      };

      const result = await service.getDynamicPricing('test-model', context);

      expect(result.modelId).toBe('test-model');
      expect(result.basePricing).toEqual(testModel.pricing);
      expect(result.adjustedPricing).toBeDefined();
      expect(result.adjustmentFactors.length).toBeGreaterThan(0);
      expect(result.validUntil).toBeInstanceOf(Date);
    });

    it('should cache dynamic pricing results', async () => {
      const getModelByIdSpy = jest.spyOn(service as any, 'getModelById');

      // First call
      await service.getDynamicPricing('test-model');
      
      // Second call should use cache
      await service.getDynamicPricing('test-model');

      // Should only call getModelById once due to caching
      expect(getModelByIdSpy).toHaveBeenCalledTimes(1);
    });

    it('should calculate surge pricing based on demand', async () => {
      const demandMetrics = {
        currentLoad: 150,
        averageLoad: 50,
        queueLength: 120,
        responseTime: 3000,
        errorRate: 0.05
      };

      const result = await service.calculateSurgePricing('test-model', demandMetrics);

      expect(result.modelId).toBe('test-model');
      expect(result.surgeMultiplier).toBeGreaterThan(1);
      expect(result.reason).toBeDefined();
      expect(result.estimatedDuration).toBeGreaterThan(0);
      expect(result.alternatives).toBeDefined();
    });

    it('should update model pricing successfully', async () => {
      const newPricing = {
        ...testModel.pricing,
        costPer1kInputTokens: 12,
        costPer1kOutputTokens: 18
      };

      await service.updateModelPricing('test-model', newPricing);

      expect(mockDoc.update).toHaveBeenCalledWith({
        pricing: newPricing,
        'metadata.lastUpdated': expect.any(Object)
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Model pricing updated', { modelId: 'test-model' });
    });
  });

  describe('Budget Validation', () => {
    const testUserId = 'user-123';
    const mockBudgetLimits: BudgetLimits = {
      dailyLimit: 500,
      weeklyLimit: 2000,
      monthlyLimit: 5000,
      perRequestLimit: 100,
      alertThresholds: {
        daily: 400,
        weekly: 1600,
        monthly: 4000
      }
    };

    beforeEach(() => {
      // Mock user preferences with budget limits
      mockDoc.data.mockReturnValue({ budgetLimits: mockBudgetLimits });
    });

    it('should validate budget successfully when within limits', async () => {
      // Mock current usage to be within limits
      const mockUsageQuery = {
        docs: [
          { data: () => ({ actualCost: 50 }) },
          { data: () => ({ actualCost: 75 }) }
        ]
      };
      mockCollection.get.mockResolvedValue(mockUsageQuery);

      const result = await service.validateBudget(testUserId, 50);

      expect(result.isValid).toBe(true);
      expect(result.remainingBudget.daily).toBeGreaterThan(0);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect budget violations', async () => {
      // Mock current usage to exceed limits
      const mockUsageQuery = {
        docs: [
          { data: () => ({ actualCost: 450 }) },
          { data: () => ({ actualCost: 40 }) }
        ]
      };
      mockCollection.get.mockResolvedValue(mockUsageQuery);

      const result = await service.validateBudget(testUserId, 100);

      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should reserve budget successfully', async () => {
      const reservationId = 'reservation-123';
      const amount = 50;

      const result = await service.reserveBudget(testUserId, amount, reservationId);

      expect(result.reservationId).toBe(reservationId);
      expect(result.userId).toBe(testUserId);
      expect(result.amount).toBe(amount);
      expect(result.status).toBe('active');
      expect(mockDoc.set).toHaveBeenCalledWith(expect.objectContaining({
        reservationId,
        userId: testUserId,
        amount
      }));
    });

    it('should release budget reservation', async () => {
      const reservationId = 'reservation-123';

      await service.releaseBudgetReservation(reservationId);

      expect(mockDoc.update).toHaveBeenCalledWith({
        status: 'released',
        releasedAt: expect.any(Object)
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Budget reservation released', { reservationId });
    });
  });

  describe('Real-time Cost Tracking', () => {
    const testUserId = 'user-123';
    const testModelId = 'test-model';

    it('should track real-time costs successfully', async () => {
      const usageMetrics = {
        inputTokens: 1000,
        outputTokens: 500,
        processingTime: 1500,
        quality: 8.5,
        success: true
      };

      mockDoc.exists = true;
      mockDoc.data.mockReturnValue(testModel);

      await service.trackRealTimeCost(testUserId, testModelId, usageMetrics);

      expect(mockCollection.add).toHaveBeenCalledWith({
        userId: testUserId,
        modelId: testModelId,
        usage: usageMetrics,
        actualCost: expect.any(Number),
        timestamp: expect.any(Object)
      });
      expect(mockMetrics.increment).toHaveBeenCalledWith('cost_calculator.real_time_tracking');
      expect(mockMetrics.histogram).toHaveBeenCalledWith('cost_calculator.actual_cost', expect.any(Number));
    });

    it('should get cost alerts for user', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          userId: testUserId,
          type: 'budget_threshold',
          threshold: 400,
          currentValue: 450,
          severity: 'warning',
          message: 'Daily budget threshold exceeded',
          createdAt: new Date(),
          acknowledged: false
        }
      ];

      const mockSnapshot = {
        docs: mockAlerts.map(alert => ({
          id: alert.id,
          data: () => alert
        }))
      };
      mockCollection.get.mockResolvedValue(mockSnapshot);

      const result = await service.getCostAlerts(testUserId);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('budget_threshold');
      expect(result[0].acknowledged).toBe(false);
    });

    it('should update cost thresholds', async () => {
      const thresholds = [
        {
          type: 'absolute_cost' as any,
          value: 400,
          period: 'day' as any,
          alertLevel: 'warning' as any
        }
      ];

      await service.updateCostThresholds(testUserId, thresholds);

      expect(mockDoc.set).toHaveBeenCalledWith({
        thresholds,
        updatedAt: expect.any(Object)
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Cost thresholds updated', { 
        userId: testUserId, 
        thresholdCount: 1 
      });
    });
  });

  describe('Cost Optimization', () => {
    const mockRequirements: ModelRequirements = {
      taskType: TaskType.QUICK_CHAT,
      inputSize: 1000,
      expectedOutputSize: 500,
      maxBudget: 50,
      qualityThreshold: 7
    };

    const mockModels: AIModel[] = [
      testModel,
      {
        ...testModel,
        id: 'cheaper-model',
        name: 'Cheaper Model',
        pricing: {
          ...testModel.pricing,
          costPer1kInputTokens: 5,
          costPer1kOutputTokens: 8
        },
        performance: {
          ...testModel.performance,
          qualityScore: 7.5,
          costScore: 9.5
        }
      }
    ];

    it('should find cost optimal model', async () => {
      const result = await service.findCostOptimalModel(mockRequirements, mockModels);

      expect(result.recommendedModel).toBeDefined();
      expect(result.alternatives.length).toBeGreaterThan(0);
      expect(result.reasoning).toBeDefined();
      expect(result.reasoning.confidence).toBeGreaterThan(0);
    });

    it('should suggest cost reductions', async () => {
      const usagePattern = {
        userId: 'user-123',
        timeRange: { startDate: new Date(), endDate: new Date() },
        totalCost: 1000,
        modelUsage: [
          { modelId: 'expensive-model', usageCount: 50, totalCost: 800, averageCost: 16 }
        ],
        taskDistribution: [
          { taskType: TaskType.QUICK_CHAT, usageCount: 100, totalCost: 1000, averageCost: 10 }
        ],
        peakUsageTimes: [
          { timeOfDay: 14, dayOfWeek: 2, usageCount: 20, cost: 300 }
        ]
      };

      // Mock cheaper alternatives
      jest.spyOn(service as any, 'findCheaperAlternatives').mockResolvedValue([
        { modelId: 'cheaper-model', estimatedCost: 8 }
      ]);

      const result = await service.suggestCostReductions('user-123', usagePattern);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBeDefined();
      expect(result[0].potentialSavings).toBeGreaterThan(0);
      expect(result[0].steps).toBeDefined();
    });

    it('should calculate ROI analysis', async () => {
      const usageProjection = {
        timeHorizon: 30,
        projectedUsage: [
          { date: new Date(), estimatedCost: 25, estimatedUsage: 100, confidence: 0.8 }
        ],
        confidence: 0.8,
        assumptions: ['Usage remains consistent']
      };

      const modelA = testModel;
      const modelB = { ...testModel, id: 'model-b' };

      const result = await service.calculateROI(modelA, modelB, usageProjection);

      expect(result.modelA).toBeDefined();
      expect(result.modelB).toBeDefined();
      expect(result.comparison).toBeDefined();
      expect(result.recommendation).toBeDefined();
      expect(result.recommendation.action).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle Firestore errors in cost estimation', async () => {
      const error = new Error('Firestore error');
      // Override the getModelById mock to throw an error for this test
      jest.spyOn(service as any, 'getModelById').mockRejectedValue(error);

      const request: CostEstimationRequest = {
        inputTokens: 1000,
        expectedOutputTokens: 500,
        priority: RequestPriority.NORMAL
      };

      await expect(service.estimateRequestCost(testModel, request)).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to estimate request cost', { 
        modelId: testModel.id, 
        error 
      });
    });

    it('should handle missing model in cost calculation', async () => {
      mockDoc.exists = false;

      const usageMetrics = {
        inputTokens: 1000,
        outputTokens: 500,
        processingTime: 1500,
        quality: 8.5,
        success: true
      };

      await expect(service.trackRealTimeCost('user-123', 'non-existent-model', usageMetrics))
        .rejects.toThrow('Model not found: non-existent-model');
    });

    it('should handle budget validation errors', async () => {
      const error = new Error('Budget validation failed');
      mockCollection.get.mockRejectedValue(error);

      await expect(service.validateBudget('user-123', 100)).rejects.toThrow('Budget validation failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to validate budget', { 
        userId: 'user-123', 
        estimatedCost: 100, 
        error 
      });
    });
  });
});