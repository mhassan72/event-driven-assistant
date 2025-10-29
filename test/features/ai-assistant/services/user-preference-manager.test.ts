/**
 * User Preference Manager Tests
 * Unit tests for user model preferences, intelligent selection, and budget enforcement
 */

import { 
  UserPreferenceManager, 
  IUserPreferenceManager,
  UsagePatternAnalysis,
  ModelUsagePattern
} from '@features/ai-assistant/services/user-preference-manager';
import { 
  UserModelPreferences, 
  TaskType, 
  ModelRequirements, 
  AIModel, 
  ModelCategory,
  BudgetLimits,
  ModelSelection
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

describe('UserPreferenceManager', () => {
  let service: IUserPreferenceManager;
  let mockCollection: any;
  let mockDoc: any;
  
  const testUserId = 'user-123';
  
  const mockPreferences: UserModelPreferences = {
    textGeneration: {
      primaryModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
      fallbackModel: 'google/gemma-2-2b-it',
      autoSelectBest: true,
      selectionCriteria: {
        prioritizeSpeed: true,
        prioritizeCost: false,
        prioritizeQuality: false,
        maxCostPerRequest: 50
      }
    },
    visionTasks: {
      primaryModel: 'google/gemma-3-27b-it',
      fallbackModel: 'nvidia/Nemotron-Nano-V2-12b',
      autoSelectBest: true,
      selectionCriteria: {
        prioritizeSpeed: false,
        prioritizeCost: true,
        prioritizeQuality: true,
        maxCostPerRequest: 100
      }
    },
    imageGeneration: {
      primaryModel: 'black-forest-labs/flux-schnell',
      fallbackModel: 'black-forest-labs/flux-dev',
      autoSelectBest: false,
      selectionCriteria: {
        prioritizeSpeed: true,
        prioritizeCost: true,
        prioritizeQuality: false,
        maxCostPerRequest: 150
      }
    },
    embeddings: {
      primaryModel: 'BAAI/bge-en-icl',
      autoSelectBest: false,
      selectionCriteria: {
        prioritizeSpeed: true,
        prioritizeCost: true,
        prioritizeQuality: false,
        maxCostPerRequest: 10
      }
    },
    budgetLimits: {
      dailyLimit: 500,
      weeklyLimit: 2000,
      monthlyLimit: 5000,
      perRequestLimit: 100,
      alertThresholds: {
        daily: 400,
        weekly: 1600,
        monthly: 4000
      }
    },
    globalSettings: {
      autoSelectModel: true,
      fallbackEnabled: true,
      costOptimizationEnabled: true,
      qualityThreshold: 7,
      maxRetries: 3
    },
    lastUpdated: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockDoc = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: jest.fn().mockReturnValue(mockPreferences)
      }),
      update: jest.fn().mockResolvedValue(undefined),
      exists: true,
      data: jest.fn().mockReturnValue(mockPreferences)
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
    
    service = new UserPreferenceManager(mockFirestore, mockLogger, mockMetrics);
  });

  describe('User Preferences Management', () => {

    it('should get user preferences successfully', async () => {
      mockDoc.exists = true;
      mockDoc.data.mockReturnValue(mockPreferences);

      const result = await service.getUserPreferences(testUserId);

      expect(mockFirestore.collection).toHaveBeenCalledWith('user_model_preferences');
      expect(mockCollection.doc).toHaveBeenCalledWith(testUserId);
      expect(result).toEqual(mockPreferences);
    });

    it('should create default preferences for new user', async () => {
      mockDoc.get.mockResolvedValue({
        exists: false,
        data: jest.fn()
      });

      const result = await service.getUserPreferences(testUserId);

      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          textGeneration: expect.any(Object),
          budgetLimits: expect.any(Object),
          globalSettings: expect.any(Object)
        }),
        { merge: true }
      );
      expect(result.textGeneration.primaryModel).toBe('meta-llama/Meta-Llama-3.1-8B-Instruct');
    });

    it('should update user preferences successfully', async () => {
      const updates = {
        budgetLimits: {
          dailyLimit: 1000,
          weeklyLimit: 4000,
          monthlyLimit: 10000,
          perRequestLimit: 200,
          alertThresholds: {
            daily: 800,
            weekly: 3200,
            monthly: 8000
          }
        }
      };

      await service.updateUserPreferences(testUserId, updates);

      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          ...updates,
          lastUpdated: expect.any(Object)
        }),
        { merge: true }
      );
      expect(mockLogger.info).toHaveBeenCalledWith('User preferences updated', { userId: testUserId });
      expect(mockMetrics.increment).toHaveBeenCalledWith('user_preferences.updated');
    });

    it('should reset user preferences to defaults', async () => {
      await service.resetUserPreferences(testUserId);

      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          textGeneration: expect.any(Object),
          budgetLimits: expect.any(Object)
        }),
        { merge: true }
      );
      expect(mockLogger.info).toHaveBeenCalledWith('User preferences reset to defaults', { userId: testUserId });
    });
  });

  describe('Task-Specific Preferences', () => {
    beforeEach(() => {
      const taskPreferences = {
        ...mockPreferences,
        textGeneration: {
          ...mockPreferences.textGeneration,
          primaryModel: 'test-text-model'
        },
        visionTasks: {
          ...mockPreferences.visionTasks,
          primaryModel: 'test-vision-model'
        },
        imageGeneration: {
          ...mockPreferences.imageGeneration,
          primaryModel: 'test-image-model'
        }
      };
      
      mockDoc.get.mockResolvedValue({
        exists: true,
        data: jest.fn().mockReturnValue(taskPreferences)
      });
      mockDoc.data.mockReturnValue(taskPreferences);
    });

    it('should get text generation preference for chat tasks', async () => {
      const result = await service.getTaskPreference(testUserId, TaskType.QUICK_CHAT);

      expect(result.primaryModel).toBe('test-text-model');
      expect(result.selectionCriteria.prioritizeSpeed).toBe(true);
    });

    it('should get vision preference for vision tasks', async () => {
      const result = await service.getTaskPreference(testUserId, TaskType.VISION_ANALYSIS);

      expect(result.primaryModel).toBe('test-vision-model');
      expect(result.selectionCriteria.prioritizeQuality).toBe(true);
    });

    it('should get image generation preference for image tasks', async () => {
      const result = await service.getTaskPreference(testUserId, TaskType.IMAGE_GENERATION);

      expect(result.primaryModel).toBe('test-image-model');
      expect(result.selectionCriteria.prioritizeCost).toBe(true);
    });

    it('should update task preference successfully', async () => {
      const newPreference = {
        primaryModel: 'new-model',
        fallbackModel: 'fallback-model',
        autoSelectBest: false,
        selectionCriteria: {
          prioritizeSpeed: false,
          prioritizeCost: true,
          prioritizeQuality: true,
          maxCostPerRequest: 75
        }
      };

      await service.updateTaskPreference(testUserId, TaskType.QUICK_CHAT, newPreference);

      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          textGeneration: newPreference
        }),
        { merge: true }
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Task preference updated', { 
        userId: testUserId, 
        taskType: TaskType.QUICK_CHAT 
      });
    });
  });

  describe('Budget Management', () => {
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
      const budgetPreferences = {
        ...mockPreferences,
        budgetLimits: mockBudgetLimits
      };
      
      mockDoc.get.mockResolvedValue({
        exists: true,
        data: jest.fn().mockReturnValue(budgetPreferences)
      });
      mockDoc.data.mockReturnValue(budgetPreferences);
    });

    it('should get budget limits successfully', async () => {
      const result = await service.getBudgetLimits(testUserId);

      expect(result).toEqual(mockBudgetLimits);
    });

    it('should update budget limits successfully', async () => {
      const newLimits: BudgetLimits = {
        dailyLimit: 1000,
        weeklyLimit: 4000,
        monthlyLimit: 10000,
        perRequestLimit: 200,
        alertThresholds: {
          daily: 800,
          weekly: 3200,
          monthly: 8000
        }
      };

      await service.updateBudgetLimits(testUserId, newLimits);

      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          budgetLimits: newLimits
        }),
        { merge: true }
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Budget limits updated', { userId: testUserId });
    });

    it('should check budget constraints and return within budget', async () => {
      // Mock getCurrentUsage method
      jest.spyOn(service as any, 'getCurrentUsage').mockResolvedValue({
        daily: 100,
        weekly: 300,
        monthly: 1000
      });

      const result = await service.checkBudgetConstraints(testUserId, 50);

      expect(result.withinBudget).toBe(true);
      expect(result.remainingDaily).toBeGreaterThan(0);
      expect(result.exceedsLimit).toHaveLength(0);
    });

    it('should check budget constraints and detect violations', async () => {
      // Mock getCurrentUsage method to exceed daily limit
      jest.spyOn(service as any, 'getCurrentUsage').mockResolvedValue({
        daily: 450,
        weekly: 1500,
        monthly: 4500
      });

      const result = await service.checkBudgetConstraints(testUserId, 100);

      expect(result.withinBudget).toBe(false);
      expect(result.exceedsLimit.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Intelligent Model Selection', () => {
    const testUserId = 'user-123';
    const mockRequirements: ModelRequirements = {
      taskType: TaskType.QUICK_CHAT,
      inputSize: 1000,
      expectedOutputSize: 500,
      maxBudget: 50,
      maxLatency: 3000,
      qualityThreshold: 7
    };

    const mockModels: AIModel[] = [
      {
        id: 'fast-model',
        name: 'Fast Model',
        description: 'Fast but lower quality',
        category: ModelCategory.TEXT_GENERATION,
        provider: 'test',
        apiEndpoint: 'https://api.test.com',
        isActive: true,
        capabilities: {
          maxTokens: 4096,
          supportsStreaming: true,
          supportsImages: false,
          supportsTools: true,
          contextWindow: 4096
        },
        pricing: {
          modelId: 'fast-model',
          category: ModelCategory.TEXT_GENERATION,
          costPer1kInputTokens: 5,
          costPer1kOutputTokens: 8,
          minimumCost: 1,
          currency: 'credits',
          lastUpdated: new Date()
        },
        performance: {
          averageLatency: 1000,
          tokensPerSecond: 200,
          qualityScore: 7.5,
          speedScore: 9.5,
          costScore: 9.0,
          reliabilityScore: 8.5
        },
        metadata: {
          addedAt: new Date(),
          lastUpdated: new Date(),
          addedBy: 'test',
          tags: ['fast', 'cost-effective']
        }
      },
      {
        id: 'quality-model',
        name: 'Quality Model',
        description: 'High quality but slower',
        category: ModelCategory.TEXT_GENERATION,
        provider: 'test',
        apiEndpoint: 'https://api.test.com',
        isActive: true,
        capabilities: {
          maxTokens: 8192,
          supportsStreaming: true,
          supportsImages: false,
          supportsTools: true,
          contextWindow: 8192
        },
        pricing: {
          modelId: 'quality-model',
          category: ModelCategory.TEXT_GENERATION,
          costPer1kInputTokens: 15,
          costPer1kOutputTokens: 20,
          minimumCost: 2,
          currency: 'credits',
          lastUpdated: new Date()
        },
        performance: {
          averageLatency: 2500,
          tokensPerSecond: 100,
          qualityScore: 9.2,
          speedScore: 6.5,
          costScore: 6.0,
          reliabilityScore: 9.5
        },
        metadata: {
          addedAt: new Date(),
          lastUpdated: new Date(),
          addedBy: 'test',
          tags: ['high-quality', 'premium']
        }
      }
    ];

    beforeEach(() => {
      // Mock user preferences with complete data
      const selectionPreferences = {
        ...mockPreferences,
        textGeneration: {
          ...mockPreferences.textGeneration,
          primaryModel: 'fast-model',
          selectionCriteria: {
            prioritizeSpeed: true,
            prioritizeCost: false,
            prioritizeQuality: false,
            maxCostPerRequest: 50
          }
        }
      };
      
      mockDoc.get.mockResolvedValue({
        exists: true,
        data: jest.fn().mockReturnValue(selectionPreferences)
      });
      mockDoc.data.mockReturnValue(selectionPreferences);

      // Mock usage analysis
      const mockUsageAnalysis: UsagePatternAnalysis = {
        userId: testUserId,
        analysisDate: new Date(),
        mostUsedModels: [{ 
          modelId: 'fast-model', 
          modelName: 'Fast Model',
          usageCount: 50, 
          usagePercentage: 80,
          averageCost: 25,
          averageSatisfaction: 8.5,
          taskTypes: [TaskType.QUICK_CHAT]
        }],
        taskTypeDistribution: [],
        timePatterns: [],
        performancePreferences: [],
        costSensitivity: { level: 'medium' as any, maxAcceptableCost: 50, costVsQualityTradeoff: 0.6, budgetUtilization: 0.7 },
        optimizationOpportunities: [],
        suggestedPreferenceChanges: []
      };
      
      // Mock the analyzeUsagePatterns method
      jest.spyOn(service, 'analyzeUsagePatterns').mockResolvedValue(mockUsageAnalysis);
    });

    it('should select optimal model based on requirements and preferences', async () => {
      const result = await service.selectOptimalModel(testUserId, mockRequirements, mockModels);

      expect(result.selectedModel).toBeDefined();
      expect(result.reason).toBeDefined();
      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(result.fallbackModels).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should throw error when no models meet requirements', async () => {
      const strictRequirements: ModelRequirements = {
        ...mockRequirements,
        maxLatency: 500, // Very strict latency requirement
        qualityThreshold: 10 // Impossible quality threshold
      };

      await expect(service.selectOptimalModel(testUserId, strictRequirements, mockModels))
        .rejects.toThrow('No models meet the specified requirements');
    });

    it('should select model for specific task type', async () => {
      const result = await service.selectModelForTask(testUserId, TaskType.QUICK_CHAT, mockModels);

      expect(result.selectedModel).toBeDefined();
      expect(result.selectionCriteria).toBeDefined();
    });
  });

  describe('Cost Tracking and Analytics', () => {
    beforeEach(() => {
      // Set up complete preferences for cost analytics
      mockDoc.get.mockResolvedValue({
        exists: true,
        data: jest.fn().mockReturnValue(mockPreferences)
      });
      mockDoc.data.mockReturnValue(mockPreferences);
      
      // Mock getCurrentUsage for budget utilization
      jest.spyOn(service as any, 'getCurrentUsage').mockResolvedValue({
        daily: 100,
        weekly: 300,
        monthly: 1000
      });
    });

    it('should track model costs successfully', async () => {
      await service.trackModelCosts(testUserId, 'test-model', 25);

      expect(mockCollection.add).toHaveBeenCalledWith({
        userId: testUserId,
        modelId: 'test-model',
        cost: 25,
        timestamp: expect.any(Object)
      });
    });

    it('should get cost analytics for user', async () => {
      const mockCostRecords = {
        docs: [
          { data: () => ({ cost: 25, modelId: 'model-1', timestamp: new Date() }) },
          { data: () => ({ cost: 35, modelId: 'model-2', timestamp: new Date() }) }
        ]
      };
      mockCollection.get.mockResolvedValue(mockCostRecords);

      const result = await service.getCostAnalytics(testUserId);

      expect(result.userId).toBe(testUserId);
      expect(result.totalCost).toBe(60);
      expect(result.costByModel).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should optimize for cost and suggest cheaper model', async () => {
      // Mock available models with different costs
      const cheaperModels = [
        {
          id: 'cheap-model',
          name: 'Cheap Model',
          category: ModelCategory.TEXT_GENERATION,
          pricing: {
            costPer1kInputTokens: 3,
            costPer1kOutputTokens: 5,
            minimumCost: 1
          },
          performance: {
            qualityScore: 7.0,
            speedScore: 8.0,
            costScore: 9.5
          }
        }
      ];
      jest.spyOn(service as any, 'getAvailableModelsForTask').mockResolvedValue(cheaperModels);

      const result = await service.optimizeForCost(testUserId, TaskType.QUICK_CHAT);

      expect(result.taskType).toBe(TaskType.QUICK_CHAT);
      expect(result.suggestedModel).toBeDefined();
      expect(result.reasoning).toBeDefined();
    });
  });

  describe('Usage Pattern Analysis', () => {
    const testUserId = 'user-123';

    it('should analyze usage patterns successfully', async () => {
      const mockUsageRecords = {
        docs: [
          { 
            data: () => ({ 
              modelId: 'model-1', 
              cost: 25, 
              timestamp: new Date(),
              taskType: TaskType.QUICK_CHAT,
              success: true
            }) 
          }
        ]
      };
      mockCollection.get.mockResolvedValue(mockUsageRecords);

      const result = await service.analyzeUsagePatterns(testUserId);

      expect(result.userId).toBe(testUserId);
      expect(result.analysisDate).toBeInstanceOf(Date);
      expect(result.mostUsedModels).toBeDefined();
      expect(result.taskTypeDistribution).toBeDefined();
      expect(result.optimizationOpportunities).toBeDefined();
    });

    it('should adapt preferences from usage patterns', async () => {
      const mockAnalysis: UsagePatternAnalysis = {
        userId: testUserId,
        analysisDate: new Date(),
        mostUsedModels: [],
        taskTypeDistribution: [],
        timePatterns: [],
        performancePreferences: [],
        costSensitivity: { level: 'medium' as any, maxAcceptableCost: 50, costVsQualityTradeoff: 0.6, budgetUtilization: 0.7 },
        optimizationOpportunities: [],
        suggestedPreferenceChanges: []
      };

      jest.spyOn(service, 'analyzeUsagePatterns').mockResolvedValue(mockAnalysis);

      await service.adaptPreferencesFromUsage(testUserId);

      expect(mockLogger.info).toHaveBeenCalledWith('Preferences adapted from usage patterns', { userId: testUserId });
    });
  });

  describe('Model Recommendations', () => {
    const testUserId = 'user-123';

    it('should generate model recommendations successfully', async () => {
      // Mock available models
      jest.spyOn(service as any, 'getAvailableModelsForTask').mockResolvedValue([]);
      
      // Mock usage patterns
      const mockUsageAnalysis: UsagePatternAnalysis = {
        userId: testUserId,
        analysisDate: new Date(),
        mostUsedModels: [],
        taskTypeDistribution: [],
        timePatterns: [],
        performancePreferences: [],
        costSensitivity: { level: 'medium' as any, maxAcceptableCost: 50, costVsQualityTradeoff: 0.6, budgetUtilization: 0.7 },
        optimizationOpportunities: [],
        suggestedPreferenceChanges: []
      };
      jest.spyOn(service, 'analyzeUsagePatterns').mockResolvedValue(mockUsageAnalysis);

      const result = await service.generateModelRecommendations(testUserId, TaskType.QUICK_CHAT);

      expect(result.userId).toBe(testUserId);
      expect(result.taskType).toBe(TaskType.QUICK_CHAT);
      expect(result.recommendations).toBeDefined();
      expect(result.generatedAt).toBeInstanceOf(Date);
      expect(result.validUntil).toBeInstanceOf(Date);
    });

    it('should update recommendation feedback successfully', async () => {
      const feedback = {
        modelId: 'test-model',
        wasUseful: true,
        rating: 4,
        comment: 'Good recommendation',
        actualPerformance: {
          latency: 1500,
          quality: 8,
          satisfaction: 9,
          cost: 25
        }
      };

      await service.updateRecommendationFeedback(testUserId, 'test-model', feedback);

      expect(mockCollection.add).toHaveBeenCalledWith({
        userId: testUserId,
        ...feedback,
        timestamp: expect.any(Object)
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Recommendation feedback recorded', { 
        userId: testUserId, 
        modelId: 'test-model' 
      });
    });
  });

  describe('Error Handling', () => {
    const testUserId = 'user-123';

    it('should handle Firestore errors gracefully', async () => {
      const error = new Error('Firestore connection failed');
      mockDoc.get.mockRejectedValue(error);

      await expect(service.getUserPreferences(testUserId)).rejects.toThrow('Firestore connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to get user preferences', { 
        userId: testUserId, 
        error 
      });
    });

    it('should handle budget validation errors', async () => {
      const error = new Error('Budget validation failed');
      mockDoc.get.mockRejectedValue(error);

      await expect(service.checkBudgetConstraints(testUserId, 100)).rejects.toThrow('Budget validation failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to check budget constraints', { 
        userId: testUserId, 
        estimatedCost: 100,
        error 
      });
    });
  });
});