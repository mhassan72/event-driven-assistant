/**
 * Model Cost Calculation Engine
 * Handles dynamic pricing, cost estimation, budget validation, and real-time cost tracking
 */

import {
  AIModel,
  ModelCategory,
  TaskType,
  ModelPricing,
  BudgetLimits,
  ModelRequirements
} from '@/shared/types';
import { IStructuredLogger } from '@/shared/observability/logger';
import { IMetricsCollector } from '@/shared/observability/metrics';
import * as admin from 'firebase-admin';

/**
 * Interface for Model Cost Calculator
 */
export interface IModelCostCalculator {
  // Cost Estimation
  estimateRequestCost(model: AIModel, request: CostEstimationRequest): Promise<CostEstimation>;
  estimateTaskCost(taskType: TaskType, requirements: ModelRequirements): Promise<TaskCostEstimation>;
  estimateBatchCost(requests: BatchCostRequest[]): Promise<BatchCostEstimation>;
  
  // Dynamic Pricing
  updateModelPricing(modelId: string, pricing: ModelPricing): Promise<void>;
  getDynamicPricing(modelId: string, context?: PricingContext): Promise<DynamicPricing>;
  calculateSurgePricing(modelId: string, demand: DemandMetrics): Promise<SurgePricing>;
  
  // Budget Validation
  validateBudget(userId: string, estimatedCost: number): Promise<BudgetValidationResult>;
  checkBudgetConstraints(userId: string, costs: CostBreakdown): Promise<BudgetConstraintResult>;
  reserveBudget(userId: string, amount: number, reservationId: string): Promise<BudgetReservation>;
  releaseBudgetReservation(reservationId: string): Promise<void>;
  
  // Real-time Cost Tracking
  trackRealTimeCost(userId: string, modelId: string, usage: UsageMetrics): Promise<void>;
  getCostAlerts(userId: string): Promise<CostAlert[]>;
  updateCostThresholds(userId: string, thresholds: CostThreshold[]): Promise<void>;
  
  // Cost Optimization
  findCostOptimalModel(requirements: ModelRequirements, availableModels: AIModel[]): Promise<CostOptimizationResult>;
  suggestCostReductions(userId: string, currentUsage: UsagePattern): Promise<CostReductionSuggestion[]>;
  calculateROI(modelA: AIModel, modelB: AIModel, usage: UsageProjection): Promise<ROIAnalysis>;
}/*
*
 * Supporting interfaces for cost calculation
 */
export interface CostEstimationRequest {
  inputTokens: number;
  expectedOutputTokens: number;
  imageCount?: number;
  imageSize?: ImageSize;
  quality?: QualityLevel;
  features?: string[];
  priority?: RequestPriority;
}

export interface CostEstimation {
  baseCost: number;
  adjustedCost: number;
  breakdown: CostBreakdown;
  confidence: number;
  factors: CostFactor[];
  alternatives: AlternativeCostOption[];
}

export interface TaskCostEstimation {
  taskType: TaskType;
  estimatedCost: number;
  costRange: CostRange;
  recommendedModels: ModelCostComparison[];
  budgetImpact: BudgetImpact;
}

export interface BatchCostRequest {
  modelId: string;
  requests: CostEstimationRequest[];
  batchDiscount?: number;
}

export interface BatchCostEstimation {
  totalCost: number;
  individualCosts: CostEstimation[];
  batchDiscount: number;
  savings: number;
  breakdown: BatchCostBreakdown;
}

export interface DynamicPricing {
  modelId: string;
  basePricing: ModelPricing;
  adjustedPricing: ModelPricing;
  adjustmentFactors: PricingAdjustment[];
  validUntil: Date;
}

export interface PricingContext {
  timeOfDay: number;
  dayOfWeek: number;
  systemLoad: number;
  userTier: UserTier;
  region: string;
}

export interface SurgePricing {
  modelId: string;
  surgeMultiplier: number;
  reason: SurgeReason;
  estimatedDuration: number;
  alternatives: AlternativeModel[];
}

export interface DemandMetrics {
  currentLoad: number;
  averageLoad: number;
  queueLength: number;
  responseTime: number;
  errorRate: number;
}

export enum ImageSize {
  SMALL = '512x512',
  MEDIUM = '1024x1024',
  LARGE = '2048x2048',
  XLARGE = '4096x4096'
}

export enum QualityLevel {
  DRAFT = 'draft',
  STANDARD = 'standard',
  HIGH = 'high',
  PREMIUM = 'premium'
}

export enum RequestPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

export interface CostBreakdown {
  inputTokenCost: number;
  outputTokenCost: number;
  imageCost: number;
  featureCosts: FeatureCost[];
  priorityAdjustment: number;
  taxes: number;
  total: number;
}

export interface FeatureCost {
  feature: string;
  cost: number;
  description: string;
}

export interface CostFactor {
  factor: CostFactorType;
  impact: number;
  description: string;
}

export enum CostFactorType {
  BASE_PRICING = 'base_pricing',
  SURGE_PRICING = 'surge_pricing',
  VOLUME_DISCOUNT = 'volume_discount',
  USER_TIER = 'user_tier',
  PRIORITY_ADJUSTMENT = 'priority_adjustment',
  FEATURE_PREMIUM = 'feature_premium',
  REGIONAL_ADJUSTMENT = 'regional_adjustment'
}

export interface AlternativeCostOption {
  modelId: string;
  modelName: string;
  estimatedCost: number;
  costSavings: number;
  qualityImpact: number;
  latencyImpact: number;
}

export interface CostRange {
  minimum: number;
  maximum: number;
  expected: number;
  confidence: number;
}

export interface ModelCostComparison {
  modelId: string;
  modelName: string;
  estimatedCost: number;
  costEfficiencyScore: number;
  qualityScore: number;
  recommendation: CostRecommendation;
}

export enum CostRecommendation {
  HIGHLY_RECOMMENDED = 'highly_recommended',
  RECOMMENDED = 'recommended',
  ACCEPTABLE = 'acceptable',
  NOT_RECOMMENDED = 'not_recommended'
}

export interface BudgetImpact {
  dailyImpact: number;
  weeklyImpact: number;
  monthlyImpact: number;
  percentageOfBudget: BudgetPercentage;
}

export interface BudgetPercentage {
  daily: number;
  weekly: number;
  monthly: number;
}

export interface BatchCostBreakdown {
  subtotal: number;
  batchDiscount: number;
  taxes: number;
  total: number;
  perRequestAverage: number;
}

export interface PricingAdjustment {
  type: AdjustmentType;
  multiplier: number;
  reason: string;
  validUntil?: Date;
}

export enum AdjustmentType {
  SURGE = 'surge',
  DISCOUNT = 'discount',
  TIER_BONUS = 'tier_bonus',
  REGIONAL = 'regional',
  PROMOTIONAL = 'promotional'
}

export enum UserTier {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise'
}

export enum SurgeReason {
  HIGH_DEMAND = 'high_demand',
  LIMITED_CAPACITY = 'limited_capacity',
  PEAK_HOURS = 'peak_hours',
  MAINTENANCE = 'maintenance'
}

export interface AlternativeModel {
  modelId: string;
  modelName: string;
  availableCapacity: number;
  estimatedWaitTime: number;
  costComparison: number;
}

export interface BudgetValidationResult {
  isValid: boolean;
  remainingBudget: RemainingBudget;
  violations: BudgetViolation[];
  recommendations: BudgetRecommendation[];
}

export interface RemainingBudget {
  daily: number;
  weekly: number;
  monthly: number;
  perRequest: number;
}

export interface BudgetViolation {
  type: BudgetViolationType;
  limit: number;
  requested: number;
  excess: number;
  severity: ViolationSeverity;
}

export enum BudgetViolationType {
  DAILY_LIMIT = 'daily_limit',
  WEEKLY_LIMIT = 'weekly_limit',
  MONTHLY_LIMIT = 'monthly_limit',
  PER_REQUEST_LIMIT = 'per_request_limit'
}

export enum ViolationSeverity {
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface BudgetRecommendation {
  action: BudgetAction;
  description: string;
  impact: string;
  priority: ActionPriority;
}

export enum BudgetAction {
  INCREASE_BUDGET = 'increase_budget',
  SWITCH_MODEL = 'switch_model',
  REDUCE_USAGE = 'reduce_usage',
  WAIT_FOR_RESET = 'wait_for_reset'
}

export enum ActionPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export interface BudgetConstraintResult {
  constraintsMet: boolean;
  constraintChecks: ConstraintCheck[];
  totalCost: number;
  projectedUsage: UsageProjection;
}

export interface ConstraintCheck {
  constraint: BudgetConstraint;
  currentValue: number;
  limit: number;
  status: ConstraintStatus;
}

export interface BudgetConstraint {
  type: BudgetConstraintType;
  period: TimePeriod;
  limit: number;
}

export enum BudgetConstraintType {
  TOTAL_SPEND = 'total_spend',
  MODEL_SPEND = 'model_spend',
  TASK_SPEND = 'task_spend',
  HOURLY_SPEND = 'hourly_spend'
}

export enum TimePeriod {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month'
}

export enum ConstraintStatus {
  WITHIN_LIMIT = 'within_limit',
  APPROACHING_LIMIT = 'approaching_limit',
  EXCEEDED = 'exceeded'
}

export interface BudgetReservation {
  reservationId: string;
  userId: string;
  amount: number;
  createdAt: Date;
  expiresAt: Date;
  status: ReservationStatus;
}

export enum ReservationStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  RELEASED = 'released',
  CONSUMED = 'consumed'
}

export interface UsageMetrics {
  inputTokens: number;
  outputTokens: number;
  processingTime: number;
  quality: number;
  success: boolean;
  errorType?: string;
}

export interface CostAlert {
  id: string;
  userId: string;
  type: AlertType;
  threshold: number;
  currentValue: number;
  severity: AlertSeverity;
  message: string;
  createdAt: Date;
  acknowledged: boolean;
}

export enum AlertType {
  BUDGET_THRESHOLD = 'budget_threshold',
  COST_SPIKE = 'cost_spike',
  UNUSUAL_USAGE = 'unusual_usage',
  MODEL_COST_INCREASE = 'model_cost_increase'
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface CostThreshold {
  type: ThresholdType;
  value: number;
  period: TimePeriod;
  alertLevel: AlertSeverity;
}

export enum ThresholdType {
  ABSOLUTE_COST = 'absolute_cost',
  PERCENTAGE_OF_BUDGET = 'percentage_of_budget',
  COST_INCREASE_RATE = 'cost_increase_rate',
  USAGE_ANOMALY = 'usage_anomaly'
}

export interface CostOptimizationResult {
  recommendedModel: AIModel;
  costSavings: number;
  qualityImpact: number;
  alternatives: ModelAlternative[];
  reasoning: OptimizationReasoning;
}

export interface ModelAlternative {
  model: AIModel;
  costDifference: number;
  qualityDifference: number;
  latencyDifference: number;
  suitabilityScore: number;
}

export interface OptimizationReasoning {
  primaryFactors: string[];
  tradeoffs: string[];
  confidence: number;
  assumptions: string[];
}

export interface UsagePattern {
  userId: string;
  timeRange: TimeRange;
  totalCost: number;
  modelUsage: ModelUsageStats[];
  taskDistribution: TaskUsageStats[];
  peakUsageTimes: PeakUsage[];
}

export interface ModelUsageStats {
  modelId: string;
  usageCount: number;
  totalCost: number;
  averageCost: number;
}

export interface TaskUsageStats {
  taskType: TaskType;
  usageCount: number;
  totalCost: number;
  averageCost: number;
}

export interface PeakUsage {
  timeOfDay: number;
  dayOfWeek: number;
  usageCount: number;
  cost: number;
}

export interface TimeRange {
  startDate: Date;
  endDate: Date;
}

export interface CostReductionSuggestion {
  type: ReductionType;
  description: string;
  potentialSavings: number;
  implementationEffort: EffortLevel;
  impact: ImpactLevel;
  steps: string[];
}

export enum ReductionType {
  MODEL_SUBSTITUTION = 'model_substitution',
  USAGE_OPTIMIZATION = 'usage_optimization',
  TIMING_OPTIMIZATION = 'timing_optimization',
  BATCH_PROCESSING = 'batch_processing',
  QUALITY_ADJUSTMENT = 'quality_adjustment'
}

export enum EffortLevel {
  MINIMAL = 'minimal',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export enum ImpactLevel {
  MINIMAL = 'minimal',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  SIGNIFICANT = 'significant'
}

export interface UsageProjection {
  timeHorizon: number; // days
  projectedUsage: ProjectedUsage[];
  confidence: number;
  assumptions: string[];
}

export interface ProjectedUsage {
  date: Date;
  estimatedCost: number;
  estimatedUsage: number;
  confidence: number;
}

export interface ROIAnalysis {
  modelA: ModelROI;
  modelB: ModelROI;
  comparison: ROIComparison;
  recommendation: ROIRecommendation;
}

export interface ModelROI {
  modelId: string;
  totalCost: number;
  totalBenefit: number;
  roi: number;
  paybackPeriod: number;
}

export interface ROIComparison {
  costDifference: number;
  benefitDifference: number;
  roiDifference: number;
  betterChoice: string;
  confidence: number;
}

export interface ROIRecommendation {
  action: ROIAction;
  reasoning: string;
  expectedOutcome: string;
  risks: string[];
}

export enum ROIAction {
  SWITCH_TO_MODEL_A = 'switch_to_model_a',
  SWITCH_TO_MODEL_B = 'switch_to_model_b',
  CONTINUE_CURRENT = 'continue_current',
  FURTHER_ANALYSIS = 'further_analysis'
}

/**
 * Model Cost Calculator Implementation
 */
export class ModelCostCalculator implements IModelCostCalculator {
  private firestore: admin.firestore.Firestore;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  private pricingCache: Map<string, DynamicPricing> = new Map();
  private alertThresholds: Map<string, CostThreshold[]> = new Map();

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
  // Cost Estimation
  // ============================================================================

  async estimateRequestCost(model: AIModel, request: CostEstimationRequest): Promise<CostEstimation> {
    try {
      this.logger.debug('Estimating request cost', { modelId: model.id, request });
      
      // Get dynamic pricing
      const dynamicPricing = await this.getDynamicPricing(model.id);
      const pricing = dynamicPricing.adjustedPricing;
      
      // Calculate base costs
      const inputTokenCost = (request.inputTokens / 1000) * (pricing.costPer1kInputTokens || 0);
      const outputTokenCost = (request.expectedOutputTokens / 1000) * (pricing.costPer1kOutputTokens || 0);
      
      // Calculate image costs if applicable
      let imageCost = 0;
      if (request.imageCount && model.category === ModelCategory.IMAGE_GENERATION) {
        imageCost = request.imageCount * (pricing.costPerImage || 0);
        
        // Apply size and quality multipliers
        if (request.imageSize) {
          imageCost *= this.getImageSizeMultiplier(request.imageSize);
        }
        if (request.quality) {
          imageCost *= this.getQualityMultiplier(request.quality);
        }
      }
      
      // Calculate feature costs
      const featureCosts = this.calculateFeatureCosts(request.features || [], model);
      const totalFeatureCost = featureCosts.reduce((sum, fc) => sum + fc.cost, 0);
      
      // Apply priority adjustment
      const priorityAdjustment = this.calculatePriorityAdjustment(
        request.priority || RequestPriority.NORMAL,
        inputTokenCost + outputTokenCost + imageCost + totalFeatureCost
      );
      
      // Calculate taxes (if applicable)
      const subtotal = inputTokenCost + outputTokenCost + imageCost + totalFeatureCost + priorityAdjustment;
      const taxes = subtotal * 0.0; // No taxes for now
      
      const baseCost = Math.max(subtotal, pricing.minimumCost || 0);
      const adjustedCost = baseCost + taxes;
      
      const breakdown: CostBreakdown = {
        inputTokenCost,
        outputTokenCost,
        imageCost,
        featureCosts,
        priorityAdjustment,
        taxes,
        total: adjustedCost
      };
      
      // Generate cost factors
      const factors = this.generateCostFactors(dynamicPricing, request);
      
      // Find alternative cost options
      const alternatives = await this.findAlternativeCostOptions(model, request);
      
      const estimation: CostEstimation = {
        baseCost,
        adjustedCost,
        breakdown,
        confidence: 0.9, // High confidence for direct calculations
        factors,
        alternatives
      };
      
      this.metrics.increment('cost_calculator.estimations_generated');
      this.metrics.histogram('cost_calculator.estimated_cost', adjustedCost);
      
      return estimation;
      
    } catch (error) {
      this.logger.error('Failed to estimate request cost', { modelId: model.id, error });
      throw error;
    }
  }

  async estimateTaskCost(taskType: TaskType, requirements: ModelRequirements): Promise<TaskCostEstimation> {
    try {
      // Get available models for the task type
      const availableModels = await this.getAvailableModelsForTask(taskType);
      
      if (availableModels.length === 0) {
        throw new Error(`No models available for task type: ${taskType}`);
      }
      
      // Estimate costs for each model
      const modelComparisons: ModelCostComparison[] = [];
      let totalCost = 0;
      let minCost = Infinity;
      let maxCost = 0;
      
      for (const model of availableModels) {
        const request: CostEstimationRequest = {
          inputTokens: requirements.inputSize,
          expectedOutputTokens: requirements.expectedOutputSize || 500,
          priority: RequestPriority.NORMAL
        };
        
        const estimation = await this.estimateRequestCost(model, request);
        
        const comparison: ModelCostComparison = {
          modelId: model.id,
          modelName: model.name,
          estimatedCost: estimation.adjustedCost,
          costEfficiencyScore: this.calculateCostEfficiencyScore(model, estimation.adjustedCost),
          qualityScore: model.performance.qualityScore,
          recommendation: this.getCostRecommendation(model, estimation.adjustedCost, requirements)
        };
        
        modelComparisons.push(comparison);
        totalCost += estimation.adjustedCost;
        minCost = Math.min(minCost, estimation.adjustedCost);
        maxCost = Math.max(maxCost, estimation.adjustedCost);
      }
      
      const averageCost = totalCost / availableModels.length;
      
      // Sort by cost efficiency
      modelComparisons.sort((a, b) => b.costEfficiencyScore - a.costEfficiencyScore);
      
      const costRange: CostRange = {
        minimum: minCost,
        maximum: maxCost,
        expected: averageCost,
        confidence: 0.8
      };
      
      // Calculate budget impact (placeholder - would need user context)
      const budgetImpact: BudgetImpact = {
        dailyImpact: averageCost,
        weeklyImpact: averageCost * 7,
        monthlyImpact: averageCost * 30,
        percentageOfBudget: {
          daily: 0, // Would calculate based on user's budget
          weekly: 0,
          monthly: 0
        }
      };
      
      return {
        taskType,
        estimatedCost: averageCost,
        costRange,
        recommendedModels: modelComparisons,
        budgetImpact
      };
      
    } catch (error) {
      this.logger.error('Failed to estimate task cost', { taskType, error });
      throw error;
    }
  }

  async estimateBatchCost(requests: BatchCostRequest[]): Promise<BatchCostEstimation> {
    try {
      const individualCosts: CostEstimation[] = [];
      let subtotal = 0;
      
      // Calculate individual costs
      for (const batchRequest of requests) {
        const model = await this.getModelById(batchRequest.modelId);
        if (!model) {
          throw new Error(`Model not found: ${batchRequest.modelId}`);
        }
        
        for (const request of batchRequest.requests) {
          const estimation = await this.estimateRequestCost(model, request);
          individualCosts.push(estimation);
          subtotal += estimation.adjustedCost;
        }
      }
      
      // Calculate batch discount
      const batchDiscount = this.calculateBatchDiscount(individualCosts.length, subtotal);
      const discountAmount = subtotal * batchDiscount;
      const taxes = (subtotal - discountAmount) * 0.0; // No taxes for now
      const totalCost = subtotal - discountAmount + taxes;
      
      const breakdown: BatchCostBreakdown = {
        subtotal,
        batchDiscount: discountAmount,
        taxes,
        total: totalCost,
        perRequestAverage: totalCost / individualCosts.length
      };
      
      return {
        totalCost,
        individualCosts,
        batchDiscount,
        savings: discountAmount,
        breakdown
      };
      
    } catch (error) {
      this.logger.error('Failed to estimate batch cost', { requestCount: requests.length, error });
      throw error;
    }
  }

  // ============================================================================
  // Dynamic Pricing
  // ============================================================================

  async updateModelPricing(modelId: string, pricing: ModelPricing): Promise<void> {
    try {
      await this.firestore.collection('available_models').doc(modelId).update({
        pricing,
        'metadata.lastUpdated': admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Clear pricing cache for this model
      this.pricingCache.delete(modelId);
      
      this.logger.info('Model pricing updated', { modelId });
      
    } catch (error) {
      this.logger.error('Failed to update model pricing', { modelId, error });
      throw error;
    }
  }

  async getDynamicPricing(modelId: string, context?: PricingContext): Promise<DynamicPricing> {
    try {
      // Check cache first
      const cacheKey = `${modelId}_${context ? JSON.stringify(context) : 'default'}`;
      const cached = this.pricingCache.get(cacheKey);
      
      if (cached && cached.validUntil > new Date()) {
        return cached;
      }
      
      // Get base pricing
      const model = await this.getModelById(modelId);
      if (!model) {
        throw new Error(`Model not found: ${modelId}`);
      }
      
      const basePricing = model.pricing;
      
      // Calculate adjustments
      const adjustmentFactors = await this.calculatePricingAdjustments(modelId, context);
      
      // Apply adjustments
      const adjustedPricing = this.applyPricingAdjustments(basePricing, adjustmentFactors);
      
      const dynamicPricing: DynamicPricing = {
        modelId,
        basePricing,
        adjustedPricing,
        adjustmentFactors,
        validUntil: new Date(Date.now() + 15 * 60 * 1000) // Valid for 15 minutes
      };
      
      // Cache the result
      this.pricingCache.set(cacheKey, dynamicPricing);
      
      return dynamicPricing;
      
    } catch (error) {
      this.logger.error('Failed to get dynamic pricing', { modelId, error });
      throw error;
    }
  }

  async calculateSurgePricing(modelId: string, demand: DemandMetrics): Promise<SurgePricing> {
    try {
      let surgeMultiplier = 1.0;
      let reason = SurgeReason.HIGH_DEMAND;
      let estimatedDuration = 30; // minutes
      
      // Calculate surge based on demand metrics
      if (demand.currentLoad > demand.averageLoad * 2) {
        surgeMultiplier = 1.5;
        reason = SurgeReason.HIGH_DEMAND;
        estimatedDuration = 60;
      } else if (demand.queueLength > 100) {
        surgeMultiplier = 1.3;
        reason = SurgeReason.LIMITED_CAPACITY;
        estimatedDuration = 45;
      } else if (demand.errorRate > 0.1) {
        surgeMultiplier = 1.2;
        reason = SurgeReason.MAINTENANCE;
        estimatedDuration = 30;
      }
      
      // Get alternative models
      const alternatives = await this.getAlternativeModels(modelId);
      
      return {
        modelId,
        surgeMultiplier,
        reason,
        estimatedDuration,
        alternatives
      };
      
    } catch (error) {
      this.logger.error('Failed to calculate surge pricing', { modelId, error });
      throw error;
    }
  }

  // ============================================================================
  // Budget Validation
  // ============================================================================

  async validateBudget(userId: string, estimatedCost: number): Promise<BudgetValidationResult> {
    try {
      const budgetLimits = await this.getUserBudgetLimits(userId);
      const currentUsage = await this.getCurrentUsage(userId);
      
      const remainingBudget: RemainingBudget = {
        daily: Math.max(0, budgetLimits.dailyLimit - currentUsage.daily),
        weekly: Math.max(0, budgetLimits.weeklyLimit - currentUsage.weekly),
        monthly: Math.max(0, budgetLimits.monthlyLimit - currentUsage.monthly),
        perRequest: budgetLimits.perRequestLimit
      };
      
      const violations: BudgetViolation[] = [];
      
      // Check each budget limit
      if (estimatedCost > remainingBudget.daily) {
        violations.push({
          type: BudgetViolationType.DAILY_LIMIT,
          limit: budgetLimits.dailyLimit,
          requested: estimatedCost,
          excess: estimatedCost - remainingBudget.daily,
          severity: ViolationSeverity.ERROR
        });
      }
      
      if (estimatedCost > remainingBudget.weekly) {
        violations.push({
          type: BudgetViolationType.WEEKLY_LIMIT,
          limit: budgetLimits.weeklyLimit,
          requested: estimatedCost,
          excess: estimatedCost - remainingBudget.weekly,
          severity: ViolationSeverity.ERROR
        });
      }
      
      if (estimatedCost > remainingBudget.monthly) {
        violations.push({
          type: BudgetViolationType.MONTHLY_LIMIT,
          limit: budgetLimits.monthlyLimit,
          requested: estimatedCost,
          excess: estimatedCost - remainingBudget.monthly,
          severity: ViolationSeverity.ERROR
        });
      }
      
      if (estimatedCost > remainingBudget.perRequest) {
        violations.push({
          type: BudgetViolationType.PER_REQUEST_LIMIT,
          limit: budgetLimits.perRequestLimit,
          requested: estimatedCost,
          excess: estimatedCost - remainingBudget.perRequest,
          severity: ViolationSeverity.ERROR
        });
      }
      
      const isValid = violations.length === 0;
      
      // Generate recommendations
      const recommendations = await this.generateBudgetRecommendations(userId, violations, estimatedCost);
      
      return {
        isValid,
        remainingBudget,
        violations,
        recommendations
      };
      
    } catch (error) {
      this.logger.error('Failed to validate budget', { userId, estimatedCost, error });
      throw error;
    }
  }

  async checkBudgetConstraints(userId: string, costs: CostBreakdown): Promise<BudgetConstraintResult> {
    try {
      const constraints = await this.getUserBudgetConstraints(userId);
      const constraintChecks: ConstraintCheck[] = [];
      let constraintsMet = true;
      
      for (const constraint of constraints) {
        const currentValue = await this.getCurrentConstraintValue(userId, constraint);
        const status = this.evaluateConstraintStatus(currentValue, constraint.limit, costs.total);
        
        constraintChecks.push({
          constraint,
          currentValue,
          limit: constraint.limit,
          status
        });
        
        if (status === ConstraintStatus.EXCEEDED) {
          constraintsMet = false;
        }
      }
      
      // Generate usage projection
      const projectedUsage = await this.generateUsageProjection(userId, costs.total);
      
      return {
        constraintsMet,
        constraintChecks,
        totalCost: costs.total,
        projectedUsage
      };
      
    } catch (error) {
      this.logger.error('Failed to check budget constraints', { userId, error });
      throw error;
    }
  }

  async reserveBudget(userId: string, amount: number, reservationId: string): Promise<BudgetReservation> {
    try {
      const reservation: BudgetReservation = {
        reservationId,
        userId,
        amount,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        status: ReservationStatus.ACTIVE
      };
      
      await this.firestore.collection('budget_reservations').doc(reservationId).set(reservation);
      
      this.logger.info('Budget reserved', { userId, amount, reservationId });
      
      return reservation;
      
    } catch (error) {
      this.logger.error('Failed to reserve budget', { userId, amount, reservationId, error });
      throw error;
    }
  }

  async releaseBudgetReservation(reservationId: string): Promise<void> {
    try {
      await this.firestore.collection('budget_reservations').doc(reservationId).update({
        status: ReservationStatus.RELEASED,
        releasedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      this.logger.info('Budget reservation released', { reservationId });
      
    } catch (error) {
      this.logger.error('Failed to release budget reservation', { reservationId, error });
      throw error;
    }
  }

  // ============================================================================
  // Real-time Cost Tracking
  // ============================================================================

  async trackRealTimeCost(userId: string, modelId: string, usage: UsageMetrics): Promise<void> {
    try {
      // Calculate actual cost based on usage
      const model = await this.getModelById(modelId);
      if (!model) {
        throw new Error(`Model not found: ${modelId}`);
      }
      
      const actualCost = this.calculateActualCost(model, usage);
      
      // Store cost tracking record
      await this.firestore.collection('real_time_costs').add({
        userId,
        modelId,
        usage,
        actualCost,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Update user's running totals
      await this.updateUserCostTotals(userId, actualCost);
      
      // Check for cost alerts
      await this.checkCostAlerts(userId, actualCost);
      
      this.metrics.increment('cost_calculator.real_time_tracking');
      this.metrics.histogram('cost_calculator.actual_cost', actualCost);
      
    } catch (error) {
      this.logger.error('Failed to track real-time cost', { userId, modelId, error });
      throw error;
    }
  }

  async getCostAlerts(userId: string): Promise<CostAlert[]> {
    try {
      const snapshot = await this.firestore
        .collection('cost_alerts')
        .where('userId', '==', userId)
        .where('acknowledged', '==', false)
        .orderBy('createdAt', 'desc')
        .get();
        
      return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as CostAlert));
      
    } catch (error) {
      this.logger.error('Failed to get cost alerts', { userId, error });
      throw error;
    }
  }

  async updateCostThresholds(userId: string, thresholds: CostThreshold[]): Promise<void> {
    try {
      await this.firestore.collection('user_cost_thresholds').doc(userId).set({
        thresholds,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Update in-memory cache
      this.alertThresholds.set(userId, thresholds);
      
      this.logger.info('Cost thresholds updated', { userId, thresholdCount: thresholds.length });
      
    } catch (error) {
      this.logger.error('Failed to update cost thresholds', { userId, error });
      throw error;
    }
  }

  // ============================================================================
  // Cost Optimization
  // ============================================================================

  async findCostOptimalModel(requirements: ModelRequirements, availableModels: AIModel[]): Promise<CostOptimizationResult> {
    try {
      // Filter models that meet requirements
      const suitableModels = availableModels.filter(model => 
        this.modelMeetsRequirements(model, requirements)
      );
      
      if (suitableModels.length === 0) {
        throw new Error('No models meet the specified requirements');
      }
      
      // Calculate cost and quality scores for each model
      const modelAlternatives: ModelAlternative[] = [];
      let bestModel = suitableModels[0];
      let bestScore = 0;
      
      for (const model of suitableModels) {
        const costScore = this.calculateModelCostScore(model);
        const qualityScore = model.performance.qualityScore;
        const latencyScore = this.calculateLatencyScore(model);
        
        // Combined suitability score (weighted)
        const suitabilityScore = (costScore * 0.4) + (qualityScore * 0.4) + (latencyScore * 0.2);
        
        const alternative: ModelAlternative = {
          model,
          costDifference: 0, // Will be calculated relative to best
          qualityDifference: 0,
          latencyDifference: 0,
          suitabilityScore
        };
        
        modelAlternatives.push(alternative);
        
        if (suitabilityScore > bestScore) {
          bestScore = suitabilityScore;
          bestModel = model;
        }
      }
      
      // Calculate differences relative to best model
      modelAlternatives.forEach(alt => {
        alt.costDifference = this.calculateModelCostScore(alt.model) - this.calculateModelCostScore(bestModel);
        alt.qualityDifference = alt.model.performance.qualityScore - bestModel.performance.qualityScore;
        alt.latencyDifference = alt.model.performance.averageLatency - bestModel.performance.averageLatency;
      });
      
      // Sort alternatives by suitability score
      modelAlternatives.sort((a, b) => b.suitabilityScore - a.suitabilityScore);
      
      const reasoning: OptimizationReasoning = {
        primaryFactors: ['cost efficiency', 'quality score', 'latency performance'],
        tradeoffs: ['Lower cost may mean reduced quality', 'Faster models may cost more'],
        confidence: 0.85,
        assumptions: ['Usage patterns remain consistent', 'Model performance is stable']
      };
      
      return {
        recommendedModel: bestModel,
        costSavings: 0, // Would calculate based on current model
        qualityImpact: 0,
        alternatives: modelAlternatives,
        reasoning
      };
      
    } catch (error) {
      this.logger.error('Failed to find cost optimal model', { requirements, error });
      throw error;
    }
  }

  async suggestCostReductions(userId: string, currentUsage: UsagePattern): Promise<CostReductionSuggestion[]> {
    try {
      const suggestions: CostReductionSuggestion[] = [];
      
      // Analyze usage patterns for optimization opportunities
      
      // 1. Model substitution suggestions
      for (const modelUsage of currentUsage.modelUsage) {
        const alternatives = await this.findCheaperAlternatives(modelUsage.modelId);
        
        if (alternatives.length > 0) {
          const bestAlternative = alternatives[0];
          const potentialSavings = (modelUsage.averageCost - bestAlternative.estimatedCost) * modelUsage.usageCount;
          
          if (potentialSavings > 0) {
            suggestions.push({
              type: ReductionType.MODEL_SUBSTITUTION,
              description: `Switch from ${modelUsage.modelId} to ${bestAlternative.modelId} for similar tasks`,
              potentialSavings,
              implementationEffort: EffortLevel.LOW,
              impact: this.categorizeImpact(potentialSavings),
              steps: [
                'Update model preferences',
                'Test alternative model with sample requests',
                'Monitor quality and performance'
              ]
            });
          }
        }
      }
      
      // 2. Usage timing optimization
      const peakUsageCosts = currentUsage.peakUsageTimes
        .filter(peak => peak.cost > currentUsage.totalCost * 0.1)
        .reduce((sum, peak) => sum + peak.cost, 0);
        
      if (peakUsageCosts > 0) {
        suggestions.push({
          type: ReductionType.TIMING_OPTIMIZATION,
          description: 'Shift usage away from peak hours to reduce surge pricing',
          potentialSavings: peakUsageCosts * 0.2, // Estimate 20% savings
          implementationEffort: EffortLevel.MEDIUM,
          impact: this.categorizeImpact(peakUsageCosts * 0.2),
          steps: [
            'Identify non-urgent tasks',
            'Schedule tasks during off-peak hours',
            'Use batch processing for large workloads'
          ]
        });
      }
      
      // 3. Quality adjustment suggestions
      const highQualityUsage = currentUsage.taskDistribution
        .filter(task => task.averageCost > 50) // High-cost tasks
        .reduce((sum, task) => sum + task.totalCost, 0);
        
      if (highQualityUsage > currentUsage.totalCost * 0.3) {
        suggestions.push({
          type: ReductionType.QUALITY_ADJUSTMENT,
          description: 'Use lower quality settings for non-critical tasks',
          potentialSavings: highQualityUsage * 0.15, // Estimate 15% savings
          implementationEffort: EffortLevel.LOW,
          impact: ImpactLevel.LOW,
          steps: [
            'Identify tasks that don\'t require highest quality',
            'Adjust quality settings for those tasks',
            'Monitor output quality to ensure acceptability'
          ]
        });
      }
      
      // Sort suggestions by potential savings
      suggestions.sort((a, b) => b.potentialSavings - a.potentialSavings);
      
      return suggestions;
      
    } catch (error) {
      this.logger.error('Failed to suggest cost reductions', { userId, error });
      throw error;
    }
  }

  async calculateROI(modelA: AIModel, modelB: AIModel, usage: UsageProjection): Promise<ROIAnalysis> {
    try {
      // Calculate ROI for each model based on projected usage
      const modelAROI = await this.calculateModelROI(modelA, usage);
      const modelBROI = await this.calculateModelROI(modelB, usage);
      
      const comparison: ROIComparison = {
        costDifference: modelBROI.totalCost - modelAROI.totalCost,
        benefitDifference: modelBROI.totalBenefit - modelAROI.totalBenefit,
        roiDifference: modelBROI.roi - modelAROI.roi,
        betterChoice: modelAROI.roi > modelBROI.roi ? modelA.id : modelB.id,
        confidence: 0.8
      };
      
      const recommendation: ROIRecommendation = {
        action: comparison.roiDifference > 0.1 ? ROIAction.SWITCH_TO_MODEL_B :
                comparison.roiDifference < -0.1 ? ROIAction.SWITCH_TO_MODEL_A :
                ROIAction.CONTINUE_CURRENT,
        reasoning: this.generateROIReasoning(comparison),
        expectedOutcome: `Expected ROI improvement of ${Math.abs(comparison.roiDifference * 100).toFixed(1)}%`,
        risks: ['Model performance may vary', 'Usage patterns may change', 'Quality differences may impact user satisfaction']
      };
      
      return {
        modelA: modelAROI,
        modelB: modelBROI,
        comparison,
        recommendation
      };
      
    } catch (error) {
      this.logger.error('Failed to calculate ROI', { modelA: modelA.id, modelB: modelB.id, error });
      throw error;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private getImageSizeMultiplier(size: ImageSize): number {
    switch (size) {
      case ImageSize.SMALL: return 1.0;
      case ImageSize.MEDIUM: return 1.5;
      case ImageSize.LARGE: return 2.0;
      case ImageSize.XLARGE: return 3.0;
      default: return 1.0;
    }
  }

  private getQualityMultiplier(quality: QualityLevel): number {
    switch (quality) {
      case QualityLevel.DRAFT: return 0.8;
      case QualityLevel.STANDARD: return 1.0;
      case QualityLevel.HIGH: return 1.3;
      case QualityLevel.PREMIUM: return 1.6;
      default: return 1.0;
    }
  }

  private calculateFeatureCosts(features: string[], model: AIModel): FeatureCost[] {
    const featureCosts: FeatureCost[] = [];
    
    // Define feature cost mappings
    const featurePricing: Record<string, number> = {
      'streaming': 5,
      'tools': 10,
      'vision': 15,
      'code_execution': 20
    };
    
    for (const feature of features) {
      const cost = featurePricing[feature] || 0;
      if (cost > 0) {
        featureCosts.push({
          feature,
          cost,
          description: `Premium feature: ${feature}`
        });
      }
    }
    
    return featureCosts;
  }

  private calculatePriorityAdjustment(priority: RequestPriority, baseCost: number): number {
    switch (priority) {
      case RequestPriority.LOW: return baseCost * -0.1; // 10% discount
      case RequestPriority.NORMAL: return 0;
      case RequestPriority.HIGH: return baseCost * 0.2; // 20% premium
      case RequestPriority.URGENT: return baseCost * 0.5; // 50% premium
      default: return 0;
    }
  }

  private generateCostFactors(dynamicPricing: DynamicPricing, request: CostEstimationRequest): CostFactor[] {
    const factors: CostFactor[] = [];
    
    // Add factors based on pricing adjustments
    for (const adjustment of dynamicPricing.adjustmentFactors) {
      factors.push({
        factor: this.mapAdjustmentTypeToCostFactor(adjustment.type),
        impact: adjustment.multiplier - 1,
        description: adjustment.reason
      });
    }
    
    // Add priority factor if applicable
    if (request.priority && request.priority !== RequestPriority.NORMAL) {
      factors.push({
        factor: CostFactorType.PRIORITY_ADJUSTMENT,
        impact: this.getPriorityImpact(request.priority),
        description: `Priority level: ${request.priority}`
      });
    }
    
    return factors;
  }

  private async findAlternativeCostOptions(model: AIModel, request: CostEstimationRequest): Promise<AlternativeCostOption[]> {
    // Find alternative models in the same category
    const alternatives = await this.getAlternativeModelsInCategory(model.category);
    const options: AlternativeCostOption[] = [];
    
    for (const altModel of alternatives) {
      if (altModel.id === model.id) continue;
      
      const altEstimation = await this.estimateRequestCost(altModel, request);
      const costSavings = model.pricing.costPerRequest ? 
        ((model.pricing.costPerRequest - altEstimation.adjustedCost) / model.pricing.costPerRequest) * 100 : 0;
      
      options.push({
        modelId: altModel.id,
        modelName: altModel.name,
        estimatedCost: altEstimation.adjustedCost,
        costSavings,
        qualityImpact: altModel.performance.qualityScore - model.performance.qualityScore,
        latencyImpact: altModel.performance.averageLatency - model.performance.averageLatency
      });
    }
    
    // Sort by cost savings
    options.sort((a, b) => b.costSavings - a.costSavings);
    
    return options.slice(0, 3); // Return top 3 alternatives
  }

  private async getAvailableModelsForTask(taskType: TaskType): Promise<AIModel[]> {
    // This would integrate with ModelManagementService
    // For now, return empty array as placeholder
    return [];
  }

  private calculateCostEfficiencyScore(model: AIModel, estimatedCost: number): number {
    // Calculate cost efficiency as quality per unit cost
    return model.performance.qualityScore / Math.max(estimatedCost, 1);
  }

  private getCostRecommendation(model: AIModel, estimatedCost: number, requirements: ModelRequirements): CostRecommendation {
    const costEfficiency = this.calculateCostEfficiencyScore(model, estimatedCost);
    
    if (costEfficiency > 0.3) return CostRecommendation.HIGHLY_RECOMMENDED;
    if (costEfficiency > 0.2) return CostRecommendation.RECOMMENDED;
    if (costEfficiency > 0.1) return CostRecommendation.ACCEPTABLE;
    return CostRecommendation.NOT_RECOMMENDED;
  }

  private calculateBatchDiscount(requestCount: number, subtotal: number): number {
    // Progressive batch discount
    if (requestCount >= 100) return 0.15; // 15% discount
    if (requestCount >= 50) return 0.10;  // 10% discount
    if (requestCount >= 20) return 0.05;  // 5% discount
    return 0; // No discount
  }

  private async getModelById(modelId: string): Promise<AIModel | null> {
    try {
      const doc = await this.firestore.collection('available_models').doc(modelId).get();
      return doc.exists ? { id: doc.id, ...doc.data() } as AIModel : null;
    } catch (error) {
      this.logger.error('Failed to get model by ID', { modelId, error });
      return null;
    }
  }

  private async calculatePricingAdjustments(modelId: string, context?: PricingContext): Promise<PricingAdjustment[]> {
    const adjustments: PricingAdjustment[] = [];
    
    if (context) {
      // Time-based adjustments
      if (context.timeOfDay >= 9 && context.timeOfDay <= 17) {
        adjustments.push({
          type: AdjustmentType.SURGE,
          multiplier: 1.1,
          reason: 'Peak business hours'
        });
      }
      
      // User tier adjustments
      if (context.userTier === UserTier.PREMIUM) {
        adjustments.push({
          type: AdjustmentType.TIER_BONUS,
          multiplier: 0.9,
          reason: 'Premium user discount'
        });
      }
      
      // System load adjustments
      if (context.systemLoad > 0.8) {
        adjustments.push({
          type: AdjustmentType.SURGE,
          multiplier: 1.2,
          reason: 'High system load'
        });
      }
    }
    
    return adjustments;
  }

  private applyPricingAdjustments(basePricing: ModelPricing, adjustments: PricingAdjustment[]): ModelPricing {
    let adjustedPricing = { ...basePricing };
    
    for (const adjustment of adjustments) {
      if (adjustedPricing.costPer1kInputTokens) {
        adjustedPricing.costPer1kInputTokens *= adjustment.multiplier;
      }
      if (adjustedPricing.costPer1kOutputTokens) {
        adjustedPricing.costPer1kOutputTokens *= adjustment.multiplier;
      }
      if (adjustedPricing.costPerImage) {
        adjustedPricing.costPerImage *= adjustment.multiplier;
      }
      if (adjustedPricing.costPerRequest) {
        adjustedPricing.costPerRequest *= adjustment.multiplier;
      }
    }
    
    return adjustedPricing;
  }

  private async getAlternativeModels(modelId: string): Promise<AlternativeModel[]> {
    // Get models in the same category with available capacity
    return [];
  }

  private async getUserBudgetLimits(userId: string): Promise<BudgetLimits> {
    try {
      const doc = await this.firestore.collection('user_model_preferences').doc(userId).get();
      
      if (doc.exists) {
        const data = doc.data();
        return data?.budgetLimits || this.getDefaultBudgetLimits();
      }
      
      return this.getDefaultBudgetLimits();
    } catch (error) {
      this.logger.error('Failed to get user budget limits', { userId, error });
      return this.getDefaultBudgetLimits();
    }
  }

  private getDefaultBudgetLimits(): BudgetLimits {
    return {
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
  }

  private async getCurrentUsage(userId: string): Promise<{ daily: number; weekly: number; monthly: number }> {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(dayStart.getTime() - (dayStart.getDay() * 24 * 60 * 60 * 1000));
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [dailyQuery, weeklyQuery, monthlyQuery] = await Promise.all([
      this.firestore.collection('real_time_costs')
        .where('userId', '==', userId)
        .where('timestamp', '>=', dayStart)
        .get(),
      this.firestore.collection('real_time_costs')
        .where('userId', '==', userId)
        .where('timestamp', '>=', weekStart)
        .get(),
      this.firestore.collection('real_time_costs')
        .where('userId', '==', userId)
        .where('timestamp', '>=', monthStart)
        .get()
    ]);

    const daily = dailyQuery.docs.reduce((sum: number, doc: any) => sum + (doc.data().actualCost || 0), 0);
    const weekly = weeklyQuery.docs.reduce((sum: number, doc: any) => sum + (doc.data().actualCost || 0), 0);
    const monthly = monthlyQuery.docs.reduce((sum: number, doc: any) => sum + (doc.data().actualCost || 0), 0);

    return { daily, weekly, monthly };
  }

  private async generateBudgetRecommendations(
    userId: string, 
    violations: BudgetViolation[], 
    estimatedCost: number
  ): Promise<BudgetRecommendation[]> {
    const recommendations: BudgetRecommendation[] = [];
    
    for (const violation of violations) {
      switch (violation.type) {
        case BudgetViolationType.PER_REQUEST_LIMIT:
          recommendations.push({
            action: BudgetAction.SWITCH_MODEL,
            description: 'Consider using a more cost-effective model',
            impact: `Could reduce cost by up to ${(estimatedCost * 0.3).toFixed(0)} credits`,
            priority: ActionPriority.HIGH
          });
          break;
          
        case BudgetViolationType.DAILY_LIMIT:
          recommendations.push({
            action: BudgetAction.WAIT_FOR_RESET,
            description: 'Wait until tomorrow for budget reset',
            impact: 'No additional cost today',
            priority: ActionPriority.MEDIUM
          });
          break;
          
        default:
          recommendations.push({
            action: BudgetAction.INCREASE_BUDGET,
            description: `Consider increasing your ${violation.type.replace('_', ' ')}`,
            impact: 'Allows continued usage',
            priority: ActionPriority.LOW
          });
      }
    }
    
    return recommendations;
  }

  private async getUserBudgetConstraints(userId: string): Promise<BudgetConstraint[]> {
    // Get user-defined budget constraints
    return [];
  }

  private async getCurrentConstraintValue(userId: string, constraint: BudgetConstraint): Promise<number> {
    // Calculate current value for the constraint
    return 0;
  }

  private evaluateConstraintStatus(currentValue: number, limit: number, additionalCost: number): ConstraintStatus {
    const projectedValue = currentValue + additionalCost;
    
    if (projectedValue > limit) return ConstraintStatus.EXCEEDED;
    if (projectedValue > limit * 0.9) return ConstraintStatus.APPROACHING_LIMIT;
    return ConstraintStatus.WITHIN_LIMIT;
  }

  private async generateUsageProjection(userId: string, additionalCost: number): Promise<UsageProjection> {
    // Generate usage projection based on historical data
    return {
      timeHorizon: 30,
      projectedUsage: [],
      confidence: 0.7,
      assumptions: ['Historical usage patterns continue', 'No major changes in usage behavior']
    };
  }

  private calculateActualCost(model: AIModel, usage: UsageMetrics): number {
    const inputCost = (usage.inputTokens / 1000) * (model.pricing.costPer1kInputTokens || 0);
    const outputCost = (usage.outputTokens / 1000) * (model.pricing.costPer1kOutputTokens || 0);
    
    return Math.max(inputCost + outputCost, model.pricing.minimumCost || 0);
  }

  private async updateUserCostTotals(userId: string, actualCost: number): Promise<void> {
    const userCostRef = this.firestore.collection('user_cost_totals').doc(userId);
    
    await this.firestore.runTransaction(async (transaction: any) => {
      const doc = await transaction.get(userCostRef);
      
      if (doc.exists) {
        const data = doc.data();
        const newTotal = (data?.totalCost || 0) + actualCost;
        
        transaction.update(userCostRef, {
          totalCost: newTotal,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        transaction.set(userCostRef, {
          userId,
          totalCost: actualCost,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    });
  }

  private async checkCostAlerts(userId: string, actualCost: number): Promise<void> {
    const thresholds = this.alertThresholds.get(userId) || [];
    const currentUsage = await this.getCurrentUsage(userId);
    
    for (const threshold of thresholds) {
      let currentValue = 0;
      
      switch (threshold.type) {
        case ThresholdType.ABSOLUTE_COST:
          currentValue = currentUsage.daily; // or weekly/monthly based on period
          break;
        case ThresholdType.COST_INCREASE_RATE:
          // Calculate cost increase rate
          break;
      }
      
      if (currentValue >= threshold.value) {
        await this.createCostAlert(userId, threshold, currentValue);
      }
    }
  }

  private async createCostAlert(userId: string, threshold: CostThreshold, currentValue: number): Promise<void> {
    const alert: Omit<CostAlert, 'id'> = {
      userId,
      type: this.mapThresholdTypeToAlertType(threshold.type),
      threshold: threshold.value,
      currentValue,
      severity: threshold.alertLevel,
      message: `Cost threshold exceeded: ${currentValue} >= ${threshold.value}`,
      createdAt: new Date(),
      acknowledged: false
    };
    
    await this.firestore.collection('cost_alerts').add(alert);
  }

  private modelMeetsRequirements(model: AIModel, requirements: ModelRequirements): boolean {
    if (requirements.maxBudget && this.calculateModelCostScore(model) > requirements.maxBudget) {
      return false;
    }
    
    if (requirements.maxLatency && model.performance.averageLatency > requirements.maxLatency) {
      return false;
    }
    
    if (requirements.qualityThreshold && model.performance.qualityScore < requirements.qualityThreshold) {
      return false;
    }
    
    return true;
  }

  private calculateModelCostScore(model: AIModel): number {
    return model.pricing.costPerRequest || 
           (model.pricing.costPer1kInputTokens || 0) + 
           (model.pricing.costPer1kOutputTokens || 0);
  }

  private calculateLatencyScore(model: AIModel): number {
    // Convert latency to a 0-10 score (lower latency = higher score)
    return Math.max(0, 10 - (model.performance.averageLatency / 1000));
  }

  private async findCheaperAlternatives(modelId: string): Promise<AlternativeCostOption[]> {
    // Find cheaper alternative models
    return [];
  }

  private categorizeImpact(savings: number): ImpactLevel {
    if (savings < 10) return ImpactLevel.MINIMAL;
    if (savings < 50) return ImpactLevel.LOW;
    if (savings < 200) return ImpactLevel.MEDIUM;
    if (savings < 500) return ImpactLevel.HIGH;
    return ImpactLevel.SIGNIFICANT;
  }

  private async calculateModelROI(model: AIModel, usage: UsageProjection): Promise<ModelROI> {
    // Calculate ROI based on model costs and benefits
    const totalCost = usage.projectedUsage.reduce((sum, proj) => sum + proj.estimatedCost, 0);
    const totalBenefit = totalCost * 1.2; // Placeholder: 20% benefit over cost
    const roi = (totalBenefit - totalCost) / totalCost;
    
    return {
      modelId: model.id,
      totalCost,
      totalBenefit,
      roi,
      paybackPeriod: totalCost / (totalBenefit / usage.timeHorizon)
    };
  }

  private generateROIReasoning(comparison: ROIComparison): string {
    if (comparison.roiDifference > 0.1) {
      return 'Model B shows significantly better ROI due to lower costs and comparable benefits';
    } else if (comparison.roiDifference < -0.1) {
      return 'Model A shows significantly better ROI due to higher benefits relative to costs';
    } else {
      return 'Both models show similar ROI; consider other factors like quality and reliability';
    }
  }

  private async getAlternativeModelsInCategory(category: ModelCategory): Promise<AIModel[]> {
    try {
      const snapshot = await this.firestore
        .collection('available_models')
        .where('category', '==', category)
        .where('isActive', '==', true)
        .get();
        
      return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as AIModel));
    } catch (error) {
      this.logger.error('Failed to get alternative models', { category, error });
      return [];
    }
  }

  private mapAdjustmentTypeToCostFactor(adjustmentType: AdjustmentType): CostFactorType {
    switch (adjustmentType) {
      case AdjustmentType.SURGE: return CostFactorType.SURGE_PRICING;
      case AdjustmentType.DISCOUNT: return CostFactorType.VOLUME_DISCOUNT;
      case AdjustmentType.TIER_BONUS: return CostFactorType.USER_TIER;
      case AdjustmentType.REGIONAL: return CostFactorType.REGIONAL_ADJUSTMENT;
      default: return CostFactorType.BASE_PRICING;
    }
  }

  private getPriorityImpact(priority: RequestPriority): number {
    switch (priority) {
      case RequestPriority.LOW: return -0.1;
      case RequestPriority.NORMAL: return 0;
      case RequestPriority.HIGH: return 0.2;
      case RequestPriority.URGENT: return 0.5;
      default: return 0;
    }
  }

  private mapThresholdTypeToAlertType(thresholdType: ThresholdType): AlertType {
    switch (thresholdType) {
      case ThresholdType.ABSOLUTE_COST: return AlertType.BUDGET_THRESHOLD;
      case ThresholdType.COST_INCREASE_RATE: return AlertType.COST_SPIKE;
      case ThresholdType.USAGE_ANOMALY: return AlertType.UNUSUAL_USAGE;
      default: return AlertType.BUDGET_THRESHOLD;
    }
  }
}