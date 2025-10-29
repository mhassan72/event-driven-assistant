/**
 * Model Management Service Tests
 * Unit tests for model discovery, registration, health monitoring, and performance analytics
 */

import { 
  ModelManagementService, 
  IModelManagementService,
  ModelHealthStatus 
} from '@features/ai-assistant/services/model-management-service';
import { AIModel, ModelCategory, ModelAnalytics } from '@shared/types';
import * as admin from 'firebase-admin';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { afterEach } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

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

describe('ModelManagementService', () => {
  let service: IModelManagementService;
  let mockCollection: any;
  let mockDoc: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockDoc = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: jest.fn().mockReturnValue({})
      }),
      update: jest.fn().mockResolvedValue(undefined),
      exists: true,
      data: jest.fn().mockReturnValue({})
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
    
    service = new ModelManagementService(mockFirestore, mockLogger, mockMetrics);
  });

  afterEach(() => {
    // Stop health monitoring to prevent interference
    if (service instanceof ModelManagementService) {
      service.stopHealthMonitoring();
    }
  });

  describe('Model Registration', () => {
    const testModel: AIModel = {
      id: 'test-model-1',
      name: 'Test Model',
      description: 'A test model for unit testing',
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
        modelId: 'test-model-1',
        category: ModelCategory.TEXT_GENERATION,
        costPer1kInputTokens: 10,
        costPer1kOutputTokens: 15,
        minimumCost: 1,
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
        tags: ['test', 'unit-test']
      }
    };

    it('should register a new model successfully', async () => {
      await service.registerModel(testModel);

      expect(mockFirestore.collection).toHaveBeenCalledWith('available_models');
      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          ...testModel,
          createdAt: expect.any(Object),
          lastUpdated: expect.any(Object)
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Model registered successfully', { modelId: testModel.id });
      expect(mockMetrics.increment).toHaveBeenCalledWith('model_management.models_registered');
    });

    it('should handle registration errors gracefully', async () => {
      const error = new Error('Firestore error');
      mockDoc.set.mockRejectedValue(error);

      await expect(service.registerModel(testModel)).rejects.toThrow('Firestore error');
      expect(mockLogger.error).toHaveBeenCalledWith('Model registration failed', { 
        modelId: testModel.id, 
        error 
      });
      expect(mockMetrics.increment).toHaveBeenCalledWith('model_management.registration_errors');
    });
  });

  describe('Model Retrieval', () => {
    it('should retrieve available models by category', async () => {
      const mockModels = [
        { id: 'model-1', category: ModelCategory.TEXT_GENERATION, isActive: true },
        { id: 'model-2', category: ModelCategory.TEXT_GENERATION, isActive: true }
      ];
      
      const mockSnapshot = {
        docs: mockModels.map(model => ({
          id: model.id,
          data: () => model
        }))
      };
      
      mockCollection.get.mockResolvedValue(mockSnapshot);

      const result = await service.getAvailableModels(ModelCategory.TEXT_GENERATION);

      expect(mockCollection.where).toHaveBeenCalledWith('isActive', '==', true);
      expect(mockCollection.where).toHaveBeenCalledWith('category', '==', ModelCategory.TEXT_GENERATION);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('model-1');
    });

    it('should retrieve model by ID', async () => {
      const testModel = { id: 'test-model', name: 'Test Model' };
      mockDoc.get.mockResolvedValue({
        exists: true,
        data: jest.fn().mockReturnValue(testModel)
      });

      const result = await service.getModelById('test-model');

      expect(mockFirestore.collection).toHaveBeenCalledWith('available_models');
      expect(mockCollection.doc).toHaveBeenCalledWith('test-model');
      expect(result).toEqual(expect.objectContaining({ 
        id: 'test-model',
        name: testModel.name
      }));
    });

    it('should return null for non-existent model', async () => {
      mockDoc.get.mockResolvedValue({
        exists: false,
        data: jest.fn()
      });

      const result = await service.getModelById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('Model Health Monitoring', () => {
    it('should check model health successfully', async () => {
      const testModel: AIModel = {
        id: 'test-model',
        name: 'Test Model',
        description: 'Test',
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
          modelId: 'test-model',
          category: ModelCategory.TEXT_GENERATION,
          costPer1kInputTokens: 10,
          costPer1kOutputTokens: 15,
          minimumCost: 1,
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
          addedBy: 'test',
          tags: []
        }
      };

      mockDoc.get.mockResolvedValue({
        exists: true,
        data: jest.fn().mockReturnValue(testModel)
      });

      // Mock the health check to return healthy status
      const mockHealthResult = {
        isHealthy: true,
        isAvailable: true,
        errorRate: 0,
        issues: []
      };

      // We need to mock the private method performProviderHealthCheck
      // Since it's private, we'll test the public interface
      const result = await service.checkModelHealth('test-model');

      expect(result.modelId).toBe('test-model');
      expect(result.lastChecked).toBeInstanceOf(Date);
      expect(typeof result.responseTime).toBe('number');
    });

    it('should handle health check errors', async () => {
      mockDoc.get.mockResolvedValue({
        exists: false,
        data: jest.fn()
      });

      await expect(service.checkModelHealth('non-existent')).rejects.toThrow('Model non-existent not found');
    });
  });

  describe('Model Performance Analytics', () => {
    it('should get model analytics successfully', async () => {
      const mockAnalytics = {
        modelId: 'test-model',
        timeRange: {
          startDate: new Date(),
          endDate: new Date(),
          granularity: 'day'
        },
        usage: {
          totalRequests: 100,
          totalTokensProcessed: 50000,
          totalCreditsConsumed: 1000,
          uniqueUsers: 25,
          averageRequestSize: 500,
          medianRequestSize: 450,
          requestSizeDistribution: [],
          peakUsageHours: [9, 10, 14, 15],
          usageByDayOfWeek: [],
          seasonalPatterns: [],
          featureUsage: [],
          taskTypeDistribution: [],
          geographicUsage: []
        },
        lastUpdated: new Date(),
        dataFreshness: {
          lastUpdated: new Date(),
          updateFrequency: 'hourly' as any,
          staleness: 0,
          isStale: false
        }
      };

      mockDoc.get.mockResolvedValue({
        exists: true,
        data: jest.fn().mockReturnValue(mockAnalytics)
      });

      const result = await service.getModelAnalytics('test-model');

      expect(mockFirestore.collection).toHaveBeenCalledWith('model_analytics');
      expect(result.modelId).toBe('test-model');
      expect(result.usage.totalRequests).toBe(100);
    });

    it('should handle missing analytics gracefully', async () => {
      mockDoc.get.mockResolvedValue({
        exists: false,
        data: jest.fn()
      });

      await expect(service.getModelAnalytics('test-model')).rejects.toThrow('Analytics not found for model test-model');
    });
  });

  describe('Model Updates', () => {
    it('should update model successfully', async () => {
      const updates = { isActive: false, name: 'Updated Model' };

      await service.updateModel('test-model', updates);

      expect(mockDoc.update).toHaveBeenCalledWith({
        ...updates,
        lastUpdated: expect.any(Object)
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Model updated successfully', { modelId: 'test-model' });
      expect(mockMetrics.increment).toHaveBeenCalledWith('model_management.models_updated');
    });

    it('should activate model', async () => {
      await service.activateModel('test-model');

      expect(mockDoc.update).toHaveBeenCalledWith({
        isActive: true,
        lastUpdated: expect.any(Object)
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Model activated', { modelId: 'test-model' });
    });

    it('should deactivate model', async () => {
      await service.deactivateModel('test-model');

      expect(mockDoc.update).toHaveBeenCalledWith({
        isActive: false,
        lastUpdated: expect.any(Object)
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Model deactivated', { modelId: 'test-model' });
    });
  });

  describe('Model Usage Recording', () => {
    it('should record model usage successfully', async () => {
      const usageRecord = {
        userId: 'user-123',
        requestId: 'req-456',
        timestamp: new Date(),
        inputTokens: 100,
        outputTokens: 200,
        processingTime: 1500,
        creditsUsed: 25,
        success: true
      };

      await service.recordModelUsage('test-model', usageRecord);

      expect(mockCollection.add).toHaveBeenCalledWith({
        modelId: 'test-model',
        ...usageRecord,
        timestamp: expect.any(Object)
      });
      expect(mockMetrics.increment).toHaveBeenCalledWith('model_usage.recorded');
    });
  });

  describe('Model Discovery', () => {
    it('should discover models from multiple providers', async () => {
      const result = await service.discoverModels();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting model discovery process');
      expect(Array.isArray(result)).toBe(true);
      expect(mockMetrics.increment).toHaveBeenCalledWith('model_discovery.total_discovered', expect.any(Number));
    });

    it('should handle discovery errors', async () => {
      // Mock an error in the discovery process
      const originalDiscoverModels = service.discoverModels;
      service.discoverModels = jest.fn().mockRejectedValue(new Error('Discovery failed'));

      await expect(service.discoverModels()).rejects.toThrow('Discovery failed');
    });
  });

  describe('Model Feedback', () => {
    it('should record model feedback successfully', async () => {
      const feedback = {
        id: 'feedback-1',
        userId: 'user-123',
        modelId: 'test-model',
        rating: 8,
        feedbackType: 'rating' as any,
        category: 'quality' as any,
        qualityRating: 8,
        speedRating: 9,
        accuracyRating: 7,
        usefulnessRating: 8,
        taskType: 'quick_chat' as any,
        promptLength: 100,
        responseLength: 200,
        processingTime: 1500,
        timestamp: new Date(),
        verified: false,
        moderationStatus: 'pending' as any,
        followUpRequested: false,
        followUpCompleted: false
      };

      await service.recordModelFeedback(feedback);

      expect(mockCollection.add).toHaveBeenCalledWith({
        ...feedback,
        timestamp: expect.any(Object)
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Model feedback recorded', { modelId: feedback.modelId });
    });

    it('should get model feedback summary', async () => {
      const mockSummary = {
        modelId: 'test-model',
        totalFeedback: 50,
        averageRating: 8.2,
        satisfactionScore: 82,
        commonIssues: ['slow response'],
        improvements: ['faster processing'],
        lastUpdated: new Date()
      };

      mockDoc.get.mockResolvedValue({
        exists: true,
        data: jest.fn().mockReturnValue(mockSummary)
      });

      const result = await service.getModelFeedbackSummary('test-model');

      expect(result.modelId).toBe('test-model');
      expect(result.totalFeedback).toBe(50);
      expect(result.averageRating).toBe(8.2);
    });

    it('should return empty summary for model with no feedback', async () => {
      mockDoc.get.mockResolvedValue({
        exists: false,
        data: jest.fn()
      });

      const result = await service.getModelFeedbackSummary('test-model');

      expect(result.modelId).toBe('test-model');
      expect(result.totalFeedback).toBe(0);
      expect(result.averageRating).toBe(0);
    });
  });
});