/**
 * Graceful Degradation System
 * Provides service degradation strategies to maintain core functionality during outages
 */

import { IStructuredLogger } from '../observability/logger';
import { IMetricsCollector } from '../observability/metrics';

/**
 * Service degradation levels
 */
export enum DegradationLevel {
  NONE = 0,           // Full functionality
  MINIMAL = 1,        // Minor features disabled
  MODERATE = 2,       // Non-essential features disabled
  SIGNIFICANT = 3,    // Only core features available
  CRITICAL = 4,       // Emergency mode, minimal functionality
  EMERGENCY = 5       // Absolute minimum to prevent total failure
}

/**
 * Feature priority levels
 */
export enum FeaturePriority {
  CRITICAL = 1,       // Must always work
  HIGH = 2,           // Important for user experience
  MEDIUM = 3,         // Nice to have
  LOW = 4,            // Optional features
  EXPERIMENTAL = 5    // Can be disabled first
}

/**
 * Degradation strategy
 */
export enum DegradationStrategy {
  DISABLE_FEATURE = 'disable_feature',
  REDUCE_QUALITY = 'reduce_quality',
  CACHE_FALLBACK = 'cache_fallback',
  SIMPLIFIED_RESPONSE = 'simplified_response',
  QUEUE_REQUESTS = 'queue_requests',
  RATE_LIMIT = 'rate_limit',
  TIMEOUT_REDUCTION = 'timeout_reduction'
}

/**
 * Feature configuration
 */
export interface FeatureConfig {
  name: string;
  description: string;
  priority: FeaturePriority;
  
  // Degradation settings
  canDegrade: boolean;
  degradationStrategies: DegradationStrategy[];
  fallbackBehavior?: string;
  
  // Dependencies
  dependencies: string[];
  requiredServices: string[];
  
  // Resource requirements
  resourceRequirements: {
    cpu: number;
    memory: number;
    network: number;
    storage: number;
  };
  
  // Monitoring
  healthCheckFunction?: string;
  performanceThresholds: {
    responseTime: number;
    errorRate: number;
    throughput: number;
  };
  
  // Metadata
  enabled: boolean;
  metadata: Record<string, any>;
}

/**
 * Degradation rule
 */
export interface DegradationRule {
  id: string;
  name: string;
  description: string;
  
  // Trigger conditions
  triggers: DegradationTrigger[];
  
  // Actions to take
  actions: DegradationAction[];
  
  // Rule settings
  priority: number;
  enabled: boolean;
  autoRevert: boolean;
  revertDelay: number;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

/**
 * Degradation trigger
 */
export interface DegradationTrigger {
  type: 'service_health' | 'resource_usage' | 'error_rate' | 'response_time' | 'custom';
  condition: string;
  threshold: number;
  duration: number; // How long condition must persist
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
}

/**
 * Degradation action
 */
export interface DegradationAction {
  type: DegradationStrategy;
  target: string; // Feature name or service
  parameters: Record<string, any>;
  rollbackParameters?: Record<string, any>;
}

/**
 * Degradation state
 */
export interface DegradationState {
  currentLevel: DegradationLevel;
  activeRules: string[];
  disabledFeatures: string[];
  degradedFeatures: Map<string, DegradationStrategy[]>;
  lastChanged: Date;
  reason: string;
}

/**
 * Feature status
 */
export interface FeatureStatus {
  name: string;
  enabled: boolean;
  degraded: boolean;
  degradationStrategies: DegradationStrategy[];
  lastHealthCheck?: Date;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  performanceMetrics: {
    responseTime: number;
    errorRate: number;
    throughput: number;
  };
}

/**
 * Graceful Degradation Manager
 */
export class GracefulDegradationManager {
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  
  // Configuration
  private features: Map<string, FeatureConfig> = new Map();
  private degradationRules: Map<string, DegradationRule> = new Map();
  
  // State management
  private currentState: DegradationState;
  private featureStatuses: Map<string, FeatureStatus> = new Map();
  
  // Monitoring
  private monitoringTimers: Map<string, NodeJS.Timeout> = new Map();
  private healthCheckFunctions: Map<string, Function> = new Map();
  
  // Event tracking
  private degradationHistory: Array<{
    timestamp: Date;
    level: DegradationLevel;
    reason: string;
    triggeredRules: string[];
  }> = [];
  
  constructor(dependencies: {
    logger: IStructuredLogger;
    metrics: IMetricsCollector;
  }) {
    this.logger = dependencies.logger;
    this.metrics = dependencies.metrics;
    
    // Initialize with no degradation
    this.currentState = {
      currentLevel: DegradationLevel.NONE,
      activeRules: [],
      disabledFeatures: [],
      degradedFeatures: new Map(),
      lastChanged: new Date(),
      reason: 'Initial state'
    };
    
    this.initializeDegradationManager();
  }
  
  /**
   * Initialize degradation manager
   */
  private async initializeDegradationManager(): Promise<void> {
    this.logger.info('Initializing Graceful Degradation Manager');
    
    // Register built-in health check functions
    this.registerBuiltInHealthChecks();
    
    // Start monitoring
    this.startMonitoring();
    
    // Setup periodic cleanup
    setInterval(() => {
      this.cleanupHistory();
    }, 60 * 60 * 1000); // Every hour
  }
  
  /**
   * Register feature for degradation management
   */
  registerFeature(config: FeatureConfig): void {
    try {
      this.features.set(config.name, config);
      
      // Initialize feature status
      const featureStatus: FeatureStatus = {
        name: config.name,
        enabled: config.enabled,
        degraded: false,
        degradationStrategies: [],
        healthStatus: 'healthy',
        performanceMetrics: {
          responseTime: 0,
          errorRate: 0,
          throughput: 0
        }
      };
      
      this.featureStatuses.set(config.name, featureStatus);
      
      // Start health monitoring if function is provided
      if (config.healthCheckFunction) {
        this.startFeatureHealthCheck(config.name);
      }
      
      this.logger.info('Feature registered for degradation management', {
        featureName: config.name,
        priority: config.priority,
        canDegrade: config.canDegrade
      });
      
      this.metrics.counter('graceful_degradation.features_registered', 1, {
        feature_name: config.name,
        priority: config.priority.toString()
      });
      
    } catch (error) {
      this.logger.error('Failed to register feature', {
        featureName: config.name,
        error: error.message
      });
    }
  }
  
  /**
   * Register degradation rule
   */
  registerDegradationRule(rule: Omit<DegradationRule, 'id' | 'createdAt' | 'updatedAt'>): string {
    const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const degradationRule: DegradationRule = {
      id: ruleId,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...rule
    };
    
    this.degradationRules.set(ruleId, degradationRule);
    
    this.logger.info('Degradation rule registered', {
      ruleId,
      ruleName: rule.name,
      enabled: rule.enabled,
      triggers: rule.triggers.length,
      actions: rule.actions.length
    });
    
    return ruleId;
  }
  
  /**
   * Evaluate degradation rules
   */
  async evaluateDegradationRules(): Promise<void> {
    try {
      const triggeredRules: string[] = [];
      const actionsToExecute: Array<{ rule: DegradationRule; action: DegradationAction }> = [];
      
      // Evaluate each rule
      for (const rule of this.degradationRules.values()) {
        if (!rule.enabled) {
          continue;
        }
        
        const shouldTrigger = await this.evaluateRuleTriggers(rule);
        
        if (shouldTrigger) {
          triggeredRules.push(rule.id);
          
          // Add actions to execute
          for (const action of rule.actions) {
            actionsToExecute.push({ rule, action });
          }
        }
      }
      
      // Execute actions if any rules were triggered
      if (actionsToExecute.length > 0) {
        await this.executeDegradationActions(actionsToExecute, triggeredRules);
      }
      
      // Check if we should revert any degradations
      await this.evaluateRevertConditions();
      
    } catch (error) {
      this.logger.error('Failed to evaluate degradation rules', {
        error: error.message
      });
    }
  }
  
  /**
   * Evaluate rule triggers
   */
  private async evaluateRuleTriggers(rule: DegradationRule): Promise<boolean> {
    try {
      for (const trigger of rule.triggers) {
        const conditionMet = await this.evaluateTriggerCondition(trigger);
        
        if (!conditionMet) {
          return false; // All triggers must be met
        }
      }
      
      return rule.triggers.length > 0; // At least one trigger must exist
      
    } catch (error) {
      this.logger.error('Failed to evaluate rule triggers', {
        ruleId: rule.id,
        error: error.message
      });
      
      return false;
    }
  }
  
  /**
   * Evaluate individual trigger condition
   */
  private async evaluateTriggerCondition(trigger: DegradationTrigger): Promise<boolean> {
    let currentValue: number;
    
    switch (trigger.type) {
      case 'service_health':
        currentValue = await this.getServiceHealthValue(trigger.condition);
        break;
      case 'resource_usage':
        currentValue = await this.getResourceUsageValue(trigger.condition);
        break;
      case 'error_rate':
        currentValue = await this.getErrorRateValue(trigger.condition);
        break;
      case 'response_time':
        currentValue = await this.getResponseTimeValue(trigger.condition);
        break;
      case 'custom':
        currentValue = await this.getCustomMetricValue(trigger.condition);
        break;
      default:
        return false;
    }
    
    // Evaluate condition
    switch (trigger.operator) {
      case 'gt':
        return currentValue > trigger.threshold;
      case 'gte':
        return currentValue >= trigger.threshold;
      case 'lt':
        return currentValue < trigger.threshold;
      case 'lte':
        return currentValue <= trigger.threshold;
      case 'eq':
        return currentValue === trigger.threshold;
      default:
        return false;
    }
  }
  
  /**
   * Execute degradation actions
   */
  private async executeDegradationActions(
    actionsToExecute: Array<{ rule: DegradationRule; action: DegradationAction }>,
    triggeredRules: string[]
  ): Promise<void> {
    try {
      this.logger.warn('Executing degradation actions', {
        actionCount: actionsToExecute.length,
        triggeredRules
      });
      
      // Sort actions by rule priority
      actionsToExecute.sort((a, b) => b.rule.priority - a.rule.priority);
      
      let newDegradationLevel = this.currentState.currentLevel;
      const newDisabledFeatures = [...this.currentState.disabledFeatures];
      const newDegradedFeatures = new Map(this.currentState.degradedFeatures);
      
      // Execute each action
      for (const { rule, action } of actionsToExecute) {
        await this.executeDegradationAction(action, newDisabledFeatures, newDegradedFeatures);
        
        // Update degradation level based on action severity
        const actionLevel = this.getActionDegradationLevel(action);
        if (actionLevel > newDegradationLevel) {
          newDegradationLevel = actionLevel;
        }
      }
      
      // Update state
      this.updateDegradationState(
        newDegradationLevel,
        triggeredRules,
        newDisabledFeatures,
        newDegradedFeatures,
        `Rules triggered: ${triggeredRules.join(', ')}`
      );
      
    } catch (error) {
      this.logger.error('Failed to execute degradation actions', {
        error: error.message
      });
    }
  }
  
  /**
   * Execute individual degradation action
   */
  private async executeDegradationAction(
    action: DegradationAction,
    disabledFeatures: string[],
    degradedFeatures: Map<string, DegradationStrategy[]>
  ): Promise<void> {
    const feature = this.features.get(action.target);
    if (!feature) {
      this.logger.warn('Cannot degrade unknown feature', {
        featureName: action.target,
        actionType: action.type
      });
      return;
    }
    
    switch (action.type) {
      case DegradationStrategy.DISABLE_FEATURE:
        if (!disabledFeatures.includes(action.target)) {
          disabledFeatures.push(action.target);
          await this.disableFeature(action.target);
        }
        break;
        
      case DegradationStrategy.REDUCE_QUALITY:
        await this.reduceFeatureQuality(action.target, action.parameters);
        this.addDegradationStrategy(degradedFeatures, action.target, action.type);
        break;
        
      case DegradationStrategy.CACHE_FALLBACK:
        await this.enableCacheFallback(action.target, action.parameters);
        this.addDegradationStrategy(degradedFeatures, action.target, action.type);
        break;
        
      case DegradationStrategy.SIMPLIFIED_RESPONSE:
        await this.enableSimplifiedResponse(action.target, action.parameters);
        this.addDegradationStrategy(degradedFeatures, action.target, action.type);
        break;
        
      case DegradationStrategy.QUEUE_REQUESTS:
        await this.enableRequestQueuing(action.target, action.parameters);
        this.addDegradationStrategy(degradedFeatures, action.target, action.type);
        break;
        
      case DegradationStrategy.RATE_LIMIT:
        await this.enableRateLimiting(action.target, action.parameters);
        this.addDegradationStrategy(degradedFeatures, action.target, action.type);
        break;
        
      case DegradationStrategy.TIMEOUT_REDUCTION:
        await this.reduceTimeouts(action.target, action.parameters);
        this.addDegradationStrategy(degradedFeatures, action.target, action.type);
        break;
    }
    
    this.logger.info('Degradation action executed', {
      featureName: action.target,
      actionType: action.type,
      parameters: action.parameters
    });
    
    this.metrics.counter('graceful_degradation.actions_executed', 1, {
      feature_name: action.target,
      action_type: action.type
    });
  }
  
  /**
   * Add degradation strategy to feature
   */
  private addDegradationStrategy(
    degradedFeatures: Map<string, DegradationStrategy[]>,
    featureName: string,
    strategy: DegradationStrategy
  ): void {
    const existing = degradedFeatures.get(featureName) || [];
    if (!existing.includes(strategy)) {
      existing.push(strategy);
      degradedFeatures.set(featureName, existing);
    }
  }
  
  /**
   * Disable feature completely
   */
  private async disableFeature(featureName: string): Promise<void> {
    const featureStatus = this.featureStatuses.get(featureName);
    if (featureStatus) {
      featureStatus.enabled = false;
      featureStatus.degraded = true;
    }
    
    // TODO: Implement actual feature disabling logic
    // This would integrate with your application's feature flag system
    
    this.logger.warn('Feature disabled due to degradation', { featureName });
  }
  
  /**
   * Reduce feature quality
   */
  private async reduceFeatureQuality(featureName: string, parameters: Record<string, any>): Promise<void> {
    // TODO: Implement quality reduction logic
    // Examples: Lower image quality, reduce AI model complexity, etc.
    
    this.logger.info('Feature quality reduced', { featureName, parameters });
  }
  
  /**
   * Enable cache fallback
   */
  private async enableCacheFallback(featureName: string, parameters: Record<string, any>): Promise<void> {
    // TODO: Implement cache fallback logic
    // Use cached responses when primary service is unavailable
    
    this.logger.info('Cache fallback enabled', { featureName, parameters });
  }
  
  /**
   * Enable simplified response
   */
  private async enableSimplifiedResponse(featureName: string, parameters: Record<string, any>): Promise<void> {
    // TODO: Implement simplified response logic
    // Return basic responses instead of full-featured ones
    
    this.logger.info('Simplified response enabled', { featureName, parameters });
  }
  
  /**
   * Enable request queuing
   */
  private async enableRequestQueuing(featureName: string, parameters: Record<string, any>): Promise<void> {
    // TODO: Implement request queuing logic
    // Queue requests instead of processing immediately
    
    this.logger.info('Request queuing enabled', { featureName, parameters });
  }
  
  /**
   * Enable rate limiting
   */
  private async enableRateLimiting(featureName: string, parameters: Record<string, any>): Promise<void> {
    // TODO: Implement rate limiting logic
    // Reduce the rate of requests to the feature
    
    this.logger.info('Rate limiting enabled', { featureName, parameters });
  }
  
  /**
   * Reduce timeouts
   */
  private async reduceTimeouts(featureName: string, parameters: Record<string, any>): Promise<void> {
    // TODO: Implement timeout reduction logic
    // Reduce timeouts to fail faster
    
    this.logger.info('Timeouts reduced', { featureName, parameters });
  }
  
  /**
   * Get degradation level for action
   */
  private getActionDegradationLevel(action: DegradationAction): DegradationLevel {
    const feature = this.features.get(action.target);
    if (!feature) {
      return DegradationLevel.NONE;
    }
    
    // Map feature priority and action type to degradation level
    switch (feature.priority) {
      case FeaturePriority.CRITICAL:
        return action.type === DegradationStrategy.DISABLE_FEATURE 
          ? DegradationLevel.EMERGENCY 
          : DegradationLevel.CRITICAL;
      case FeaturePriority.HIGH:
        return action.type === DegradationStrategy.DISABLE_FEATURE 
          ? DegradationLevel.CRITICAL 
          : DegradationLevel.SIGNIFICANT;
      case FeaturePriority.MEDIUM:
        return action.type === DegradationStrategy.DISABLE_FEATURE 
          ? DegradationLevel.SIGNIFICANT 
          : DegradationLevel.MODERATE;
      case FeaturePriority.LOW:
        return DegradationLevel.MODERATE;
      case FeaturePriority.EXPERIMENTAL:
        return DegradationLevel.MINIMAL;
      default:
        return DegradationLevel.MINIMAL;
    }
  }
  
  /**
   * Update degradation state
   */
  private updateDegradationState(
    level: DegradationLevel,
    activeRules: string[],
    disabledFeatures: string[],
    degradedFeatures: Map<string, DegradationStrategy[]>,
    reason: string
  ): void {
    const previousLevel = this.currentState.currentLevel;
    
    this.currentState = {
      currentLevel: level,
      activeRules,
      disabledFeatures,
      degradedFeatures,
      lastChanged: new Date(),
      reason
    };
    
    // Update feature statuses
    for (const [featureName, strategies] of degradedFeatures) {
      const featureStatus = this.featureStatuses.get(featureName);
      if (featureStatus) {
        featureStatus.degraded = true;
        featureStatus.degradationStrategies = strategies;
      }
    }
    
    // Add to history
    this.degradationHistory.push({
      timestamp: new Date(),
      level,
      reason,
      triggeredRules: activeRules
    });
    
    // Log state change
    if (level !== previousLevel) {
      this.logger.warn('Degradation level changed', {
        previousLevel,
        newLevel: level,
        reason,
        activeRules,
        disabledFeatures: disabledFeatures.length,
        degradedFeatures: degradedFeatures.size
      });
      
      this.metrics.gauge('graceful_degradation.current_level', level);
      
      this.metrics.counter('graceful_degradation.level_changes', 1, {
        from_level: previousLevel.toString(),
        to_level: level.toString()
      });
    }
  }
  
  /**
   * Evaluate revert conditions
   */
  private async evaluateRevertConditions(): Promise<void> {
    // Check if conditions have improved and we can revert some degradations
    const rulesToRevert: string[] = [];
    
    for (const ruleId of this.currentState.activeRules) {
      const rule = this.degradationRules.get(ruleId);
      if (!rule || !rule.autoRevert) {
        continue;
      }
      
      // Check if rule conditions are no longer met
      const shouldStillTrigger = await this.evaluateRuleTriggers(rule);
      
      if (!shouldStillTrigger) {
        // Check if enough time has passed for revert delay
        const timeSinceChange = Date.now() - this.currentState.lastChanged.getTime();
        if (timeSinceChange >= rule.revertDelay) {
          rulesToRevert.push(ruleId);
        }
      }
    }
    
    if (rulesToRevert.length > 0) {
      await this.revertDegradations(rulesToRevert);
    }
  }
  
  /**
   * Revert degradations
   */
  private async revertDegradations(rulesToRevert: string[]): Promise<void> {
    try {
      this.logger.info('Reverting degradations', { rulesToRevert });
      
      // TODO: Implement actual revert logic
      // This would restore features to their normal state
      
      // Update state
      const newActiveRules = this.currentState.activeRules.filter(
        ruleId => !rulesToRevert.includes(ruleId)
      );
      
      // Calculate new degradation level
      const newLevel = this.calculateDegradationLevel(newActiveRules);
      
      this.updateDegradationState(
        newLevel,
        newActiveRules,
        [], // Reset disabled features for simplicity
        new Map(), // Reset degraded features for simplicity
        `Reverted rules: ${rulesToRevert.join(', ')}`
      );
      
      this.metrics.counter('graceful_degradation.reverts', rulesToRevert.length);
      
    } catch (error) {
      this.logger.error('Failed to revert degradations', {
        rulesToRevert,
        error: error.message
      });
    }
  }
  
  /**
   * Calculate degradation level based on active rules
   */
  private calculateDegradationLevel(activeRules: string[]): DegradationLevel {
    if (activeRules.length === 0) {
      return DegradationLevel.NONE;
    }
    
    // Find the highest degradation level from active rules
    let maxLevel = DegradationLevel.NONE;
    
    for (const ruleId of activeRules) {
      const rule = this.degradationRules.get(ruleId);
      if (rule) {
        for (const action of rule.actions) {
          const actionLevel = this.getActionDegradationLevel(action);
          if (actionLevel > maxLevel) {
            maxLevel = actionLevel;
          }
        }
      }
    }
    
    return maxLevel;
  }
  
  /**
   * Get service health value
   */
  private async getServiceHealthValue(serviceName: string): Promise<number> {
    // TODO: Integrate with service health monitoring
    // Return 0-1 where 1 is healthy, 0 is unhealthy
    return 1.0;
  }
  
  /**
   * Get resource usage value
   */
  private async getResourceUsageValue(resourceType: string): Promise<number> {
    // TODO: Integrate with resource monitoring
    // Return percentage (0-100)
    return 50;
  }
  
  /**
   * Get error rate value
   */
  private async getErrorRateValue(serviceName: string): Promise<number> {
    // TODO: Integrate with error rate monitoring
    // Return percentage (0-100)
    return 5;
  }
  
  /**
   * Get response time value
   */
  private async getResponseTimeValue(serviceName: string): Promise<number> {
    // TODO: Integrate with response time monitoring
    // Return milliseconds
    return 500;
  }
  
  /**
   * Get custom metric value
   */
  private async getCustomMetricValue(metricName: string): Promise<number> {
    // TODO: Integrate with custom metrics
    return 0;
  }
  
  /**
   * Register built-in health check functions
   */
  private registerBuiltInHealthChecks(): void {
    // Example health check functions
    this.healthCheckFunctions.set('basic_health', async (featureName: string) => {
      // Basic health check implementation
      return {
        healthy: true,
        responseTime: 100,
        errorRate: 0
      };
    });
    
    this.logger.info('Registered built-in health check functions');
  }
  
  /**
   * Start monitoring
   */
  private startMonitoring(): void {
    // Evaluate degradation rules every 30 seconds
    const monitoringTimer = setInterval(async () => {
      try {
        await this.evaluateDegradationRules();
      } catch (error) {
        this.logger.error('Monitoring evaluation failed', {
          error: error.message
        });
      }
    }, 30000);
    
    this.monitoringTimers.set('main', monitoringTimer);
    
    this.logger.info('Started degradation monitoring');
  }
  
  /**
   * Start feature health check
   */
  private startFeatureHealthCheck(featureName: string): void {
    const feature = this.features.get(featureName);
    if (!feature || !feature.healthCheckFunction) {
      return;
    }
    
    const healthCheckFn = this.healthCheckFunctions.get(feature.healthCheckFunction);
    if (!healthCheckFn) {
      return;
    }
    
    const timer = setInterval(async () => {
      try {
        const result = await healthCheckFn(featureName);
        
        const featureStatus = this.featureStatuses.get(featureName);
        if (featureStatus) {
          featureStatus.lastHealthCheck = new Date();
          featureStatus.performanceMetrics = {
            responseTime: result.responseTime || 0,
            errorRate: result.errorRate || 0,
            throughput: result.throughput || 0
          };
          
          // Update health status based on thresholds
          const thresholds = feature.performanceThresholds;
          if (result.errorRate > thresholds.errorRate || 
              result.responseTime > thresholds.responseTime) {
            featureStatus.healthStatus = 'degraded';
          } else if (result.healthy) {
            featureStatus.healthStatus = 'healthy';
          } else {
            featureStatus.healthStatus = 'unhealthy';
          }
        }
        
      } catch (error) {
        this.logger.error('Feature health check failed', {
          featureName,
          error: error.message
        });
      }
    }, 60000); // Every minute
    
    this.monitoringTimers.set(`health_${featureName}`, timer);
  }
  
  /**
   * Clean up history
   */
  private cleanupHistory(): void {
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    
    this.degradationHistory = this.degradationHistory.filter(
      entry => entry.timestamp.getTime() > cutoffTime
    );
  }
  
  /**
   * Get current degradation state
   */
  getCurrentState(): DegradationState {
    return { ...this.currentState };
  }
  
  /**
   * Get feature status
   */
  getFeatureStatus(featureName: string): FeatureStatus | null {
    return this.featureStatuses.get(featureName) || null;
  }
  
  /**
   * Get all feature statuses
   */
  getAllFeatureStatuses(): FeatureStatus[] {
    return Array.from(this.featureStatuses.values());
  }
  
  /**
   * Force degradation level
   */
  async forceDegradationLevel(level: DegradationLevel, reason: string): Promise<void> {
    this.logger.warn('Forcing degradation level', { level, reason });
    
    // TODO: Implement forced degradation logic
    // This would apply degradations to reach the specified level
    
    this.updateDegradationState(
      level,
      ['manual_override'],
      [],
      new Map(),
      `Manual override: ${reason}`
    );
    
    this.metrics.counter('graceful_degradation.manual_overrides', 1, {
      level: level.toString()
    });
  }
  
  /**
   * Get degradation statistics
   */
  getDegradationStats(): {
    currentLevel: DegradationLevel;
    totalFeatures: number;
    enabledFeatures: number;
    degradedFeatures: number;
    disabledFeatures: number;
    activeRules: number;
    recentChanges: number;
  } {
    const enabledFeatures = Array.from(this.featureStatuses.values())
      .filter(f => f.enabled).length;
    
    const degradedFeatures = Array.from(this.featureStatuses.values())
      .filter(f => f.degraded).length;
    
    const recentChanges = this.degradationHistory.filter(
      entry => entry.timestamp.getTime() > Date.now() - (24 * 60 * 60 * 1000)
    ).length;
    
    return {
      currentLevel: this.currentState.currentLevel,
      totalFeatures: this.features.size,
      enabledFeatures,
      degradedFeatures,
      disabledFeatures: this.currentState.disabledFeatures.length,
      activeRules: this.currentState.activeRules.length,
      recentChanges
    };
  }
  
  /**
   * Register health check function
   */
  registerHealthCheckFunction(name: string, fn: Function): void {
    this.healthCheckFunctions.set(name, fn);
    this.logger.info('Registered health check function', { name });
  }
  
  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clear all timers
    for (const timer of this.monitoringTimers.values()) {
      clearInterval(timer);
    }
    
    this.monitoringTimers.clear();
    
    this.logger.info('Graceful Degradation Manager cleaned up');
  }
}