/**
 * Models API Routes
 * AI model management and preference endpoints
 */

import { Router } from 'express';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/error-handling';
import { firestore } from '../../app';
import { logger } from '../../shared/observability/logger';
import { AuthenticatedRequest } from '../../shared/types/firebase-auth';

const modelsRouter = Router();

// Get available AI models
modelsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  try {
    if (!firestore) {
      throw new Error('Firestore not available');
    }

    const { category, provider, isActive = 'true' } = req.query;

    let query: any = firestore.collection('available_models');

    // Apply filters
    if (category) {
      query = query.where('category', '==', category);
    }
    if (provider) {
      query = query.where('provider', '==', provider);
    }
    if (isActive === 'true') {
      query = query.where('isActive', '==', true);
    }

    const snapshot = await query.get();
    const models = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: data.id,
        name: data.name,
        description: data.description,
        category: data.category,
        provider: data.provider,
        isActive: data.isActive,
        capabilities: data.capabilities,
        pricing: data.pricing,
        performance: data.performance,
        metadata: {
          addedAt: data.metadata?.addedAt,
          tags: data.metadata?.tags || []
        }
      };
    });

    // Group models by category for better organization
    const modelsByCategory = models.reduce((acc: any, model: any) => {
      if (!acc[model.category]) {
        acc[model.category] = [];
      }
      acc[model.category].push(model);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        models,
        modelsByCategory,
        totalCount: models.length,
        categories: Object.keys(modelsByCategory),
        providers: Array.from(new Set(models.map((m: any) => m.provider)))
      }
    });
  } catch (error) {
    logger.error('Failed to get available models', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    throw new Error('Failed to retrieve available models');
  }
}));

// Get user model preferences
modelsRouter.get('/preferences', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user?.uid;

  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  try {
    if (!firestore) {
      throw new Error('Firestore not available');
    }

    const preferencesDoc = await firestore.collection('user_model_preferences').doc(userId).get();
    
    if (!preferencesDoc.exists) {
      // Return default preferences if none exist
      const defaultPreferences = {
        preferences: {
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
            defaultQuality: 'standard',
            selectionCriteria: {
              prioritizeSpeed: true,
              prioritizeCost: true,
              prioritizeQuality: false,
              maxCostPerRequest: 150
            }
          },
          embeddings: {
            primaryModel: 'BAAI/bge-en-icl',
            autoSelectBest: false
          }
        },
        budgetLimits: {
          dailyLimit: 500,
          weeklyLimit: 2000,
          monthlyLimit: 5000,
          perRequestLimit: 100
        }
      };

      res.json({
        success: true,
        data: {
          ...defaultPreferences,
          isDefault: true,
          lastUpdated: null
        }
      });
      return;
    }

    const preferencesData = preferencesDoc.data();

    res.json({
      success: true,
      data: {
        ...preferencesData,
        isDefault: false
      }
    });
  } catch (error) {
    logger.error('Failed to get model preferences', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    throw new Error('Failed to retrieve model preferences');
  }
}));

// Update user model preferences
modelsRouter.put('/preferences', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user?.uid;

  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  const { preferences, budgetLimits } = req.body;

  if (!preferences && !budgetLimits) {
    throw new ValidationError('Either preferences or budgetLimits must be provided');
  }

  try {
    if (!firestore) {
      throw new Error('Firestore not available');
    }

    const timestamp = new Date().toISOString();
    const updateData: any = {
      lastUpdated: timestamp
    };

    if (preferences) {
      updateData.preferences = preferences;
    }

    if (budgetLimits) {
      updateData.budgetLimits = budgetLimits;
    }

    await firestore.collection('user_model_preferences').doc(userId).set(updateData, { merge: true });

    logger.info('Model preferences updated', {
      userId,
      hasPreferences: !!preferences,
      hasBudgetLimits: !!budgetLimits
    });

    res.json({
      success: true,
      data: {
        message: 'Model preferences updated successfully',
        lastUpdated: timestamp,
        updatedFields: Object.keys(updateData)
      }
    });
  } catch (error) {
    logger.error('Failed to update model preferences', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    throw new Error('Failed to update model preferences');
  }
}));

// Get model cost estimation
modelsRouter.post('/estimate-cost', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const { modelId, inputTokens, outputTokens, taskType, quality } = req.body;

  if (!modelId) {
    throw new ValidationError('Model ID is required');
  }

  if (!inputTokens && !taskType) {
    throw new ValidationError('Either inputTokens or taskType must be provided');
  }

  try {
    if (!firestore) {
      throw new Error('Firestore not available');
    }

    // Get model pricing information
    const modelDoc = await firestore.collection('available_models').doc(modelId).get();
    
    if (!modelDoc.exists) {
      throw new NotFoundError('Model not found');
    }

    const modelData = modelDoc.data();
    const pricing = modelData?.pricing;

    if (!pricing) {
      throw new ValidationError('Pricing information not available for this model');
    }

    let estimatedCost = 0;
    let breakdown: any = {};

    if (modelData.category === 'text_generation') {
      const inputCost = Math.ceil((inputTokens || 1000) / 1000) * pricing.costPer1kInputTokens;
      const outputCost = Math.ceil((outputTokens || 500) / 1000) * pricing.costPer1kOutputTokens;
      
      estimatedCost = Math.max(inputCost + outputCost, pricing.minimumCost || 0);
      
      breakdown = {
        inputTokens: inputTokens || 1000,
        outputTokens: outputTokens || 500,
        inputCost,
        outputCost,
        minimumCost: pricing.minimumCost || 0
      };
    } else if (modelData.category === 'image_generation') {
      const baseImageCost = pricing.costPerImage || 100;
      const qualityMultiplier = quality === 'hd' ? 1.5 : 1;
      
      estimatedCost = baseImageCost * qualityMultiplier;
      
      breakdown = {
        baseImageCost,
        quality: quality || 'standard',
        qualityMultiplier
      };
    } else if (modelData.category === 'vision') {
      const imageCost = pricing.costPerImage || 50;
      const textCost = Math.ceil((inputTokens || 500) / 1000) * pricing.costPer1kInputTokens;
      
      estimatedCost = imageCost + textCost;
      
      breakdown = {
        imageCost,
        textTokens: inputTokens || 500,
        textCost
      };
    }

    res.json({
      success: true,
      data: {
        modelId,
        modelName: modelData.name,
        category: modelData.category,
        estimatedCost: Math.round(estimatedCost),
        currency: pricing.currency || 'credits',
        breakdown,
        pricing: {
          costPer1kInputTokens: pricing.costPer1kInputTokens,
          costPer1kOutputTokens: pricing.costPer1kOutputTokens,
          costPerImage: pricing.costPerImage,
          minimumCost: pricing.minimumCost
        }
      }
    });
  } catch (error) {
    logger.error('Failed to estimate model cost', {
      modelId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    
    throw new Error('Failed to estimate model cost');
  }
}));

// Get model performance analytics
modelsRouter.get('/:modelId/analytics', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const { modelId } = req.params;
  const { timeRange = '30d' } = req.query;

  try {
    if (!firestore) {
      throw new Error('Firestore not available');
    }

    // Get model information
    const modelDoc = await firestore.collection('available_models').doc(modelId).get();
    
    if (!modelDoc.exists) {
      throw new NotFoundError('Model not found');
    }

    const modelData = modelDoc.data();

    // Get analytics data
    const analyticsDoc = await firestore.collection('model_analytics').doc(modelId).get();
    
    const defaultAnalytics = {
      usage: {
        totalRequests: 0,
        totalTokensProcessed: 0,
        averageRequestSize: 0,
        totalCreditsConsumed: 0
      },
      performance: {
        averageLatency: 0,
        successRate: 0,
        errorRate: 0,
        userSatisfactionScore: 0
      }
    };
    
    const analytics = analyticsDoc.exists ? { ...defaultAnalytics, ...(analyticsDoc.data() || {}) } : defaultAnalytics;

    // Calculate time-based metrics (simplified for this implementation)
    const timeRangeData = {
      '7d': { requests: Math.floor(analytics.usage.totalRequests * 0.1) },
      '30d': { requests: Math.floor(analytics.usage.totalRequests * 0.4) },
      '90d': { requests: Math.floor(analytics.usage.totalRequests * 0.8) }
    };

    res.json({
      success: true,
      data: {
        modelId,
        modelName: modelData?.name,
        category: modelData?.category,
        provider: modelData?.provider,
        timeRange,
        analytics: {
          ...analytics,
          timeRangeData: timeRangeData[timeRange as keyof typeof timeRangeData] || timeRangeData['30d']
        },
        lastUpdated: (analytics as any).lastUpdated || null
      }
    });
  } catch (error) {
    logger.error('Failed to get model analytics', {
      modelId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (error instanceof NotFoundError) {
      throw error;
    }
    
    throw new Error('Failed to retrieve model analytics');
  }
}));

// Get model recommendations for user
modelsRouter.get('/recommendations', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user?.uid;
  const { taskType, budget } = req.query;

  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  try {
    if (!firestore) {
      throw new Error('Firestore not available');
    }

    // Get user preferences
    const preferencesDoc = await firestore.collection('user_model_preferences').doc(userId).get();
    const preferences = preferencesDoc.exists ? preferencesDoc.data() : null;

    // Get available models
    let modelsQuery = firestore.collection('available_models').where('isActive', '==', true);
    
    if (taskType) {
      modelsQuery = modelsQuery.where('category', '==', taskType);
    }

    const modelsSnapshot = await modelsQuery.get();
    const models = modelsSnapshot.docs.map((doc: any) => doc.data());

    // Simple recommendation algorithm
    const recommendations = models
      .filter(model => {
        if (budget) {
          const modelCost = model.pricing?.minimumCost || 0;
          return modelCost <= parseInt(budget as string);
        }
        return true;
      })
      .map(model => {
        let score = 0;
        
        // Score based on performance
        if (model.performance) {
          score += model.performance.qualityScore * 0.4;
          score += model.performance.speedScore * 0.3;
          score += model.performance.costScore * 0.3;
        }

        // Adjust score based on user preferences
        if (preferences?.preferences) {
          const taskPrefs = preferences.preferences[taskType as string];
          if (taskPrefs?.selectionCriteria) {
            if (taskPrefs.selectionCriteria.prioritizeSpeed) score += model.performance?.speedScore * 0.2;
            if (taskPrefs.selectionCriteria.prioritizeQuality) score += model.performance?.qualityScore * 0.2;
            if (taskPrefs.selectionCriteria.prioritizeCost) score += model.performance?.costScore * 0.2;
          }
        }

        return {
          ...model,
          recommendationScore: score,
          reason: score > 8 ? 'Excellent match' : score > 6 ? 'Good match' : 'Basic match'
        };
      })
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        taskType: taskType || 'all',
        budget: budget || 'unlimited',
        recommendations,
        totalModelsConsidered: models.length
      }
    });
  } catch (error) {
    logger.error('Failed to get model recommendations', {
      userId,
      taskType,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    throw new Error('Failed to get model recommendations');
  }
}));

export { modelsRouter };