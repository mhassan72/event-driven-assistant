/**
 * Dynamic Model Configuration Types
 * Advanced interfaces for model management, analytics, and user feedback
 */

import { TaskType, ModelSelectionCriteria } from './ai-assistant';

// ============================================================================
// Model Analytics and Performance Tracking
// ============================================================================

/**
 * Comprehensive model analytics with usage patterns
 */
export interface ModelAnalytics {
  modelId: string;
  timeRange: AnalyticsTimeRange;
  
  // Usage statistics
  usage: ModelUsageStats;
  
  // Performance metrics
  performance: ModelPerformanceMetrics;
  
  // User satisfaction
  satisfaction: ModelSatisfactionMetrics;
  
  // Cost analysis
  costAnalysis: ModelCostAnalysis;
  
  // Reliability metrics
  reliability: ModelReliabilityMetrics;
  
  // Comparative analysis
  benchmarks: ModelBenchmark[];
  
  // Trends and predictions
  trends: ModelTrend[];
  predictions: ModelPrediction[];
  
  // Last updated
  lastUpdated: Date;
  dataFreshness: DataFreshness;
}

/**
 * Model usage statistics
 */
export interface ModelUsageStats {
  totalRequests: number;
  totalTokensProcessed: number;
  totalCreditsConsumed: number;
  uniqueUsers: number;
  
  // Request patterns
  averageRequestSize: number;
  medianRequestSize: number;
  requestSizeDistribution: SizeDistribution[];
  
  // Temporal patterns
  peakUsageHours: number[];
  usageByDayOfWeek: DayUsage[];
  seasonalPatterns: SeasonalPattern[];
  
  // Feature usage
  featureUsage: FeatureUsageBreakdown[];
  taskTypeDistribution: TaskTypeUsage[];
  
  // Geographic distribution
  geographicUsage: GeographicUsage[];
}

/**
 * Enhanced model performance metrics
 */
export interface ModelPerformanceMetrics {
  // Latency metrics
  averageLatency: number;
  medianLatency: number;
  p95Latency: number;
  p99Latency: number;
  latencyDistribution: LatencyDistribution[];
  
  // Throughput metrics
  tokensPerSecond: number;
  requestsPerSecond: number;
  peakThroughput: number;
  
  // Quality metrics
  qualityScore: number;
  qualityTrend: QualityTrend[];
  qualityByTaskType: TaskTypeQuality[];
  
  // Reliability metrics
  successRate: number;
  errorRate: number;
  timeoutRate: number;
  retryRate: number;
  
  // Resource utilization
  cpuUtilization: number;
  memoryUtilization: number;
  gpuUtilization: number;
  
  // Comparative scores
  speedScore: number; // 1-10
  costScore: number; // 1-10
  reliabilityScore: number; // 1-10
  overallScore: number; // 1-10
}

/**
 * Model satisfaction metrics from user feedback
 */
export interface ModelSatisfactionMetrics {
  overallSatisfaction: number; // 1-10
  totalFeedbackCount: number;
  
  // Satisfaction breakdown
  satisfactionDistribution: SatisfactionDistribution[];
  satisfactionByTaskType: TaskTypeSatisfaction[];
  satisfactionTrends: SatisfactionTrend[];
  
  // Detailed feedback
  positiveAspects: FeedbackAspect[];
  negativeAspects: FeedbackAspect[];
  improvementSuggestions: ImprovementSuggestion[];
  
  // Net Promoter Score
  npsScore: number;
  promoters: number;
  passives: number;
  detractors: number;
}

/**
 * Model cost analysis
 */
export interface ModelCostAnalysis {
  // Cost metrics
  averageCostPerRequest: number;
  averageCostPerToken: number;
  totalCostToUsers: number;
  
  // Cost efficiency
  costEfficiencyScore: number;
  costPerQualityPoint: number;
  costTrends: CostTrend[];
  
  // Comparative analysis
  costVsCompetitors: CompetitorComparison[];
  costOptimizationOpportunities: OptimizationOpportunity[];
  
  // ROI metrics
  userRetentionImpact: number;
  revenueImpact: number;
  costBenefit: CostBenefitAnalysis;
}

/**
 * Model reliability metrics
 */
export interface ModelReliabilityMetrics {
  uptime: number; // percentage
  availability: number; // percentage
  mtbf: number; // mean time between failures (hours)
  mttr: number; // mean time to recovery (minutes)
  
  // Failure analysis
  failureRate: number;
  failureTypes: FailureTypeBreakdown[];
  failurePatterns: FailurePattern[];
  
  // Recovery metrics
  recoveryTime: RecoveryTimeMetrics;
  failoverSuccess: number;
  
  // Maintenance windows
  plannedDowntime: number;
  unplannedDowntime: number;
  maintenanceImpact: MaintenanceImpact[];
}

// ============================================================================
// Model Feedback and Rating System
// ============================================================================

/**
 * User feedback for model performance
 */
export interface ModelFeedback {
  id: string;
  userId: string;
  modelId: string;
  sessionId?: string;
  requestId?: string;
  
  // Feedback details
  rating: number; // 1-10
  feedbackType: FeedbackType;
  category: FeedbackCategory;
  
  // Detailed ratings
  qualityRating: number;
  speedRating: number;
  accuracyRating: number;
  usefulnessRating: number;
  
  // Textual feedback
  comment?: string;
  positiveAspects?: string[];
  negativeAspects?: string[];
  suggestions?: string[];
  
  // Context
  taskType: TaskType;
  promptLength: number;
  responseLength: number;
  processingTime: number;
  
  // Metadata
  timestamp: Date;
  deviceType?: string;
  userExperience?: UserExperienceLevel;
  
  // Verification
  verified: boolean;
  moderationStatus: ModerationStatus;
  
  // Follow-up
  followUpRequested: boolean;
  followUpCompleted: boolean;
}

export enum FeedbackType {
  RATING = 'rating',
  COMMENT = 'comment',
  BUG_REPORT = 'bug_report',
  FEATURE_REQUEST = 'feature_request',
  COMPARISON = 'comparison',
  SUGGESTION = 'suggestion'
}

export enum FeedbackCategory {
  QUALITY = 'quality',
  PERFORMANCE = 'performance',
  ACCURACY = 'accuracy',
  USABILITY = 'usability',
  COST = 'cost',
  RELIABILITY = 'reliability',
  FEATURES = 'features'
}

export enum UserExperienceLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert'
}

export enum ModerationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  FLAGGED = 'flagged'
}

/**
 * Model recommendation based on analytics and feedback
 */
export interface ModelRecommendation {
  userId: string;
  taskType: TaskType;
  recommendations: RecommendationItem[];
  generatedAt: Date;
  validUntil: Date;
  confidence: number;
  reasoning: RecommendationReasoning;
}

/**
 * Individual recommendation item
 */
export interface RecommendationItem {
  modelId: string;
  rank: number;
  score: number;
  reasons: RecommendationReason[];
  estimatedPerformance: EstimatedPerformance;
  costBenefit: RecommendationCostBenefit;
  
  // Personalization factors
  personalizedScore: number;
  userHistoryMatch: number;
  preferenceAlignment: number;
}

/**
 * Recommendation reasoning
 */
export interface RecommendationReasoning {
  primaryFactors: ReasoningFactor[];
  secondaryFactors: ReasoningFactor[];
  userSpecificFactors: ReasoningFactor[];
  contextualFactors: ReasoningFactor[];
}

/**
 * Individual reasoning factor
 */
export interface ReasoningFactor {
  factor: ReasoningFactorType;
  weight: number;
  impact: FactorImpact;
  description: string;
  evidence?: any;
}

export enum ReasoningFactorType {
  PERFORMANCE_HISTORY = 'performance_history',
  USER_PREFERENCE = 'user_preference',
  COST_EFFICIENCY = 'cost_efficiency',
  TASK_SUITABILITY = 'task_suitability',
  RELIABILITY = 'reliability',
  RECENT_IMPROVEMENTS = 'recent_improvements',
  PEER_FEEDBACK = 'peer_feedback',
  USAGE_PATTERNS = 'usage_patterns'
}

export enum FactorImpact {
  POSITIVE = 'positive',
  NEGATIVE = 'negative',
  NEUTRAL = 'neutral'
}

/**
 * Recommendation reason
 */
export interface RecommendationReason {
  type: ReasonType;
  description: string;
  confidence: number;
  supportingData?: any;
}

export enum ReasonType {
  BEST_PERFORMANCE = 'best_performance',
  COST_EFFECTIVE = 'cost_effective',
  USER_PREFERENCE = 'user_preference',
  TASK_OPTIMIZED = 'task_optimized',
  HIGHLY_RATED = 'highly_rated',
  RELIABLE = 'reliable',
  FAST_RESPONSE = 'fast_response',
  HIGH_QUALITY = 'high_quality'
}

/**
 * Estimated performance for recommendation
 */
export interface EstimatedPerformance {
  estimatedLatency: number;
  estimatedQuality: number;
  estimatedCost: number;
  estimatedSatisfaction: number;
  confidence: number;
  
  // Range estimates
  latencyRange: PerformanceRange;
  qualityRange: PerformanceRange;
  costRange: PerformanceRange;
}

/**
 * Performance range estimate
 */
export interface PerformanceRange {
  min: number;
  max: number;
  median: number;
  confidence: number;
}

/**
 * Cost-benefit analysis for recommendation
 */
export interface RecommendationCostBenefit {
  costScore: number;
  benefitScore: number;
  roi: number;
  paybackPeriod?: number;
  
  // Detailed breakdown
  costs: CostBreakdownItem[];
  benefits: BenefitItem[];
  
  // Comparison
  vsCurrentModel?: ComparisonMetric;
  vsAlternatives?: AlternativeComparison[];
}

// ============================================================================
// Advanced Model Selection and Optimization
// ============================================================================

/**
 * Advanced model selection criteria with ML optimization
 */
export interface AdvancedModelSelectionCriteria extends ModelSelectionCriteria {
  // Machine learning factors
  learningFromHistory: boolean;
  adaptToUserBehavior: boolean;
  optimizeForUserSatisfaction: boolean;
  
  // Advanced preferences
  preferenceWeights: PreferenceWeights;
  constraintPriorities: ConstraintPriority[];
  
  // Optimization goals
  optimizationGoals: OptimizationGoal[];
  tradeoffPreferences: TradeoffPreference[];
  
  // Context awareness
  contextualFactors: ContextualFactor[];
  situationalAdaptation: boolean;
  
  // Experimentation
  allowExperimentation: boolean;
  experimentationBudget: number;
  explorationRate: number;
}

/**
 * Preference weights for different factors
 */
export interface PreferenceWeights {
  speed: number;
  cost: number;
  quality: number;
  reliability: number;
  satisfaction: number;
  
  // Normalized weights (sum to 1.0)
  normalized: boolean;
  
  // Dynamic adjustment
  adaptiveWeights: boolean;
  learningRate: number;
}

/**
 * Constraint priority
 */
export interface ConstraintPriority {
  constraint: ConstraintType;
  priority: Priority;
  flexibility: number; // 0-1, how much the constraint can be relaxed
}

export enum ConstraintType {
  MAX_COST = 'max_cost',
  MAX_LATENCY = 'max_latency',
  MIN_QUALITY = 'min_quality',
  MIN_RELIABILITY = 'min_reliability',
  REQUIRED_FEATURES = 'required_features',
  EXCLUDED_MODELS = 'excluded_models'
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Optimization goal
 */
export interface OptimizationGoal {
  metric: OptimizationMetric;
  target: OptimizationTarget;
  weight: number;
  tolerance: number;
}

export enum OptimizationMetric {
  MINIMIZE_COST = 'minimize_cost',
  MINIMIZE_LATENCY = 'minimize_latency',
  MAXIMIZE_QUALITY = 'maximize_quality',
  MAXIMIZE_SATISFACTION = 'maximize_satisfaction',
  MAXIMIZE_RELIABILITY = 'maximize_reliability',
  OPTIMIZE_ROI = 'optimize_roi'
}

/**
 * Optimization target
 */
export interface OptimizationTarget {
  type: OptimizationTargetType;
  value?: number;
  percentile?: number;
  benchmark?: string;
}

export enum OptimizationTargetType {
  ABSOLUTE_VALUE = 'absolute_value',
  PERCENTILE = 'percentile',
  RELATIVE_TO_BENCHMARK = 'relative_to_benchmark',
  BEST_IN_CLASS = 'best_in_class'
}

/**
 * Tradeoff preference
 */
export interface TradeoffPreference {
  scenario: TradeoffScenario;
  preference: TradeoffChoice;
  strength: number; // 0-1
}

export enum TradeoffScenario {
  COST_VS_QUALITY = 'cost_vs_quality',
  SPEED_VS_QUALITY = 'speed_vs_quality',
  COST_VS_SPEED = 'cost_vs_speed',
  RELIABILITY_VS_COST = 'reliability_vs_cost',
  FEATURES_VS_SIMPLICITY = 'features_vs_simplicity'
}

export enum TradeoffChoice {
  FAVOR_FIRST = 'favor_first',
  FAVOR_SECOND = 'favor_second',
  BALANCED = 'balanced',
  CONTEXT_DEPENDENT = 'context_dependent'
}

/**
 * Contextual factor for model selection
 */
export interface ContextualFactor {
  factor: ContextualFactorType;
  value: any;
  weight: number;
  temporal: boolean; // whether this factor changes over time
}

export enum ContextualFactorType {
  TIME_OF_DAY = 'time_of_day',
  DAY_OF_WEEK = 'day_of_week',
  USER_WORKLOAD = 'user_workload',
  SYSTEM_LOAD = 'system_load',
  BUDGET_REMAINING = 'budget_remaining',
  DEADLINE_PRESSURE = 'deadline_pressure',
  TASK_COMPLEXITY = 'task_complexity',
  USER_MOOD = 'user_mood'
}

// ============================================================================
// Model Performance Benchmarking
// ============================================================================

/**
 * Model benchmark comparison
 */
export interface ModelBenchmark {
  benchmarkId: string;
  benchmarkName: string;
  benchmarkType: BenchmarkType;
  
  // Benchmark details
  testSuite: BenchmarkTestSuite;
  results: BenchmarkResult[];
  
  // Comparison
  ranking: number;
  percentileScore: number;
  
  // Metadata
  runDate: Date;
  version: string;
  environment: BenchmarkEnvironment;
}

export enum BenchmarkType {
  PERFORMANCE = 'performance',
  QUALITY = 'quality',
  COST_EFFICIENCY = 'cost_efficiency',
  RELIABILITY = 'reliability',
  COMPREHENSIVE = 'comprehensive'
}

/**
 * Benchmark test suite
 */
export interface BenchmarkTestSuite {
  id: string;
  name: string;
  version: string;
  description: string;
  
  // Test configuration
  tests: BenchmarkTest[];
  metrics: BenchmarkMetric[];
  
  // Execution details
  duration: number;
  iterations: number;
  concurrency: number;
}

/**
 * Individual benchmark test
 */
export interface BenchmarkTest {
  id: string;
  name: string;
  category: TestCategory;
  description: string;
  
  // Test parameters
  inputSize: number;
  complexity: TestComplexity;
  expectedOutput?: any;
  
  // Scoring
  weight: number;
  passingScore: number;
}

export enum TestCategory {
  LATENCY = 'latency',
  THROUGHPUT = 'throughput',
  ACCURACY = 'accuracy',
  CONSISTENCY = 'consistency',
  RESOURCE_USAGE = 'resource_usage',
  ERROR_HANDLING = 'error_handling'
}

export enum TestComplexity {
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex',
  EXTREME = 'extreme'
}

/**
 * Benchmark metric definition
 */
export interface BenchmarkMetric {
  id: string;
  name: string;
  unit: string;
  description: string;
  
  // Scoring
  higherIsBetter: boolean;
  weight: number;
  
  // Thresholds
  excellent: number;
  good: number;
  acceptable: number;
  poor: number;
}

/**
 * Benchmark result
 */
export interface BenchmarkResult {
  testId: string;
  metricId: string;
  
  // Results
  value: number;
  score: number;
  grade: BenchmarkGrade;
  
  // Statistical data
  mean: number;
  median: number;
  standardDeviation: number;
  
  // Performance data
  samples: number;
  outliers: number;
  confidence: number;
}

export enum BenchmarkGrade {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  ACCEPTABLE = 'acceptable',
  POOR = 'poor',
  FAILED = 'failed'
}

/**
 * Benchmark environment
 */
export interface BenchmarkEnvironment {
  platform: string;
  region: string;
  infrastructure: string;
  
  // Resource configuration
  cpu: string;
  memory: string;
  gpu?: string;
  
  // Network conditions
  bandwidth: string;
  latency: string;
  
  // Load conditions
  concurrentUsers: number;
  systemLoad: number;
}

// ============================================================================
// Supporting Analytics Types
// ============================================================================

/**
 * Analytics time range
 */
export interface AnalyticsTimeRange {
  startDate: Date;
  endDate: Date;
  granularity: AnalyticsGranularity;
  timezone: string;
}

export enum AnalyticsGranularity {
  MINUTE = 'minute',
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year'
}

/**
 * Data freshness indicator
 */
export interface DataFreshness {
  lastUpdated: Date;
  updateFrequency: UpdateFrequency;
  staleness: number; // minutes since last update
  isStale: boolean;
}

export enum UpdateFrequency {
  REAL_TIME = 'real_time',
  EVERY_MINUTE = 'every_minute',
  EVERY_5_MINUTES = 'every_5_minutes',
  EVERY_15_MINUTES = 'every_15_minutes',
  HOURLY = 'hourly',
  DAILY = 'daily'
}

/**
 * Size distribution
 */
export interface SizeDistribution {
  range: SizeRange;
  count: number;
  percentage: number;
}

/**
 * Size range
 */
export interface SizeRange {
  min: number;
  max: number;
  label: string;
}

/**
 * Day usage statistics
 */
export interface DayUsage {
  dayOfWeek: number; // 0-6, Sunday = 0
  requests: number;
  averageLatency: number;
  successRate: number;
}

/**
 * Seasonal pattern
 */
export interface SeasonalPattern {
  period: SeasonalPeriod;
  pattern: PatternType;
  strength: number;
  description: string;
}

export enum SeasonalPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly'
}

export enum PatternType {
  INCREASING = 'increasing',
  DECREASING = 'decreasing',
  CYCLICAL = 'cyclical',
  STABLE = 'stable',
  VOLATILE = 'volatile'
}

/**
 * Feature usage breakdown
 */
export interface FeatureUsageBreakdown {
  featureId: string;
  featureName: string;
  usageCount: number;
  usagePercentage: number;
  averageLatency: number;
  successRate: number;
}

/**
 * Task type usage
 */
export interface TaskTypeUsage {
  taskType: TaskType;
  count: number;
  percentage: number;
  averageLatency: number;
  averageCost: number;
  satisfactionScore: number;
}

/**
 * Geographic usage
 */
export interface GeographicUsage {
  country: string;
  region?: string;
  city?: string;
  
  // Usage metrics
  userCount: number;
  requestCount: number;
  averageLatency: number;
  
  // Performance by location
  performanceScore: number;
  satisfactionScore: number;
}

/**
 * Latency distribution
 */
export interface LatencyDistribution {
  range: LatencyRange;
  count: number;
  percentage: number;
}

/**
 * Latency range
 */
export interface LatencyRange {
  min: number; // milliseconds
  max: number; // milliseconds
  label: string;
}

/**
 * Quality trend over time
 */
export interface QualityTrend {
  timestamp: Date;
  qualityScore: number;
  sampleSize: number;
  confidence: number;
}

/**
 * Task type quality metrics
 */
export interface TaskTypeQuality {
  taskType: TaskType;
  qualityScore: number;
  sampleSize: number;
  improvement: number; // vs previous period
}

/**
 * Satisfaction distribution
 */
export interface SatisfactionDistribution {
  rating: number; // 1-10
  count: number;
  percentage: number;
}

/**
 * Task type satisfaction
 */
export interface TaskTypeSatisfaction {
  taskType: TaskType;
  averageRating: number;
  responseCount: number;
  trend: SatisfactionTrendDirection;
}

export enum SatisfactionTrendDirection {
  IMPROVING = 'improving',
  DECLINING = 'declining',
  STABLE = 'stable'
}

/**
 * Satisfaction trend
 */
export interface SatisfactionTrend {
  period: Date;
  averageRating: number;
  responseCount: number;
  change: number; // vs previous period
}

/**
 * Feedback aspect
 */
export interface FeedbackAspect {
  aspect: string;
  mentionCount: number;
  sentiment: SentimentScore;
  examples: string[];
}

/**
 * Sentiment score
 */
export interface SentimentScore {
  score: number; // -1 to 1
  confidence: number;
  label: SentimentLabel;
}

export enum SentimentLabel {
  VERY_NEGATIVE = 'very_negative',
  NEGATIVE = 'negative',
  NEUTRAL = 'neutral',
  POSITIVE = 'positive',
  VERY_POSITIVE = 'very_positive'
}

/**
 * Improvement suggestion
 */
export interface ImprovementSuggestion {
  suggestion: string;
  frequency: number;
  priority: SuggestionPriority;
  category: ImprovementCategory;
  estimatedImpact: ImpactLevel;
}

export enum SuggestionPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ImprovementCategory {
  PERFORMANCE = 'performance',
  ACCURACY = 'accuracy',
  USABILITY = 'usability',
  FEATURES = 'features',
  COST = 'cost',
  RELIABILITY = 'reliability'
}

export enum ImpactLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  VERY_HIGH = 'very_high'
}

/**
 * Cost trend over time
 */
export interface CostTrend {
  period: Date;
  averageCost: number;
  totalCost: number;
  change: number; // vs previous period
  efficiency: number; // cost per quality point
}

/**
 * Competitor comparison
 */
export interface CompetitorComparison {
  competitorId: string;
  competitorName: string;
  
  // Cost comparison
  costDifference: number; // percentage
  costAdvantage: boolean;
  
  // Performance comparison
  performanceComparison: PerformanceComparison;
  
  // Market position
  marketShare: number;
  userPreference: number;
}

/**
 * Performance comparison
 */
export interface PerformanceComparison {
  latency: ComparisonMetric;
  quality: ComparisonMetric;
  reliability: ComparisonMetric;
  features: ComparisonMetric;
  overall: ComparisonMetric;
}

/**
 * Comparison metric
 */
export interface ComparisonMetric {
  ourScore: number;
  competitorScore: number;
  difference: number;
  advantage: boolean;
  significance: SignificanceLevel;
}

export enum SignificanceLevel {
  NEGLIGIBLE = 'negligible',
  MINOR = 'minor',
  MODERATE = 'moderate',
  MAJOR = 'major',
  CRITICAL = 'critical'
}

/**
 * Optimization opportunity
 */
export interface OptimizationOpportunity {
  id: string;
  type: OptimizationType;
  description: string;
  
  // Impact assessment
  potentialSavings: number;
  implementationCost: number;
  roi: number;
  paybackPeriod: number;
  
  // Implementation details
  difficulty: ImplementationDifficulty;
  timeToImplement: number; // days
  risks: OptimizationRisk[];
  
  // Priority
  priority: OptimizationPriority;
  urgency: OptimizationUrgency;
}

export enum OptimizationType {
  COST_REDUCTION = 'cost_reduction',
  PERFORMANCE_IMPROVEMENT = 'performance_improvement',
  EFFICIENCY_GAIN = 'efficiency_gain',
  QUALITY_ENHANCEMENT = 'quality_enhancement',
  RELIABILITY_IMPROVEMENT = 'reliability_improvement'
}

export enum ImplementationDifficulty {
  TRIVIAL = 'trivial',
  EASY = 'easy',
  MODERATE = 'moderate',
  HARD = 'hard',
  VERY_HARD = 'very_hard'
}

/**
 * Optimization risk
 */
export interface OptimizationRisk {
  type: RiskType;
  probability: number; // 0-1
  impact: ImpactLevel;
  mitigation: string;
}

export enum RiskType {
  PERFORMANCE_DEGRADATION = 'performance_degradation',
  RELIABILITY_IMPACT = 'reliability_impact',
  USER_EXPERIENCE_IMPACT = 'user_experience_impact',
  IMPLEMENTATION_COMPLEXITY = 'implementation_complexity',
  MAINTENANCE_BURDEN = 'maintenance_burden'
}

export enum OptimizationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum OptimizationUrgency {
  CAN_WAIT = 'can_wait',
  SHOULD_DO_SOON = 'should_do_soon',
  URGENT = 'urgent',
  IMMEDIATE = 'immediate'
}

/**
 * Cost-benefit analysis
 */
export interface CostBenefitAnalysis {
  totalCosts: number;
  totalBenefits: number;
  netBenefit: number;
  roi: number;
  paybackPeriod: number;
  
  // Detailed breakdown
  costBreakdown: CostBreakdownItem[];
  benefitBreakdown: BenefitItem[];
  
  // Risk assessment
  riskAdjustedROI: number;
  confidenceLevel: number;
  
  // Sensitivity analysis
  bestCase: CostBenefitScenario;
  worstCase: CostBenefitScenario;
  mostLikely: CostBenefitScenario;
}

/**
 * Cost breakdown item
 */
export interface CostBreakdownItem {
  category: CostCategory;
  amount: number;
  description: string;
  recurring: boolean;
  frequency?: CostFrequency;
}

export enum CostCategory {
  INFRASTRUCTURE = 'infrastructure',
  DEVELOPMENT = 'development',
  MAINTENANCE = 'maintenance',
  SUPPORT = 'support',
  TRAINING = 'training',
  OPPORTUNITY_COST = 'opportunity_cost'
}

export enum CostFrequency {
  ONE_TIME = 'one_time',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUALLY = 'annually'
}

/**
 * Benefit item
 */
export interface BenefitItem {
  category: BenefitCategory;
  amount: number;
  description: string;
  quantifiable: boolean;
  confidence: number;
}

export enum BenefitCategory {
  COST_SAVINGS = 'cost_savings',
  REVENUE_INCREASE = 'revenue_increase',
  EFFICIENCY_GAIN = 'efficiency_gain',
  QUALITY_IMPROVEMENT = 'quality_improvement',
  RISK_REDUCTION = 'risk_reduction',
  STRATEGIC_VALUE = 'strategic_value'
}

/**
 * Cost-benefit scenario
 */
export interface CostBenefitScenario {
  name: string;
  probability: number;
  totalCosts: number;
  totalBenefits: number;
  netBenefit: number;
  roi: number;
}

/**
 * Model trend analysis
 */
export interface ModelTrend {
  metric: TrendMetric;
  direction: TrendDirection;
  strength: TrendStrength;
  duration: number; // days
  significance: SignificanceLevel;
  
  // Statistical data
  slope: number;
  correlation: number;
  pValue: number;
  
  // Projections
  shortTermProjection: TrendProjection;
  longTermProjection: TrendProjection;
}

export enum TrendMetric {
  USAGE = 'usage',
  PERFORMANCE = 'performance',
  SATISFACTION = 'satisfaction',
  COST = 'cost',
  RELIABILITY = 'reliability',
  MARKET_SHARE = 'market_share'
}

export enum TrendDirection {
  INCREASING = 'increasing',
  DECREASING = 'decreasing',
  STABLE = 'stable',
  VOLATILE = 'volatile',
  CYCLICAL = 'cyclical'
}

export enum TrendStrength {
  WEAK = 'weak',
  MODERATE = 'moderate',
  STRONG = 'strong',
  VERY_STRONG = 'very_strong'
}

/**
 * Trend projection
 */
export interface TrendProjection {
  timeHorizon: number; // days
  projectedValue: number;
  confidenceInterval: ConfidenceInterval;
  assumptions: string[];
  risks: ProjectionRisk[];
}

/**
 * Confidence interval
 */
export interface ConfidenceInterval {
  lower: number;
  upper: number;
  confidence: number; // 0-1
}

/**
 * Projection risk
 */
export interface ProjectionRisk {
  factor: string;
  impact: ImpactLevel;
  probability: number;
  mitigation?: string;
}

/**
 * Model prediction
 */
export interface ModelPrediction {
  type: PredictionType;
  timeHorizon: number; // days
  prediction: any;
  confidence: number;
  
  // Model details
  algorithm: PredictionAlgorithm;
  features: PredictionFeature[];
  accuracy: ModelAccuracy;
  
  // Validation
  backtestResults: BacktestResult[];
  crossValidationScore: number;
}

export enum PredictionType {
  USAGE_FORECAST = 'usage_forecast',
  PERFORMANCE_PREDICTION = 'performance_prediction',
  COST_PROJECTION = 'cost_projection',
  SATISFACTION_FORECAST = 'satisfaction_forecast',
  FAILURE_PREDICTION = 'failure_prediction',
  DEMAND_FORECAST = 'demand_forecast'
}

export enum PredictionAlgorithm {
  LINEAR_REGRESSION = 'linear_regression',
  RANDOM_FOREST = 'random_forest',
  NEURAL_NETWORK = 'neural_network',
  TIME_SERIES = 'time_series',
  ENSEMBLE = 'ensemble'
}

/**
 * Prediction feature
 */
export interface PredictionFeature {
  name: string;
  importance: number;
  type: FeatureType;
  description: string;
}

export enum FeatureType {
  NUMERICAL = 'numerical',
  CATEGORICAL = 'categorical',
  TEMPORAL = 'temporal',
  DERIVED = 'derived'
}

/**
 * Model accuracy metrics
 */
export interface ModelAccuracy {
  mae: number; // Mean Absolute Error
  mse: number; // Mean Squared Error
  rmse: number; // Root Mean Squared Error
  mape: number; // Mean Absolute Percentage Error
  r2Score: number; // R-squared
}

/**
 * Backtest result
 */
export interface BacktestResult {
  period: Date;
  predicted: number;
  actual: number;
  error: number;
  percentageError: number;
}

// ============================================================================
// Failure Analysis Types
// ============================================================================

/**
 * Failure type breakdown
 */
export interface FailureTypeBreakdown {
  type: FailureType;
  count: number;
  percentage: number;
  averageRecoveryTime: number;
  impact: FailureImpact;
}

export enum FailureType {
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  SERVER_ERROR = 'server_error',
  NETWORK_ERROR = 'network_error',
  AUTHENTICATION_ERROR = 'authentication_error',
  VALIDATION_ERROR = 'validation_error',
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
  DEPENDENCY_FAILURE = 'dependency_failure'
}

export enum FailureImpact {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Failure pattern analysis
 */
export interface FailurePattern {
  pattern: PatternDescription;
  frequency: number;
  conditions: FailureCondition[];
  rootCause?: string;
  prevention?: string;
}

/**
 * Pattern description
 */
export interface PatternDescription {
  name: string;
  description: string;
  confidence: number;
  examples: FailureExample[];
}

/**
 * Failure condition
 */
export interface FailureCondition {
  factor: ConditionFactor;
  operator: ConditionOperator;
  value: any;
  correlation: number;
}

export enum ConditionFactor {
  TIME_OF_DAY = 'time_of_day',
  LOAD_LEVEL = 'load_level',
  REQUEST_SIZE = 'request_size',
  USER_TYPE = 'user_type',
  GEOGRAPHIC_REGION = 'geographic_region',
  MODEL_VERSION = 'model_version'
}

export enum ConditionOperator {
  EQUALS = 'equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  BETWEEN = 'between',
  IN = 'in',
  CONTAINS = 'contains'
}

/**
 * Failure example
 */
export interface FailureExample {
  timestamp: Date;
  description: string;
  context: FailureContext;
  resolution?: string;
}

/**
 * Failure context
 */
export interface FailureContext {
  userId?: string;
  requestId: string;
  modelId: string;
  requestSize: number;
  systemLoad: number;
  errorCode: string;
  errorMessage: string;
}

/**
 * Recovery time metrics
 */
export interface RecoveryTimeMetrics {
  average: number;
  median: number;
  p95: number;
  p99: number;
  
  // By failure type
  byFailureType: FailureTypeRecovery[];
  
  // Trends
  trend: RecoveryTimeTrend;
  improvement: number; // vs previous period
}

/**
 * Failure type recovery time
 */
export interface FailureTypeRecovery {
  failureType: FailureType;
  averageRecoveryTime: number;
  medianRecoveryTime: number;
  sampleSize: number;
}

/**
 * Recovery time trend
 */
export interface RecoveryTimeTrend {
  direction: TrendDirection;
  rate: number; // change per day
  significance: SignificanceLevel;
}

/**
 * Maintenance impact
 */
export interface MaintenanceImpact {
  maintenanceType: MaintenanceType;
  duration: number;
  affectedUsers: number;
  performanceImpact: number; // percentage degradation
  
  // Scheduling
  scheduledTime: Date;
  actualTime: Date;
  variance: number;
  
  // Communication
  advanceNotice: number; // hours
  userSatisfaction: number;
}

export enum MaintenanceType {
  ROUTINE = 'routine',
  EMERGENCY = 'emergency',
  UPGRADE = 'upgrade',
  SECURITY_PATCH = 'security_patch',
  PERFORMANCE_OPTIMIZATION = 'performance_optimization'
}

/**
 * Alternative comparison for recommendations
 */
export interface AlternativeComparison {
  modelId: string;
  modelName: string;
  
  // Performance comparison
  performanceDelta: PerformanceDelta;
  
  // Cost comparison
  costDelta: CostDelta;
  
  // Overall recommendation
  recommendation: AlternativeRecommendation;
  confidence: number;
}

/**
 * Performance delta
 */
export interface PerformanceDelta {
  latency: number; // percentage change
  quality: number; // percentage change
  reliability: number; // percentage change
  satisfaction: number; // percentage change
}

/**
 * Cost delta
 */
export interface CostDelta {
  absolute: number;
  percentage: number;
  annualImpact: number;
}

/**
 * Alternative recommendation
 */
export interface AlternativeRecommendation {
  action: RecommendationAction;
  reasoning: string;
  conditions?: string[];
  timeline?: string;
}

export enum RecommendationAction {
  SWITCH_IMMEDIATELY = 'switch_immediately',
  SWITCH_WHEN_CONVENIENT = 'switch_when_convenient',
  PILOT_TEST = 'pilot_test',
  MONITOR_AND_REASSESS = 'monitor_and_reassess',
  STAY_WITH_CURRENT = 'stay_with_current'
}