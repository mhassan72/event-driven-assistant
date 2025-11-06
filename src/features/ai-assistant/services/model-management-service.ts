/**
 * Model Management Service
 * Handles dynamic model discovery, registration, health monitoring, and performance analytics
 */

import { 
  AIModel, 
  ModelCategory, 
  ModelAnalytics, 
  ModelFeedback, 
  ModelPerformance,
  ModelPricing,
  ModelCapabilities,
  ModelMetadata
} from '@/shared/types';
import { IStructuredLogger } from '@/shared/observability/logger';
import { IMetricsCollector } from '@/shared/observability/metrics';
import * as admin from 'firebase-admin';

/**
 * Interface for Model Management Service
 */
export interface IModelManagementService {
  // Model Discovery and Registration
  discoverModels(): Promise<AIModel[]>;
  registerModel(model: AIModel): Promise<void>;
  updateModel(modelId: string, updates: Partial<AIModel>): Promise<void>;
  deactivateModel(modelId: string): Promise<void>;
  activateModel(modelId: string): Promise<void>;
  
  // Model Retrieval
  getAvailableModels(category?: ModelCategory): Promise<AIModel[]>;
  getModelById(modelId: string): Promise<AIModel | null>;
  getActiveModels(category?: ModelCategory): Promise<AIModel[]>;
  
  // Health Monitoring
  checkModelHealth(modelId: string): Promise<ModelHealthStatus>;
  checkAllModelsHealth(): Promise<ModelHealthReport>;
  updateModelAvailability(modelId: string, isAvailable: boolean): Promise<void>;
  
  // Performance Analytics
  getModelAnalytics(modelId: string, timeRange?: AnalyticsTimeRange): Promise<ModelAnalytics>;
  updateModelPerformance(modelId: string, performance: ModelPerformance): Promise<void>;
  recordModelUsage(modelId: string, usage: ModelUsageRecord): Promise<void>;
  
  // Versioning
  createModelVersion(modelId: string, version: ModelVersion): Promise<void>;
  getModelVersions(modelId: string): Promise<ModelVersion[]>;
  setActiveVersion(modelId: string, version: string): Promise<void>;
  
  // Feedback Integration
  recordModelFeedback(feedback: ModelFeedback): Promise<void>;
  getModelFeedbackSummary(modelId: string): Promise<ModelFeedbackSummary>;
}

/**
 * Supporting interfaces
 */
export interface ModelHealthStatus {
  modelId: string;
  isHealthy: boolean;
  isAvailable: boolean;
  lastChecked: Date;
  responseTime: number;
  errorRate: number;
  issues: HealthIssue[];
}

export interface ModelHealthReport {
  timestamp: Date;
  totalModels: number;
  healthyModels: number;
  unavailableModels: number;
  modelStatuses: ModelHealthStatus[];
  systemHealth: SystemHealthScore;
}

export interface HealthIssue {
  type: HealthIssueType;
  severity: IssueSeverity;
  description: string;
  detectedAt: Date;
  resolved: boolean;
}

export enum HealthIssueType {
  HIGH_LATENCY = 'high_latency',
  HIGH_ERROR_RATE = 'high_error_rate',
  UNAVAILABLE = 'unavailable',
  RATE_LIMITED = 'rate_limited',
  AUTHENTICATION_FAILED = 'authentication_failed',
  QUOTA_EXCEEDED = 'quota_exceeded'
}

export enum IssueSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface SystemHealthScore {
  overall: number; // 0-100
  availability: number;
  performance: number;
  reliability: number;
}

export interface AnalyticsTimeRange {
  startDate: Date;
  endDate: Date;
  granularity: 'hour' | 'day' | 'week' | 'month';
}

export interface ModelUsageRecord {
  userId: string;
  requestId: string;
  timestamp: Date;
  inputTokens: number;
  outputTokens: number;
  processingTime: number;
  creditsUsed: number;
  success: boolean;
  errorType?: string;
}

export interface ModelVersion {
  version: string;
  modelId: string;
  isActive: boolean;
  capabilities: ModelCapabilities;
  performance: ModelPerformance;
  pricing: ModelPricing;
  metadata: ModelMetadata;
  createdAt: Date;
  deprecatedAt?: Date;
}

export interface ModelFeedbackSummary {
  modelId: string;
  totalFeedback: number;
  averageRating: number;
  satisfactionScore: number;
  commonIssues: string[];
  improvements: string[];
  lastUpdated: Date;
}

/**
 * Model Management Service Implementation
 */
export class ModelManagementService implements IModelManagementService {
  private firestore: admin.firestore.Firestore;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    firestore: admin.firestore.Firestore,
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ) {
    this.firestore = firestore;
    this.logger = logger;
    this.metrics = metrics;
    
    // Start health monitoring
    this.startHealthMonitoring();
  }

  // ============================================================================
  // Model Discovery and Registration
  // ============================================================================

  async discoverModels(): Promise<AIModel[]> {
    try {
      this.logger.info('Starting model discovery process');
      
      // Discover models from various providers
      const discoveredModels: AIModel[] = [];
      
      // Nebius AI models
      const nebiusModels = await this.discoverNebiusModels();
      discoveredModels.push(...nebiusModels);
      
      // OpenAI models (if configured)
      const openaiModels = await this.discoverOpenAIModels();
      discoveredModels.push(...openaiModels);
      
      // Custom models from configuration
      const customModels = await this.discoverCustomModels();
      discoveredModels.push(...customModels);
      
      this.logger.info(`Discovered ${discoveredModels.length} models`);
      this.metrics.increment('model_discovery.total_discovered', discoveredModels.length);
      
      return discoveredModels;
    } catch (error) {
      this.logger.error('Model discovery failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      this.metrics.increment('model_discovery.errors');
      throw error;
    }
  }

  async registerModel(model: AIModel): Promise<void> {
    try {
      this.logger.info('Registering new model', { modelId: model.id });
      
      // Validate model configuration
      await this.validateModelConfiguration(model);
      
      // Store in Firestore
      await this.firestore.collection('available_models').doc(model.id).set({
        ...model,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Initialize analytics collection
      await this.initializeModelAnalytics(model.id);
      
      this.logger.info('Model registered successfully', { modelId: model.id });
      this.metrics.increment('model_management.models_registered');
      
    } catch (error) {
      this.logger.error('Model registration failed', { 
        modelId: model.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      this.metrics.increment('model_management.registration_errors');
      throw error;
    }
  }

  async updateModel(modelId: string, updates: Partial<AIModel>): Promise<void> {
    try {
      this.logger.info('Updating model', { modelId, updates });
      
      const updateData = {
        ...updates,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await this.firestore.collection('available_models').doc(modelId).update(updateData);
      
      this.logger.info('Model updated successfully', { modelId });
      this.metrics.increment('model_management.models_updated');
      
    } catch (error) {
      this.logger.error('Model update failed', { 
        modelId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      this.metrics.increment('model_management.update_errors');
      throw error;
    }
  }

  async deactivateModel(modelId: string): Promise<void> {
    await this.updateModel(modelId, { isActive: false });
    this.logger.info('Model deactivated', { modelId });
  }

  async activateModel(modelId: string): Promise<void> {
    await this.updateModel(modelId, { isActive: true });
    this.logger.info('Model activated', { modelId });
  }

  // ============================================================================
  // Model Retrieval
  // ============================================================================

  async getAvailableModels(category?: ModelCategory): Promise<AIModel[]> {
    try {
      let query = this.firestore.collection('available_models').where('isActive', '==', true);
      
      if (category) {
        query = query.where('category', '==', category);
      }
      
      const snapshot = await query.get();
      const models = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as AIModel));
      
      this.logger.debug('Retrieved available models', { count: models.length, category });
      return models;
      
    } catch (error) {
      this.logger.error('Failed to retrieve available models', { 
        category, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async getModelById(modelId: string): Promise<AIModel | null> {
    try {
      const doc = await this.firestore.collection('available_models').doc(modelId).get();
      
      if (!doc.exists) {
        return null;
      }
      
      return { id: doc.id, ...doc.data() } as AIModel;
      
    } catch (error) {
      this.logger.error('Failed to retrieve model by ID', { 
        modelId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async getActiveModels(category?: ModelCategory): Promise<AIModel[]> {
    return this.getAvailableModels(category);
  }

  // ============================================================================
  // Health Monitoring
  // ============================================================================

  async checkModelHealth(modelId: string): Promise<ModelHealthStatus> {
    try {
      const model = await this.getModelById(modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }

      const startTime = Date.now();
      let isHealthy = true;
      let isAvailable = true;
      let responseTime = 0;
      let errorRate = 0;
      const issues: HealthIssue[] = [];

      try {
        // Perform health check based on model provider
        const healthResult = await this.performProviderHealthCheck(model);
        responseTime = Date.now() - startTime;
        isHealthy = healthResult.isHealthy;
        isAvailable = healthResult.isAvailable;
        errorRate = healthResult.errorRate;
        issues.push(...healthResult.issues);
        
      } catch (error) {
        isHealthy = false;
        isAvailable = false;
        responseTime = Date.now() - startTime;
        issues.push({
          type: HealthIssueType.UNAVAILABLE,
          severity: IssueSeverity.HIGH,
          description: `Health check failed: ${error}`,
          detectedAt: new Date(),
          resolved: false
        });
      }

      const healthStatus: ModelHealthStatus = {
        modelId,
        isHealthy,
        isAvailable,
        lastChecked: new Date(),
        responseTime,
        errorRate,
        issues
      };

      // Store health status
      await this.storeHealthStatus(healthStatus);
      
      return healthStatus;
      
    } catch (error) {
      this.logger.error('Health check failed', { 
        modelId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async checkAllModelsHealth(): Promise<ModelHealthReport> {
    try {
      const models = await this.getAvailableModels();
      const healthChecks = await Promise.allSettled(
        models.map(model => this.checkModelHealth(model.id))
      );

      const modelStatuses: ModelHealthStatus[] = [];
      let healthyModels = 0;
      let unavailableModels = 0;

      healthChecks.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          modelStatuses.push(result.value);
          if (result.value.isHealthy) healthyModels++;
          if (!result.value.isAvailable) unavailableModels++;
        } else {
          // Create error status for failed health checks
          const model = models[index];
          const errorStatus: ModelHealthStatus = {
            modelId: model.id,
            isHealthy: false,
            isAvailable: false,
            lastChecked: new Date(),
            responseTime: 0,
            errorRate: 1,
            issues: [{
              type: HealthIssueType.UNAVAILABLE,
              severity: IssueSeverity.CRITICAL,
              description: `Health check failed: ${result.reason}`,
              detectedAt: new Date(),
              resolved: false
            }]
          };
          modelStatuses.push(errorStatus);
          unavailableModels++;
        }
      });

      const systemHealth: SystemHealthScore = {
        overall: Math.round((healthyModels / models.length) * 100),
        availability: Math.round(((models.length - unavailableModels) / models.length) * 100),
        performance: Math.round(modelStatuses.reduce((sum: any, status) => 
          sum + (status.responseTime < 2000 ? 100 : Math.max(0, 100 - (status.responseTime - 2000) / 100)), 0
        ) / modelStatuses.length),
        reliability: Math.round((healthyModels / models.length) * 100)
      };

      const report: ModelHealthReport = {
        timestamp: new Date(),
        totalModels: models.length,
        healthyModels,
        unavailableModels,
        modelStatuses,
        systemHealth
      };

      // Store health report
      await this.storeHealthReport(report);
      
      return report;
      
    } catch (error) {
      this.logger.error('Failed to check all models health', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async updateModelAvailability(modelId: string, isAvailable: boolean): Promise<void> {
    try {
      await this.firestore.collection('model_health').doc(modelId).update({
        isAvailable,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      
      this.logger.info('Model availability updated', { modelId, isAvailable });
      
    } catch (error) {
      this.logger.error('Failed to update model availability', { 
        modelId, 
        isAvailable, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  // ============================================================================
  // Performance Analytics
  // ============================================================================

  async getModelAnalytics(modelId: string, timeRange?: AnalyticsTimeRange): Promise<ModelAnalytics> {
    try {
      const defaultTimeRange: AnalyticsTimeRange = {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        endDate: new Date(),
        granularity: 'day' as any
      };
      
      const range = timeRange || defaultTimeRange;
      
      // Fetch analytics data from Firestore
      const analyticsDoc = await this.firestore
        .collection('model_analytics')
        .doc(modelId)
        .get();
        
      if (!analyticsDoc.exists) {
        throw new Error(`Analytics not found for model ${modelId}`);
      }
      
      const analyticsData = analyticsDoc.data() as ModelAnalytics;
      
      // Update with real-time data if needed
      await this.refreshAnalyticsData(modelId, range);
      
      return analyticsData;
      
    } catch (error) {
      this.logger.error('Failed to get model analytics', { 
        modelId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async updateModelPerformance(modelId: string, performance: ModelPerformance): Promise<void> {
    try {
      await this.firestore.collection('available_models').doc(modelId).update({
        performance,
        'metadata.lastUpdated': admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Also update in analytics
      await this.firestore.collection('model_analytics').doc(modelId).update({
        'performance': performance,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      
      this.logger.info('Model performance updated', { modelId });
      
    } catch (error) {
      this.logger.error('Failed to update model performance', { 
        modelId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async recordModelUsage(modelId: string, usage: ModelUsageRecord): Promise<void> {
    try {
      // Store individual usage record
      await this.firestore.collection('model_usage_records').add({
        modelId,
        ...usage,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Update aggregated analytics
      await this.updateUsageAnalytics(modelId, usage);
      
      this.metrics.increment('model_usage.recorded');
      
    } catch (error) {
      this.logger.error('Failed to record model usage', { 
        modelId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  // ============================================================================
  // Versioning
  // ============================================================================

  async createModelVersion(modelId: string, version: ModelVersion): Promise<void> {
    try {
      await this.firestore
        .collection('available_models')
        .doc(modelId)
        .collection('versions')
        .doc(version.version)
        .set({
          ...version,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
      this.logger.info('Model version created', { modelId, version: version.version });
      
    } catch (error) {
      this.logger.error('Failed to create model version', { 
        modelId, 
        version: version.version, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async getModelVersions(modelId: string): Promise<ModelVersion[]> {
    try {
      const snapshot = await this.firestore
        .collection('available_models')
        .doc(modelId)
        .collection('versions')
        .orderBy('createdAt', 'desc')
        .get();
        
      return snapshot.docs.map((doc: any) => ({ ...doc.data() } as ModelVersion));
      
    } catch (error) {
      this.logger.error('Failed to get model versions', { 
        modelId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async setActiveVersion(modelId: string, version: string): Promise<void> {
    try {
      const batch = this.firestore.batch();
      
      // Deactivate all versions
      const versionsSnapshot = await this.firestore
        .collection('available_models')
        .doc(modelId)
        .collection('versions')
        .get();
        
      versionsSnapshot.docs.forEach((doc: any) => {
        batch.update(doc.ref, { isActive: false });
      });
      
      // Activate the specified version
      const versionRef = this.firestore
        .collection('available_models')
        .doc(modelId)
        .collection('versions')
        .doc(version);
        
      batch.update(versionRef, { isActive: true });
      
      await batch.commit();
      
      this.logger.info('Active model version updated', { modelId, version });
      
    } catch (error) {
      this.logger.error('Failed to set active version', { 
        modelId, 
        version, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  // ============================================================================
  // Feedback Integration
  // ============================================================================

  async recordModelFeedback(feedback: ModelFeedback): Promise<void> {
    try {
      await this.firestore.collection('model_feedback').add({
        ...feedback,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Update feedback summary
      await this.updateFeedbackSummary(feedback.modelId, feedback);
      
      this.logger.info('Model feedback recorded', { modelId: feedback.modelId });
      
    } catch (error) {
      this.logger.error('Failed to record model feedback', { 
        modelId: feedback.modelId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async getModelFeedbackSummary(modelId: string): Promise<ModelFeedbackSummary> {
    try {
      const doc = await this.firestore
        .collection('model_feedback_summary')
        .doc(modelId)
        .get();
        
      if (!doc.exists) {
        // Return empty summary if none exists
        return {
          modelId,
          totalFeedback: 0,
          averageRating: 0,
          satisfactionScore: 0,
          commonIssues: [],
          improvements: [],
          lastUpdated: new Date()
        };
      }
      
      return doc.data() as ModelFeedbackSummary;
      
    } catch (error) {
      this.logger.error('Failed to get model feedback summary', { 
        modelId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async discoverNebiusModels(): Promise<AIModel[]> {
    // Implementation for discovering Nebius AI models
    // This would integrate with Nebius AI API to get available models
    return [];
  }

  private async discoverOpenAIModels(): Promise<AIModel[]> {
    // Implementation for discovering OpenAI models
    return [];
  }

  private async discoverCustomModels(): Promise<AIModel[]> {
    // Implementation for discovering custom models from configuration
    return [];
  }

  private async validateModelConfiguration(model: AIModel): Promise<void> {
    // Validate model configuration
    if (!model.id || !model.name || !model.category) {
      throw new Error('Invalid model configuration: missing required fields');
    }
  }

  private async initializeModelAnalytics(modelId: string): Promise<void> {
    const initialAnalytics: Partial<ModelAnalytics> = {
      modelId,
      timeRange: {
        startDate: new Date(),
        endDate: new Date(),
        granularity: 'day' as any,
        timezone: 'UTC'
      },
      usage: {
        totalRequests: 0,
        totalTokensProcessed: 0,
        totalCreditsConsumed: 0,
        uniqueUsers: 0,
        averageRequestSize: 0,
        medianRequestSize: 0,
        requestSizeDistribution: [],
        peakUsageHours: [],
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

    await this.firestore.collection('model_analytics').doc(modelId).set(initialAnalytics);
  }

  private async performProviderHealthCheck(model: AIModel): Promise<{
    isHealthy: boolean;
    isAvailable: boolean;
    errorRate: number;
    issues: HealthIssue[];
  }> {
    // Implementation would vary by provider
    // For now, return a basic health check
    return {
      isHealthy: true,
      isAvailable: true,
      errorRate: 0,
      issues: []
    };
  }

  private async storeHealthStatus(status: ModelHealthStatus): Promise<void> {
    await this.firestore.collection('model_health').doc(status.modelId).set({
      ...status,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  private async storeHealthReport(report: ModelHealthReport): Promise<void> {
    await this.firestore.collection('system_health_reports').add({
      ...report,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  private async refreshAnalyticsData(modelId: string, timeRange: AnalyticsTimeRange): Promise<void> {
    // Implementation to refresh analytics data from usage records
    // This would aggregate recent usage data and update analytics
  }

  private async updateUsageAnalytics(modelId: string, usage: ModelUsageRecord): Promise<void> {
    // Update aggregated usage statistics
    const analyticsRef = this.firestore.collection('model_analytics').doc(modelId);
    
    await this.firestore.runTransaction(async (transaction: any) => {
      const doc = await transaction.get(analyticsRef);
      
      if (doc.exists) {
        const data = doc.data() as ModelAnalytics;
        
        // Update usage statistics
        const updatedUsage = {
          ...data.usage,
          totalRequests: data.usage.totalRequests + 1,
          totalTokensProcessed: data.usage.totalTokensProcessed + usage.inputTokens + usage.outputTokens,
          totalCreditsConsumed: data.usage.totalCreditsConsumed + usage.creditsUsed
        };
        
        transaction.update(analyticsRef, {
          usage: updatedUsage,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    });
  }

  private async updateFeedbackSummary(modelId: string, feedback: ModelFeedback): Promise<void> {
    const summaryRef = this.firestore.collection('model_feedback_summary').doc(modelId);
    
    await this.firestore.runTransaction(async (transaction: any) => {
      const doc = await transaction.get(summaryRef);
      
      if (doc.exists) {
        const summary = doc.data() as ModelFeedbackSummary;
        
        const newTotalFeedback = summary.totalFeedback + 1;
        const newAverageRating = ((summary.averageRating * summary.totalFeedback) + feedback.rating) / newTotalFeedback;
        
        transaction.update(summaryRef, {
          totalFeedback: newTotalFeedback,
          averageRating: newAverageRating,
          satisfactionScore: newAverageRating * 10, // Convert to 0-100 scale
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        // Create new summary
        const newSummary: ModelFeedbackSummary = {
          modelId,
          totalFeedback: 1,
          averageRating: feedback.rating,
          satisfactionScore: feedback.rating * 10,
          commonIssues: [],
          improvements: [],
          lastUpdated: new Date()
        };
        
        transaction.set(summaryRef, newSummary);
      }
    });
  }

  private startHealthMonitoring(): void {
    // Start periodic health monitoring
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.checkAllModelsHealth();
      } catch (error) {
        this.logger.error('Periodic health check failed', { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  public stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}