/**
 * User Preference Manager
 * Handles user model preferences, intelligent selection, budget enforcement, and recommendations
 */

import {
  UserModelPreferences,
  TaskModelPreference,
  BudgetLimits,
  AIModel,
  TaskType,
  ModelSelection,
  ModelRecommendation,
  RecommendationItem,
  ModelRequirements,
} from '@/shared/types';
import { IStructuredLogger } from '@/shared/observability/logger';
import { IMetricsCollector } from '@/shared/observability/metrics';
import * as admin from 'firebase-admin';

/**
 * Interface for User Preference Manager
 */
export interface IUserPreferenceManager {
  // Preference Management
  getUserPreferences(userId: string): Promise<UserModelPreferences>;
  updateUserPreferences(userId: string, preferences: Partial<UserModelPreferences>): Promise<void>;
  resetUserPreferences(userId: string): Promise<void>;
  
  // Task-Specific Preferences
  getTaskPreference(userId: string, taskType: TaskType): Promise<TaskModelPreference>;
  updateTaskPreference(userId: string, taskType: TaskType, preference: TaskModelPreference): Promise<void>;
  
  // Budget Management
  getBudgetLimits(userId: string): Promise<BudgetLimits>;
  updateBudgetLimits(userId: string, limits: BudgetLimits): Promise<void>;
  checkBudgetConstraints(userId: string, estimatedCost: number): Promise<BudgetCheckResult>;
  
  // Intelligent Model Selection
  selectOptimalModel(userId: string, requirements: ModelRequirements, availableModels: AIModel[]): Promise<ModelSelection>;
  selectModelForTask(userId: string, taskType: TaskType, availableModels: AIModel[]): Promise<ModelSelection>;
  
  // Recommendation Engine
  generateModelRecommendations(userId: string, taskType: TaskType): Promise<ModelRecommendation>;
  updateRecommendationFeedback(userId: string, modelId: string, feedback: RecommendationFeedback): Promise<void>;
  
  // Usage Pattern Analysis
  analyzeUsagePatterns(userId: string): Promise<UsagePatternAnalysis>;
  adaptPreferencesFromUsage(userId: string): Promise<void>;
  
  // Cost Tracking and Optimization
  trackModelCosts(userId: string, modelId: string, cost: number): Promise<void>;
  getCostAnalytics(userId: string, timeRange?: TimeRange): Promise<UserCostAnalytics>;
  optimizeForCost(userId: string, taskType: TaskType): Promise<CostOptimizationSuggestion>;
}

/**
 * Supporting interfaces
 */
export interface BudgetCheckResult {
  withinBudget: boolean;
  remainingDaily: number;
  remainingWeekly: number;
  remainingMonthly: number;
  exceedsLimit: BudgetLimitType[];
  recommendations: BudgetRecommendation[];
}

export enum BudgetLimitType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  PER_REQUEST = 'per_request'
}

export interface BudgetRecommendation {
  type: BudgetRecommendationType;
  description: string;
  suggestedAction: string;
  potentialSavings: number;
}

export enum BudgetRecommendationType {
  SWITCH_MODEL = 'switch_model',
  ADJUST_SETTINGS = 'adjust_settings',
  INCREASE_BUDGET = 'increase_budget',
  OPTIMIZE_USAGE = 'optimize_usage'
}

export interface RecommendationFeedback {
  modelId: string;
  wasUseful: boolean;
  rating: number; // 1-5
  comment?: string;
  actualPerformance?: ActualPerformance;
}

export interface ActualPerformance {
  latency: number;
  quality: number;
  satisfaction: number;
  cost: number;
}

export interface UsagePatternAnalysis {
  userId: string;
  analysisDate: Date;
  
  // Usage patterns
  mostUsedModels: ModelUsagePattern[];
  taskTypeDistribution: TaskTypeDistribution[];
  timePatterns: TimeUsagePattern[];
  
  // Performance insights
  performancePreferences: PerformancePreference[];
  costSensitivity: CostSensitivity;
  
  // Recommendations
  optimizationOpportunities: OptimizationOpportunity[];
  suggestedPreferenceChanges: PreferenceChange[];
}

export interface ModelUsagePattern {
  modelId: string;
  modelName: string;
  usageCount: number;
  usagePercentage: number;
  averageCost: number;
  averageSatisfaction: number;
  taskTypes: TaskType[];
}

export interface TaskTypeDistribution {
  taskType: TaskType;
  count: number;
  percentage: number;
  preferredModels: string[];
  averageCost: number;
}

export interface TimeUsagePattern {
  timeOfDay: number; // 0-23
  dayOfWeek: number; // 0-6
  usageCount: number;
  preferredModels: string[];
  averageLatency: number;
}

export interface PerformancePreference {
  metric: PerformanceMetric;
  importance: number; // 0-1
  threshold: number;
  trend: PreferenceTrend;
}

export enum PerformanceMetric {
  LATENCY = 'latency',
  QUALITY = 'quality',
  COST = 'cost',
  RELIABILITY = 'reliability'
}

export enum PreferenceTrend {
  INCREASING = 'increasing',
  DECREASING = 'decreasing',
  STABLE = 'stable'
}

export interface CostSensitivity {
  level: CostSensitivityLevel;
  maxAcceptableCost: number;
  costVsQualityTradeoff: number; // 0-1, 0 = prioritize cost, 1 = prioritize quality
  budgetUtilization: number; // 0-1
}

export enum CostSensitivityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  VERY_HIGH = 'very_high'
}

export interface OptimizationOpportunity {
  type: OptimizationType;
  description: string;
  potentialSavings: number;
  impactOnQuality: number; // -1 to 1
  confidence: number; // 0-1
  actionRequired: string;
}

export enum OptimizationType {
  MODEL_SWITCH = 'model_switch',
  PARAMETER_TUNING = 'parameter_tuning',
  USAGE_TIMING = 'usage_timing',
  BATCH_PROCESSING = 'batch_processing',
  BUDGET_REALLOCATION = 'budget_reallocation'
}

export interface PreferenceChange {
  setting: PreferenceSetting;
  currentValue: any;
  suggestedValue: any;
  reason: string;
  expectedImpact: ExpectedImpact;
}

export enum PreferenceSetting {
  PRIMARY_MODEL = 'primary_model',
  FALLBACK_MODEL = 'fallback_model',
  COST_THRESHOLD = 'cost_threshold',
  QUALITY_THRESHOLD = 'quality_threshold',
  AUTO_SELECT = 'auto_select'
}

export interface ExpectedImpact {
  costChange: number; // percentage
  qualityChange: number; // percentage
  latencyChange: number; // percentage
  satisfactionChange: number; // percentage
}

export interface TimeRange {
  startDate: Date;
  endDate: Date;
}

export interface UserCostAnalytics {
  userId: string;
  timeRange: TimeRange;
  
  // Cost breakdown
  totalCost: number;
  costByModel: ModelCostBreakdown[];
  costByTaskType: TaskTypeCostBreakdown[];
  costByTimeOfDay: TimeCostBreakdown[];
  
  // Trends
  costTrend: CostTrendData[];
  budgetUtilization: BudgetUtilization;
  
  // Efficiency metrics
  costEfficiency: CostEfficiencyMetrics;
  recommendations: CostRecommendation[];
}

export interface ModelCostBreakdown {
  modelId: string;
  modelName: string;
  totalCost: number;
  usageCount: number;
  averageCostPerUse: number;
  percentage: number;
}

export interface TaskTypeCostBreakdown {
  taskType: TaskType;
  totalCost: number;
  usageCount: number;
  averageCostPerTask: number;
  percentage: number;
}

export interface TimeCostBreakdown {
  hour: number;
  totalCost: number;
  usageCount: number;
  averageCost: number;
}

export interface CostTrendData {
  date: Date;
  cost: number;
  usageCount: number;
  efficiency: number;
}

export interface BudgetUtilization {
  daily: UtilizationMetric;
  weekly: UtilizationMetric;
  monthly: UtilizationMetric;
}

export interface UtilizationMetric {
  used: number;
  limit: number;
  percentage: number;
  trend: UtilizationTrend;
}

export enum UtilizationTrend {
  UNDER_BUDGET = 'under_budget',
  ON_TRACK = 'on_track',
  OVER_BUDGET = 'over_budget',
  APPROACHING_LIMIT = 'approaching_limit'
}

export interface CostEfficiencyMetrics {
  costPerQualityPoint: number;
  costPerTask: number;
  efficiencyScore: number; // 0-100
  benchmarkComparison: number; // vs average user
}

export interface CostRecommendation {
  type: CostRecommendationType;
  description: string;
  potentialSavings: number;
  implementationEffort: ImplementationEffort;
  priority: RecommendationPriority;
}

export enum CostRecommendationType {
  MODEL_OPTIMIZATION = 'model_optimization',
  USAGE_OPTIMIZATION = 'usage_optimization',
  BUDGET_ADJUSTMENT = 'budget_adjustment',
  TIMING_OPTIMIZATION = 'timing_optimization'
}

export enum ImplementationEffort {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export enum RecommendationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export interface CostOptimizationSuggestion {
  taskType: TaskType;
  currentModel: string;
  suggestedModel: string;
  costSavings: number;
  qualityImpact: number;
  confidence: number;
  reasoning: string;
}

/**
 * User Preference Manager Implementation
 */
export class UserPreferenceManager implements IUserPreferenceManager {
  private firestore: admin.firestore.Firestore;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;

  constructor(
    firestore: admin.firestore.Firestore,
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ) {
    this.firestore = firestore;
    this.logger = logger;
    this.metrics = metrics;
  }

  // ============================================================================
  // Preference Management
  // ============================================================================

  async getUserPreferences(userId: string): Promise<UserModelPreferences> {
    try {
      const doc = await this.firestore.collection('user_model_preferences').doc(userId).get();
      
      if (!doc.exists) {
        // Return default preferences
        const defaultPreferences = this.getDefaultPreferences();
        await this.updateUserPreferences(userId, defaultPreferences);
        return defaultPreferences;
      }
      
      return doc.data() as UserModelPreferences;
      
    } catch (error) {
      this.logger.error('Failed to get user preferences', { userId, error });
      throw error;
    }
  }

  async updateUserPreferences(userId: string, preferences: Partial<UserModelPreferences>): Promise<void> {
    try {
      const updateData = {
        ...preferences,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await this.firestore.collection('user_model_preferences').doc(userId).set(updateData, { merge: true });
      
      this.logger.info('User preferences updated', { userId });
      this.metrics.increment('user_preferences.updated');
      
    } catch (error) {
      this.logger.error('Failed to update user preferences', { userId, error });
      throw error;
    }
  }

  async resetUserPreferences(userId: string): Promise<void> {
    try {
      const defaultPreferences = this.getDefaultPreferences();
      await this.updateUserPreferences(userId, defaultPreferences);
      
      this.logger.info('User preferences reset to defaults', { userId });
      
    } catch (error) {
      this.logger.error('Failed to reset user preferences', { userId, error });
      throw error;
    }
  }

  // ============================================================================
  // Task-Specific Preferences
  // ============================================================================

  async getTaskPreference(userId: string, taskType: TaskType): Promise<TaskModelPreference> {
    try {
      const preferences = await this.getUserPreferences(userId);
      
      switch (taskType) {
        case TaskType.QUICK_CHAT:
        case TaskType.LONG_FORM_WRITING:
        case TaskType.CODE_GENERATION:
          return preferences.textGeneration;
        case TaskType.VISION_ANALYSIS:
          return preferences.visionTasks;
        case TaskType.IMAGE_GENERATION:
          return preferences.imageGeneration;
        default:
          return preferences.textGeneration; // Default fallback
      }
      
    } catch (error) {
      this.logger.error('Failed to get task preference', { userId, taskType, error });
      throw error;
    }
  }

  async updateTaskPreference(userId: string, taskType: TaskType, preference: TaskModelPreference): Promise<void> {
    try {
      const preferences = await this.getUserPreferences(userId);
      
      const updateField = this.getTaskPreferenceField(taskType);
      const updatedPreferences = {
        ...preferences,
        [updateField]: preference,
        lastUpdated: new Date()
      };
      
      await this.updateUserPreferences(userId, updatedPreferences);
      
      this.logger.info('Task preference updated', { userId, taskType });
      
    } catch (error) {
      this.logger.error('Failed to update task preference', { userId, taskType, error });
      throw error;
    }
  }

  // ============================================================================
  // Budget Management
  // ============================================================================

  async getBudgetLimits(userId: string): Promise<BudgetLimits> {
    try {
      const preferences = await this.getUserPreferences(userId);
      return preferences.budgetLimits;
      
    } catch (error) {
      this.logger.error('Failed to get budget limits', { userId, error });
      throw error;
    }
  }

  async updateBudgetLimits(userId: string, limits: BudgetLimits): Promise<void> {
    try {
      await this.updateUserPreferences(userId, { budgetLimits: limits });
      
      this.logger.info('Budget limits updated', { userId });
      
    } catch (error) {
      this.logger.error('Failed to update budget limits', { userId, error });
      throw error;
    }
  }

  async checkBudgetConstraints(userId: string, estimatedCost: number): Promise<BudgetCheckResult> {
    try {
      const budgetLimits = await this.getBudgetLimits(userId);
      const currentUsage = await this.getCurrentUsage(userId);
      
      const remainingDaily = Math.max(0, budgetLimits.dailyLimit - currentUsage.daily);
      const remainingWeekly = Math.max(0, budgetLimits.weeklyLimit - currentUsage.weekly);
      const remainingMonthly = Math.max(0, budgetLimits.monthlyLimit - currentUsage.monthly);
      
      const exceedsLimit: BudgetLimitType[] = [];
      
      if (estimatedCost > remainingDaily) exceedsLimit.push(BudgetLimitType.DAILY);
      if (estimatedCost > remainingWeekly) exceedsLimit.push(BudgetLimitType.WEEKLY);
      if (estimatedCost > remainingMonthly) exceedsLimit.push(BudgetLimitType.MONTHLY);
      if (estimatedCost > budgetLimits.perRequestLimit) exceedsLimit.push(BudgetLimitType.PER_REQUEST);
      
      const withinBudget = exceedsLimit.length === 0;
      
      const recommendations = await this.generateBudgetRecommendations(userId, estimatedCost, exceedsLimit);
      
      return {
        withinBudget,
        remainingDaily,
        remainingWeekly,
        remainingMonthly,
        exceedsLimit,
        recommendations
      };
      
    } catch (error) {
      this.logger.error('Failed to check budget constraints', { userId, estimatedCost, error });
      throw error;
    }
  }

  // ============================================================================
  // Intelligent Model Selection
  // ============================================================================

  async selectOptimalModel(userId: string, requirements: ModelRequirements, availableModels: AIModel[]): Promise<ModelSelection> {
    try {
      const preferences = await this.getUserPreferences(userId);
      const taskPreference = await this.getTaskPreference(userId, requirements.taskType);
      const usagePatterns = await this.analyzeUsagePatterns(userId);
      
      // Filter models based on requirements
      let candidateModels = availableModels.filter(model => 
        this.meetsRequirements(model, requirements)
      );
      
      if (candidateModels.length === 0) {
        throw new Error('No models meet the specified requirements');
      }
      
      // Score models based on user preferences and requirements
      const scoredModels = candidateModels.map(model => ({
        model,
        score: this.calculateModelScore(model, taskPreference, requirements, usagePatterns)
      }));
      
      // Sort by score (highest first)
      scoredModels.sort((a, b) => b.score - a.score);
      
      const selectedModel = scoredModels[0].model;
      const fallbackModels = scoredModels.slice(1, 4).map(sm => sm.model);
      
      const selection: ModelSelection = {
        selectedModel,
        reason: this.generateSelectionReason(selectedModel, taskPreference, requirements),
        estimatedCost: this.calculateEstimatedCost(selectedModel, requirements),
        estimatedLatency: selectedModel.performance.averageLatency,
        fallbackModels,
        confidence: scoredModels[0].score,
        selectionCriteria: taskPreference.selectionCriteria
      };
      
      // Record selection for learning
      await this.recordModelSelection(userId, selection, requirements);
      
      return selection;
      
    } catch (error) {
      this.logger.error('Failed to select optimal model', { userId, requirements, error });
      throw error;
    }
  }

  async selectModelForTask(userId: string, taskType: TaskType, availableModels: AIModel[]): Promise<ModelSelection> {
    const requirements: ModelRequirements = {
      taskType,
      inputSize: 1000, // Default assumption
      expectedOutputSize: 500,
      maxBudget: undefined,
      maxLatency: undefined,
      requiredFeatures: [],
      qualityThreshold: undefined
    };
    
    return this.selectOptimalModel(userId, requirements, availableModels);
  }

  // ============================================================================
  // Recommendation Engine
  // ============================================================================

  async generateModelRecommendations(userId: string, taskType: TaskType): Promise<ModelRecommendation> {
    try {
      // Get available models for the task type
      const availableModels = await this.getAvailableModelsForTask(taskType);
      const usagePatterns = await this.analyzeUsagePatterns(userId);
      const preferences = await this.getUserPreferences(userId);
      
      // Generate recommendations based on various factors
      const recommendations: RecommendationItem[] = [];
      
      for (const model of availableModels) {
        const recommendation = await this.generateModelRecommendationItem(
          userId, 
          model, 
          taskType, 
          usagePatterns, 
          preferences
        );
        recommendations.push(recommendation);
      }
      
      // Sort by score
      recommendations.sort((a, b) => b.score - a.score);
      
      const modelRecommendation: ModelRecommendation = {
        userId,
        taskType,
        recommendations: recommendations.slice(0, 5), // Top 5 recommendations
        generatedAt: new Date(),
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // Valid for 24 hours
        confidence: recommendations.length > 0 ? recommendations[0].score : 0,
        reasoning: {
          primaryFactors: [],
          secondaryFactors: [],
          userSpecificFactors: [],
          contextualFactors: []
        }
      };
      
      return modelRecommendation;
      
    } catch (error) {
      this.logger.error('Failed to generate model recommendations', { userId, taskType, error });
      throw error;
    }
  }

  async updateRecommendationFeedback(userId: string, modelId: string, feedback: RecommendationFeedback): Promise<void> {
    try {
      await this.firestore.collection('recommendation_feedback').add({
        userId,
        ...feedback,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Update recommendation learning model
      await this.updateRecommendationLearning(userId, modelId, feedback);
      
      this.logger.info('Recommendation feedback recorded', { userId, modelId });
      
    } catch (error) {
      this.logger.error('Failed to update recommendation feedback', { userId, modelId, error });
      throw error;
    }
  }

  // ============================================================================
  // Usage Pattern Analysis
  // ============================================================================

  async analyzeUsagePatterns(userId: string): Promise<UsagePatternAnalysis> {
    try {
      // Get usage data from the last 30 days
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const usageQuery = await this.firestore
        .collection('model_usage_records')
        .where('userId', '==', userId)
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .get();
        
      const usageRecords = usageQuery.docs.map((doc: any) => doc.data());
      
      // Analyze patterns
      const mostUsedModels = this.analyzeMostUsedModels(usageRecords);
      const taskTypeDistribution = this.analyzeTaskTypeDistribution(usageRecords);
      const timePatterns = this.analyzeTimePatterns(usageRecords);
      const performancePreferences = this.analyzePerformancePreferences(usageRecords);
      const costSensitivity = this.analyzeCostSensitivity(usageRecords);
      
      // Generate optimization opportunities
      const optimizationOpportunities = await this.identifyOptimizationOpportunities(
        userId, 
        usageRecords
      );
      
      const suggestedPreferenceChanges = await this.generatePreferenceChangeSuggestions(
        userId,
        usageRecords
      );
      
      const analysis: UsagePatternAnalysis = {
        userId,
        analysisDate: new Date(),
        mostUsedModels,
        taskTypeDistribution,
        timePatterns,
        performancePreferences,
        costSensitivity,
        optimizationOpportunities,
        suggestedPreferenceChanges
      };
      
      // Store analysis for future reference
      await this.storeUsageAnalysis(userId, analysis);
      
      return analysis;
      
    } catch (error) {
      this.logger.error('Failed to analyze usage patterns', { userId, error });
      throw error;
    }
  }

  async adaptPreferencesFromUsage(userId: string): Promise<void> {
    try {
      const analysis = await this.analyzeUsagePatterns(userId);
      const currentPreferences = await this.getUserPreferences(userId);
      
      // Apply suggested changes with user consent (this would typically require user approval)
      const adaptedPreferences = this.applyUsageBasedAdaptations(
        currentPreferences,
        analysis.suggestedPreferenceChanges
      );
      
      await this.updateUserPreferences(userId, adaptedPreferences);
      
      this.logger.info('Preferences adapted from usage patterns', { userId });
      
    } catch (error) {
      this.logger.error('Failed to adapt preferences from usage', { userId, error });
      throw error;
    }
  }

  // ============================================================================
  // Cost Tracking and Optimization
  // ============================================================================

  async trackModelCosts(userId: string, modelId: string, cost: number): Promise<void> {
    try {
      await this.firestore.collection('user_cost_tracking').add({
        userId,
        modelId,
        cost,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Update aggregated cost analytics
      await this.updateCostAnalytics(userId, modelId, cost);
      
    } catch (error) {
      this.logger.error('Failed to track model costs', { userId, modelId, cost, error });
      throw error;
    }
  }

  async getCostAnalytics(userId: string, timeRange?: TimeRange): Promise<UserCostAnalytics> {
    try {
      const defaultTimeRange: TimeRange = {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: new Date()
      };
      
      const range = timeRange || defaultTimeRange;
      
      // Fetch cost data
      const costQuery = await this.firestore
        .collection('user_cost_tracking')
        .where('userId', '==', userId)
        .where('timestamp', '>=', range.startDate)
        .where('timestamp', '<=', range.endDate)
        .get();
        
      const costRecords = costQuery.docs.map((doc: any) => doc.data());
      
      // Analyze cost data
      const totalCost = costRecords.reduce((sum: number, record: any) => sum + record.cost, 0);
      const costByModel = this.analyzeCostByModel(costRecords);
      const costByTaskType = this.analyzeCostByTaskType(costRecords);
      const costByTimeOfDay = this.analyzeCostByTimeOfDay(costRecords);
      const costTrend = this.analyzeCostTrend(costRecords);
      const budgetUtilization = await this.calculateBudgetUtilization(userId, totalCost);
      const costEfficiency = this.calculateCostEfficiency(costRecords);
      const recommendations = await this.generateCostRecommendations(userId, costRecords);
      
      const analytics: UserCostAnalytics = {
        userId,
        timeRange: range,
        totalCost,
        costByModel,
        costByTaskType,
        costByTimeOfDay,
        costTrend,
        budgetUtilization,
        costEfficiency,
        recommendations
      };
      
      return analytics;
      
    } catch (error) {
      this.logger.error('Failed to get cost analytics', { userId, error });
      throw error;
    }
  }

  async optimizeForCost(userId: string, taskType: TaskType): Promise<CostOptimizationSuggestion> {
    try {
      const preferences = await this.getUserPreferences(userId);
      const taskPreference = await this.getTaskPreference(userId, taskType);
      const availableModels = await this.getAvailableModelsForTask(taskType);
      
      // Find the most cost-effective model that meets quality requirements
      const costOptimizedModels = availableModels
        .filter(model => model.performance.qualityScore >= (taskPreference.selectionCriteria.minQualityScore || 7))
        .sort((a, b) => this.getModelCostScore(a) - this.getModelCostScore(b));
        
      if (costOptimizedModels.length === 0) {
        throw new Error('No cost-optimized models available for task type');
      }
      
      const currentModel = taskPreference.primaryModel;
      const suggestedModel = costOptimizedModels[0].id;
      
      if (currentModel === suggestedModel) {
        return {
          taskType,
          currentModel,
          suggestedModel,
          costSavings: 0,
          qualityImpact: 0,
          confidence: 1,
          reasoning: 'Already using the most cost-effective model'
        };
      }
      
      const currentModelData = availableModels.find(m => m.id === currentModel);
      const suggestedModelData = costOptimizedModels[0];
      
      const costSavings = currentModelData ? 
        this.calculateCostSavings(currentModelData, suggestedModelData) : 0;
      const qualityImpact = currentModelData ?
        this.calculateQualityImpact(currentModelData, suggestedModelData) : 0;
        
      return {
        taskType,
        currentModel,
        suggestedModel,
        costSavings,
        qualityImpact,
        confidence: 0.8,
        reasoning: `Switching to ${suggestedModelData.name} can save ${costSavings}% on costs with ${qualityImpact}% quality impact`
      };
      
    } catch (error) {
      this.logger.error('Failed to optimize for cost', { userId, taskType, error });
      throw error;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private getDefaultPreferences(): UserModelPreferences {
    return {
      textGeneration: {
        primaryModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
        fallbackModel: 'google/gemma-2-2b-it',
        autoSelectBest: true,
        selectionCriteria: {
          prioritizeSpeed: true,
          prioritizeCost: false,
          prioritizeQuality: false,
          maxCostPerRequest: 50,
          maxLatency: 5000,
          minQualityScore: 7
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
          maxCostPerRequest: 100,
          maxLatency: 10000,
          minQualityScore: 8
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
          maxCostPerRequest: 150,
          maxLatency: 30000,
          minQualityScore: 7
        }
      },
      embeddings: {
        primaryModel: 'BAAI/bge-en-icl',
        autoSelectBest: false,
        selectionCriteria: {
          prioritizeSpeed: true,
          prioritizeCost: true,
          prioritizeQuality: false,
          maxCostPerRequest: 10,
          maxLatency: 2000,
          minQualityScore: 6
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
  }

  private getTaskPreferenceField(taskType: TaskType): string {
    switch (taskType) {
      case TaskType.QUICK_CHAT:
      case TaskType.LONG_FORM_WRITING:
      case TaskType.CODE_GENERATION:
        return 'textGeneration';
      case TaskType.VISION_ANALYSIS:
        return 'visionTasks';
      case TaskType.IMAGE_GENERATION:
        return 'imageGeneration';
      default:
        return 'textGeneration';
    }
  }

  private async getCurrentUsage(userId: string): Promise<{ daily: number; weekly: number; monthly: number }> {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(dayStart.getTime() - (dayStart.getDay() * 24 * 60 * 60 * 1000));
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [dailyQuery, weeklyQuery, monthlyQuery] = await Promise.all([
      this.firestore.collection('user_cost_tracking')
        .where('userId', '==', userId)
        .where('timestamp', '>=', dayStart)
        .get(),
      this.firestore.collection('user_cost_tracking')
        .where('userId', '==', userId)
        .where('timestamp', '>=', weekStart)
        .get(),
      this.firestore.collection('user_cost_tracking')
        .where('userId', '==', userId)
        .where('timestamp', '>=', monthStart)
        .get()
    ]);

    const daily = dailyQuery.docs.reduce((sum: number, doc: any) => sum + doc.data().cost, 0);
    const weekly = weeklyQuery.docs.reduce((sum: number, doc: any) => sum + doc.data().cost, 0);
    const monthly = monthlyQuery.docs.reduce((sum: number, doc: any) => sum + doc.data().cost, 0);

    return { daily, weekly, monthly };
  }

  private async generateBudgetRecommendations(
    userId: string, 
    estimatedCost: number, 
    exceedsLimit: BudgetLimitType[]
  ): Promise<BudgetRecommendation[]> {
    const recommendations: BudgetRecommendation[] = [];
    
    if (exceedsLimit.includes(BudgetLimitType.PER_REQUEST)) {
      recommendations.push({
        type: BudgetRecommendationType.SWITCH_MODEL,
        description: 'Consider using a more cost-effective model for this request',
        suggestedAction: 'Switch to a lower-cost model or reduce request complexity',
        potentialSavings: estimatedCost * 0.3
      });
    }
    
    if (exceedsLimit.includes(BudgetLimitType.DAILY)) {
      recommendations.push({
        type: BudgetRecommendationType.OPTIMIZE_USAGE,
        description: 'Daily budget limit reached',
        suggestedAction: 'Wait until tomorrow or increase daily budget limit',
        potentialSavings: 0
      });
    }
    
    return recommendations;
  }

  private meetsRequirements(model: AIModel, requirements: ModelRequirements): boolean {
    // Check if model meets the specified requirements
    if (requirements.maxBudget && this.getModelCostScore(model) > requirements.maxBudget) {
      return false;
    }
    
    if (requirements.maxLatency && model.performance.averageLatency > requirements.maxLatency) {
      return false;
    }
    
    if (requirements.qualityThreshold && model.performance.qualityScore < requirements.qualityThreshold) {
      return false;
    }
    
    if (requirements.requiredFeatures) {
      const hasAllFeatures = requirements.requiredFeatures.every(feature =>
        model.capabilities.specialFeatures?.includes(feature)
      );
      if (!hasAllFeatures) {
        return false;
      }
    }
    
    return true;
  }

  private calculateModelScore(
    model: AIModel, 
    taskPreference: TaskModelPreference, 
    requirements: ModelRequirements,
    usagePatterns: UsagePatternAnalysis
  ): number {
    const criteria = taskPreference.selectionCriteria;
    let score = 0;
    
    // Base scores (0-1)
    const speedScore = Math.max(0, 1 - (model.performance.averageLatency / 10000)); // Normalize to 10s max
    const costScore = Math.max(0, 1 - (this.getModelCostScore(model) / 200)); // Normalize to 200 credits max
    const qualityScore = model.performance.qualityScore / 10; // Already 0-10, normalize to 0-1
    
    // Apply user preferences
    if (criteria.prioritizeSpeed) score += speedScore * 0.4;
    if (criteria.prioritizeCost) score += costScore * 0.4;
    if (criteria.prioritizeQuality) score += qualityScore * 0.4;
    
    // Bonus for user's preferred models
    const userPreferredModels = usagePatterns.mostUsedModels.map(m => m.modelId);
    if (userPreferredModels.includes(model.id)) {
      score += 0.2;
    }
    
    // Penalty for models that don't meet hard requirements
    if (requirements.maxLatency && model.performance.averageLatency > requirements.maxLatency) {
      score *= 0.5;
    }
    
    return Math.min(1, score); // Cap at 1.0
  }

  private generateSelectionReason(
    model: AIModel, 
    taskPreference: TaskModelPreference, 
    requirements: ModelRequirements
  ): string {
    const reasons: string[] = [];
    
    if (taskPreference.selectionCriteria.prioritizeSpeed && model.performance.speedScore >= 8) {
      reasons.push('high speed performance');
    }
    
    if (taskPreference.selectionCriteria.prioritizeCost && model.performance.costScore >= 8) {
      reasons.push('cost-effective');
    }
    
    if (taskPreference.selectionCriteria.prioritizeQuality && model.performance.qualityScore >= 8) {
      reasons.push('high quality output');
    }
    
    if (model.id === taskPreference.primaryModel) {
      reasons.push('user preferred model');
    }
    
    return reasons.length > 0 
      ? `Selected for ${reasons.join(', ')}`
      : 'Best available option for requirements';
  }

  private calculateEstimatedCost(model: AIModel, requirements: ModelRequirements): number {
    const baseCost = model.pricing.costPerRequest || 
                    (model.pricing.costPer1kInputTokens || 0) * (requirements.inputSize / 1000) +
                    (model.pricing.costPer1kOutputTokens || 0) * ((requirements.expectedOutputSize || 500) / 1000);
    
    return Math.max(baseCost, model.pricing.minimumCost || 0);
  }

  private async recordModelSelection(
    userId: string, 
    selection: ModelSelection, 
    requirements: ModelRequirements
  ): Promise<void> {
    await this.firestore.collection('model_selections').add({
      userId,
      modelId: selection.selectedModel.id,
      taskType: requirements.taskType,
      selectionReason: selection.reason,
      estimatedCost: selection.estimatedCost,
      confidence: selection.confidence,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  private async getAvailableModelsForTask(taskType: TaskType): Promise<AIModel[]> {
    // This would integrate with the ModelManagementService
    // For now, return empty array as placeholder
    return [];
  }

  private async generateModelRecommendationItem(
    userId: string,
    model: AIModel,
    taskType: TaskType,
    usagePatterns: UsagePatternAnalysis,
    preferences: UserModelPreferences
  ): Promise<RecommendationItem> {
    // Generate recommendation item based on model and user data
    return {
      modelId: model.id,
      rank: 1,
      score: 0.8,
      reasons: [],
      estimatedPerformance: {
        estimatedLatency: model.performance.averageLatency,
        estimatedQuality: model.performance.qualityScore,
        estimatedCost: this.getModelCostScore(model),
        estimatedSatisfaction: 8.5,
        confidence: 0.8,
        latencyRange: { min: 1000, max: 3000, median: 2000, confidence: 0.8 },
        qualityRange: { min: 7, max: 9, median: 8, confidence: 0.8 },
        costRange: { min: 10, max: 50, median: 25, confidence: 0.8 }
      },
      costBenefit: {
        costScore: model.performance.costScore,
        benefitScore: model.performance.qualityScore,
        roi: 1.5,
        costs: [],
        benefits: []
      },
      personalizedScore: 0.8,
      userHistoryMatch: 0.7,
      preferenceAlignment: 0.9
    };
  }

  private async updateRecommendationLearning(
    userId: string, 
    modelId: string, 
    feedback: RecommendationFeedback
  ): Promise<void> {
    // Update machine learning model for recommendations
    // This would integrate with ML pipeline
  }

  private analyzeMostUsedModels(usageRecords: any[]): ModelUsagePattern[] {
    // Analyze which models are used most frequently
    return [];
  }

  private analyzeTaskTypeDistribution(usageRecords: any[]): TaskTypeDistribution[] {
    // Analyze distribution of task types
    return [];
  }

  private analyzeTimePatterns(usageRecords: any[]): TimeUsagePattern[] {
    // Analyze usage patterns by time
    return [];
  }

  private analyzePerformancePreferences(usageRecords: any[]): PerformancePreference[] {
    // Analyze user's performance preferences from usage
    return [];
  }

  private analyzeCostSensitivity(usageRecords: any[]): CostSensitivity {
    // Analyze user's cost sensitivity
    return {
      level: CostSensitivityLevel.MEDIUM,
      maxAcceptableCost: 100,
      costVsQualityTradeoff: 0.5,
      budgetUtilization: 0.7
    };
  }

  private async identifyOptimizationOpportunities(
    userId: string, 
    usageRecords: any[]
  ): Promise<OptimizationOpportunity[]> {
    // Identify opportunities for optimization
    return [];
  }

  private async generatePreferenceChangeSuggestions(
    userId: string,
    usageRecords: any[]
  ): Promise<PreferenceChange[]> {
    // Generate suggestions for preference changes
    return [];
  }

  private async storeUsageAnalysis(userId: string, analysis: UsagePatternAnalysis): Promise<void> {
    await this.firestore.collection('usage_pattern_analysis').doc(userId).set({
      ...analysis,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  private applyUsageBasedAdaptations(
    currentPreferences: UserModelPreferences,
    suggestedChanges: PreferenceChange[]
  ): Partial<UserModelPreferences> {
    // Apply suggested changes to preferences
    return currentPreferences;
  }

  private async updateCostAnalytics(userId: string, modelId: string, cost: number): Promise<void> {
    // Update aggregated cost analytics
    const analyticsRef = this.firestore.collection('user_cost_analytics').doc(userId);
    
    await this.firestore.runTransaction(async (transaction: any) => {
      const doc = await transaction.get(analyticsRef);
      
      if (doc.exists) {
        const data = doc.data();
        const updatedTotalCost = (data?.totalCost || 0) + cost;
        
        transaction.update(analyticsRef, {
          totalCost: updatedTotalCost,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        transaction.set(analyticsRef, {
          userId,
          totalCost: cost,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    });
  }

  private analyzeCostByModel(costRecords: any[]): ModelCostBreakdown[] {
    // Analyze cost breakdown by model
    return [];
  }

  private analyzeCostByTaskType(costRecords: any[]): TaskTypeCostBreakdown[] {
    // Analyze cost breakdown by task type
    return [];
  }

  private analyzeCostByTimeOfDay(costRecords: any[]): TimeCostBreakdown[] {
    // Analyze cost breakdown by time of day
    return [];
  }

  private analyzeCostTrend(costRecords: any[]): CostTrendData[] {
    // Analyze cost trends over time
    return [];
  }

  private async calculateBudgetUtilization(userId: string, totalCost: number): Promise<BudgetUtilization> {
    const budgetLimits = await this.getBudgetLimits(userId);
    
    return {
      daily: {
        used: totalCost,
        limit: budgetLimits.dailyLimit,
        percentage: (totalCost / budgetLimits.dailyLimit) * 100,
        trend: UtilizationTrend.ON_TRACK
      },
      weekly: {
        used: totalCost,
        limit: budgetLimits.weeklyLimit,
        percentage: (totalCost / budgetLimits.weeklyLimit) * 100,
        trend: UtilizationTrend.ON_TRACK
      },
      monthly: {
        used: totalCost,
        limit: budgetLimits.monthlyLimit,
        percentage: (totalCost / budgetLimits.monthlyLimit) * 100,
        trend: UtilizationTrend.ON_TRACK
      }
    };
  }

  private calculateCostEfficiency(costRecords: any[]): CostEfficiencyMetrics {
    // Calculate cost efficiency metrics
    return {
      costPerQualityPoint: 5,
      costPerTask: 25,
      efficiencyScore: 75,
      benchmarkComparison: 1.2
    };
  }

  private async generateCostRecommendations(userId: string, costRecords: any[]): Promise<CostRecommendation[]> {
    // Generate cost optimization recommendations
    return [];
  }

  private getModelCostScore(model: AIModel): number {
    return model.pricing.costPerRequest || 
           (model.pricing.costPer1kInputTokens || 0) + 
           (model.pricing.costPer1kOutputTokens || 0);
  }

  private calculateCostSavings(currentModel: AIModel, suggestedModel: AIModel): number {
    const currentCost = this.getModelCostScore(currentModel);
    const suggestedCost = this.getModelCostScore(suggestedModel);
    
    return ((currentCost - suggestedCost) / currentCost) * 100;
  }

  private calculateQualityImpact(currentModel: AIModel, suggestedModel: AIModel): number {
    const currentQuality = currentModel.performance.qualityScore;
    const suggestedQuality = suggestedModel.performance.qualityScore;
    
    return ((suggestedQuality - currentQuality) / currentQuality) * 100;
  }
}