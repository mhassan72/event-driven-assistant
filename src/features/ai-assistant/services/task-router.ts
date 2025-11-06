/**
 * Task Routing Service
 * Routes tasks between synchronous and asynchronous processing based on classification
 */

import {
  ConversationRequest,
  TaskClassification,
  TaskType,
  TaskComplexity,
  TaskPriority
} from '@/shared/types';
import { IStructuredLogger } from '@/shared/observability/logger';
import { IMetricsCollector } from '@/shared/observability/metrics';

/**
 * Interface for Task Router
 */
export interface ITaskRouter {
  // Route Determination
  determineRoutingStrategy(classification: TaskClassification): Promise<RoutingStrategy>;
  routeTask(request: ConversationRequest, classification: TaskClassification): Promise<TaskRoutingResult>;
  
  // Routing Rules
  updateRoutingRules(rules: RoutingRule[]): Promise<void>;
  getRoutingRules(): Promise<RoutingRule[]>;
  
  // Load Balancing
  checkSystemLoad(): Promise<SystemLoadMetrics>;
  selectOptimalExecutionPath(classification: TaskClassification, load: SystemLoadMetrics): Promise<ExecutionPath>;
}

/**
 * Supporting interfaces and types
 */
export enum RoutingStrategy {
  SYNCHRONOUS = 'synchronous',
  ASYNCHRONOUS = 'asynchronous',
  HYBRID = 'hybrid',
  QUEUED = 'queued'
}

export enum ExecutionPath {
  QUICK_RESPONSE = 'quick_response',
  AGENT_FUNCTION = 'agent_function',
  BATCH_PROCESSING = 'batch_processing',
  PRIORITY_QUEUE = 'priority_queue'
}

export interface TaskRoutingResult {
  strategy: RoutingStrategy;
  executionPath: ExecutionPath;
  estimatedWaitTime: number;
  queuePosition?: number;
  routingReason: string;
  fallbackOptions: RoutingOption[];
  metadata: RoutingMetadata;
}

export interface RoutingOption {
  strategy: RoutingStrategy;
  executionPath: ExecutionPath;
  estimatedWaitTime: number;
  costAdjustment: number;
  description: string;
}

export interface RoutingMetadata {
  routedAt: Date;
  routingVersion: string;
  systemLoad: number;
  userPriority: number;
  resourceRequirements: ResourceRequirements;
}

export interface RoutingRule {
  id: string;
  name: string;
  description: string;
  conditions: RoutingCondition[];
  strategy: RoutingStrategy;
  executionPath: ExecutionPath;
  priority: number;
  isActive: boolean;
}

export interface RoutingCondition {
  type: ConditionType;
  field: string;
  operator: ConditionOperator;
  value: any;
  weight: number;
}

export enum ConditionType {
  TASK_TYPE = 'task_type',
  COMPLEXITY = 'complexity',
  DURATION = 'duration',
  COST = 'cost',
  SYSTEM_LOAD = 'system_load',
  USER_TIER = 'user_tier',
  TIME_OF_DAY = 'time_of_day'
}

export enum ConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  IN = 'in',
  NOT_IN = 'not_in',
  CONTAINS = 'contains'
}

export interface SystemLoadMetrics {
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
  queueLength: number;
  averageResponseTime: number;
  errorRate: number;
  timestamp: Date;
}

export interface ResourceRequirements {
  estimatedCpu: number;
  estimatedMemory: number;
  estimatedDuration: number;
  requiresGpu: boolean;
  requiresNetwork: boolean;
  priority: TaskPriority;
}



/**
 * Task Router Implementation
 */
export class TaskRouter implements ITaskRouter {
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  private routingRules: RoutingRule[] = [];
  private loadThresholds: LoadThresholds;

  constructor(
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.loadThresholds = this.getDefaultLoadThresholds();
    this.initializeDefaultRoutingRules();
  }

  // ============================================================================
  // Route Determination
  // ============================================================================

  async determineRoutingStrategy(classification: TaskClassification): Promise<RoutingStrategy> {
    try {
      this.logger.debug('Determining routing strategy', { classification });

      // Check system load
      const systemLoad = await this.checkSystemLoad();
      
      // Apply routing rules
      const matchedRule = await this.findMatchingRule(classification, systemLoad);
      
      if (matchedRule) {
        this.logger.info('Routing rule matched', { 
          ruleId: matchedRule.id,
          strategy: matchedRule.strategy 
        });
        return matchedRule.strategy;
      }

      // Fallback to default strategy determination
      return this.getDefaultStrategy(classification, systemLoad);

    } catch (error) {
      this.logger.error('Failed to determine routing strategy', { 
        classification, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      // Fallback to synchronous for safety
      return RoutingStrategy.SYNCHRONOUS;
    }
  }

  async routeTask(request: ConversationRequest, classification: TaskClassification): Promise<TaskRoutingResult> {
    try {
      this.logger.info('Routing task', { 
        conversationId: request.conversationId,
        taskType: classification.type 
      });

      const systemLoad = await this.checkSystemLoad();
      const strategy = await this.determineRoutingStrategy(classification);
      const executionPath = await this.selectOptimalExecutionPath(classification, systemLoad);
      
      // Calculate estimated wait time
      const estimatedWaitTime = this.calculateWaitTime(strategy, executionPath, systemLoad);
      
      // Determine queue position if applicable
      let queuePosition: number | undefined;
      if (strategy === RoutingStrategy.QUEUED || strategy === RoutingStrategy.ASYNCHRONOUS) {
        queuePosition = await this.getQueuePosition(executionPath);
      }

      // Generate routing reason
      const routingReason = this.generateRoutingReason(classification, strategy, systemLoad);

      // Generate fallback options
      const fallbackOptions = await this.generateFallbackOptions(classification, strategy);

      // Create routing metadata
      const metadata: RoutingMetadata = {
        routedAt: new Date(),
        routingVersion: '1.0',
        systemLoad: systemLoad.cpuUsage,
        userPriority: this.getUserPriority(request.userId),
        resourceRequirements: this.calculateResourceRequirements(classification)
      };

      const result: TaskRoutingResult = {
        strategy,
        executionPath,
        estimatedWaitTime,
        queuePosition,
        routingReason,
        fallbackOptions,
        metadata
      };

      // Record routing metrics
      this.metrics.increment('task_router.routes', 1, {
        strategy: strategy.toString(),
        executionPath: executionPath.toString(),
        taskType: classification.type.toString()
      });

      this.metrics.histogram('task_router.estimated_wait_time', estimatedWaitTime);

      this.logger.info('Task routed successfully', {
        conversationId: request.conversationId,
        result
      });

      return result;

    } catch (error) {
      this.logger.error('Task routing failed', {
        conversationId: request.conversationId,
        error
      });
      this.metrics.increment('task_router.errors');
      throw error;
    }
  }

  // ============================================================================
  // Routing Rules Management
  // ============================================================================

  async updateRoutingRules(rules: RoutingRule[]): Promise<void> {
    this.routingRules = rules.sort((a, b) => b.priority - a.priority);
    this.logger.info('Routing rules updated', { ruleCount: rules.length });
  }

  async getRoutingRules(): Promise<RoutingRule[]> {
    return [...this.routingRules];
  }

  // ============================================================================
  // Load Balancing
  // ============================================================================

  async checkSystemLoad(): Promise<SystemLoadMetrics> {
    try {
      // In a real implementation, this would check actual system metrics
      // For now, we'll simulate load metrics
      const load: SystemLoadMetrics = {
        cpuUsage: Math.random() * 100,
        memoryUsage: Math.random() * 100,
        activeConnections: Math.floor(Math.random() * 1000),
        queueLength: Math.floor(Math.random() * 50),
        averageResponseTime: 1000 + Math.random() * 2000,
        errorRate: Math.random() * 0.05,
        timestamp: new Date()
      };

      this.metrics.gauge('system.cpu_usage', load.cpuUsage);
      this.metrics.gauge('system.memory_usage', load.memoryUsage);
      this.metrics.gauge('system.queue_length', load.queueLength);

      return load;

    } catch (error) {
      this.logger.error('Failed to check system load', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      // Return safe defaults
      return {
        cpuUsage: 50,
        memoryUsage: 50,
        activeConnections: 100,
        queueLength: 5,
        averageResponseTime: 1500,
        errorRate: 0.01,
        timestamp: new Date()
      };
    }
  }

  async selectOptimalExecutionPath(classification: TaskClassification, load: SystemLoadMetrics): Promise<ExecutionPath> {
    // High load conditions - prefer queuing
    if (load.cpuUsage > this.loadThresholds.highCpu || 
        load.memoryUsage > this.loadThresholds.highMemory) {
      
      if (classification.complexity === TaskComplexity.LOW) {
        return ExecutionPath.PRIORITY_QUEUE;
      }
      return ExecutionPath.BATCH_PROCESSING;
    }

    // Normal load conditions - route based on task characteristics
    if (classification.requiresAgentExecution) {
      return ExecutionPath.AGENT_FUNCTION;
    }

    if (classification.estimatedDuration < 30) {
      return ExecutionPath.QUICK_RESPONSE;
    }

    // Medium complexity tasks
    if (classification.complexity === TaskComplexity.MEDIUM) {
      return load.queueLength < 10 ? ExecutionPath.AGENT_FUNCTION : ExecutionPath.PRIORITY_QUEUE;
    }

    return ExecutionPath.QUICK_RESPONSE;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async findMatchingRule(classification: TaskClassification, systemLoad: SystemLoadMetrics): Promise<RoutingRule | null> {
    for (const rule of this.routingRules) {
      if (!rule.isActive) continue;

      let matchScore = 0;
      let totalWeight = 0;

      for (const condition of rule.conditions) {
        totalWeight += condition.weight;
        if (this.evaluateCondition(condition, classification, systemLoad)) {
          matchScore += condition.weight;
        }
      }

      // If match score is above threshold (80%), use this rule
      if (totalWeight > 0 && (matchScore / totalWeight) >= 0.8) {
        return rule;
      }
    }

    return null;
  }

  private evaluateCondition(condition: RoutingCondition, classification: TaskClassification, systemLoad: SystemLoadMetrics): boolean {
    let fieldValue: any;

    switch (condition.type) {
      case ConditionType.TASK_TYPE:
        fieldValue = classification.type;
        break;
      case ConditionType.COMPLEXITY:
        fieldValue = classification.complexity;
        break;
      case ConditionType.DURATION:
        fieldValue = classification.estimatedDuration;
        break;
      case ConditionType.COST:
        fieldValue = classification.estimatedCreditCost;
        break;
      case ConditionType.SYSTEM_LOAD:
        fieldValue = systemLoad.cpuUsage;
        break;
      case ConditionType.TIME_OF_DAY:
        fieldValue = new Date().getHours();
        break;
      default:
        return false;
    }

    return this.compareValues(fieldValue, condition.operator, condition.value);
  }

  private compareValues(fieldValue: any, operator: ConditionOperator, conditionValue: any): boolean {
    switch (operator) {
      case ConditionOperator.EQUALS:
        return fieldValue === conditionValue;
      case ConditionOperator.NOT_EQUALS:
        return fieldValue !== conditionValue;
      case ConditionOperator.GREATER_THAN:
        return fieldValue > conditionValue;
      case ConditionOperator.LESS_THAN:
        return fieldValue < conditionValue;
      case ConditionOperator.IN:
        return Array.isArray(conditionValue) && conditionValue.includes(fieldValue);
      case ConditionOperator.NOT_IN:
        return Array.isArray(conditionValue) && !conditionValue.includes(fieldValue);
      case ConditionOperator.CONTAINS:
        return String(fieldValue).toLowerCase().includes(String(conditionValue).toLowerCase());
      default:
        return false;
    }
  }

  private getDefaultStrategy(classification: TaskClassification, systemLoad: SystemLoadMetrics): RoutingStrategy {
    // High system load - prefer asynchronous processing
    if (systemLoad.cpuUsage > 80 || systemLoad.memoryUsage > 80) {
      return RoutingStrategy.ASYNCHRONOUS;
    }

    // Agent execution required - use asynchronous
    if (classification.requiresAgentExecution) {
      return RoutingStrategy.ASYNCHRONOUS;
    }

    // Long duration tasks - use asynchronous
    if (classification.estimatedDuration > 60) {
      return RoutingStrategy.ASYNCHRONOUS;
    }

    // High complexity - use asynchronous
    if (classification.complexity === TaskComplexity.HIGH) {
      return RoutingStrategy.ASYNCHRONOUS;
    }

    // Default to synchronous for quick tasks
    return RoutingStrategy.SYNCHRONOUS;
  }

  private calculateWaitTime(strategy: RoutingStrategy, executionPath: ExecutionPath, systemLoad: SystemLoadMetrics): number {
    let baseWaitTime = 0;

    switch (executionPath) {
      case ExecutionPath.QUICK_RESPONSE:
        baseWaitTime = 2; // 2 seconds
        break;
      case ExecutionPath.AGENT_FUNCTION:
        baseWaitTime = 30; // 30 seconds
        break;
      case ExecutionPath.BATCH_PROCESSING:
        baseWaitTime = 120; // 2 minutes
        break;
      case ExecutionPath.PRIORITY_QUEUE:
        baseWaitTime = 60; // 1 minute
        break;
    }

    // Adjust for system load
    const loadMultiplier = 1 + (systemLoad.cpuUsage / 100);
    const queueMultiplier = 1 + (systemLoad.queueLength / 10);

    return Math.round(baseWaitTime * loadMultiplier * queueMultiplier);
  }

  private async getQueuePosition(executionPath: ExecutionPath): Promise<number> {
    // In a real implementation, this would check actual queue positions
    // For now, simulate based on execution path
    const basePositions = {
      [ExecutionPath.QUICK_RESPONSE]: 0,
      [ExecutionPath.AGENT_FUNCTION]: Math.floor(Math.random() * 5) + 1,
      [ExecutionPath.BATCH_PROCESSING]: Math.floor(Math.random() * 20) + 1,
      [ExecutionPath.PRIORITY_QUEUE]: Math.floor(Math.random() * 10) + 1
    };

    return basePositions[executionPath] || 0;
  }

  private generateRoutingReason(classification: TaskClassification, strategy: RoutingStrategy, systemLoad: SystemLoadMetrics): string {
    const reasons = [];

    if (strategy === RoutingStrategy.ASYNCHRONOUS) {
      if (classification.requiresAgentExecution) {
        reasons.push("Requires agent execution");
      }
      if (classification.complexity === TaskComplexity.HIGH) {
        reasons.push("High complexity task");
      }
      if (classification.estimatedDuration > 60) {
        reasons.push("Long duration task");
      }
      if (systemLoad.cpuUsage > 70) {
        reasons.push("High system load");
      }
    } else if (strategy === RoutingStrategy.SYNCHRONOUS) {
      if (classification.type === TaskType.QUICK_CHAT) {
        reasons.push("Quick chat interaction");
      }
      if (classification.estimatedDuration < 30) {
        reasons.push("Short duration task");
      }
      if (systemLoad.cpuUsage < 50) {
        reasons.push("Low system load");
      }
    }

    return reasons.length > 0 ? reasons.join("; ") : "Default routing strategy";
  }

  private async generateFallbackOptions(classification: TaskClassification, primaryStrategy: RoutingStrategy): Promise<RoutingOption[]> {
    const options: RoutingOption[] = [];

    // Always provide synchronous fallback if not primary
    if (primaryStrategy !== RoutingStrategy.SYNCHRONOUS) {
      options.push({
        strategy: RoutingStrategy.SYNCHRONOUS,
        executionPath: ExecutionPath.QUICK_RESPONSE,
        estimatedWaitTime: 5,
        costAdjustment: 0,
        description: "Immediate processing with potentially reduced quality"
      });
    }

    // Provide asynchronous fallback if not primary
    if (primaryStrategy !== RoutingStrategy.ASYNCHRONOUS) {
      options.push({
        strategy: RoutingStrategy.ASYNCHRONOUS,
        executionPath: ExecutionPath.AGENT_FUNCTION,
        estimatedWaitTime: 60,
        costAdjustment: 0.1,
        description: "Queue for full processing with higher quality"
      });
    }

    // Provide queued option for high-load scenarios
    if (primaryStrategy !== RoutingStrategy.QUEUED) {
      options.push({
        strategy: RoutingStrategy.QUEUED,
        executionPath: ExecutionPath.PRIORITY_QUEUE,
        estimatedWaitTime: 120,
        costAdjustment: -0.1,
        description: "Queue for processing during low-load periods (cost savings)"
      });
    }

    return options;
  }

  private getUserPriority(userId: string): number {
    // In a real implementation, this would check user tier/subscription
    // For now, return default priority (2 = NORMAL)
    return 2;
  }

  private calculateResourceRequirements(classification: TaskClassification): ResourceRequirements {
    const baseRequirements = {
      [TaskType.QUICK_CHAT]: { cpu: 0.1, memory: 0.1, gpu: false },
      [TaskType.IMAGE_GENERATION]: { cpu: 0.3, memory: 0.5, gpu: true },
      [TaskType.RESEARCH_TASK]: { cpu: 0.4, memory: 0.3, gpu: false },
      [TaskType.CODE_GENERATION]: { cpu: 0.3, memory: 0.2, gpu: false },
      [TaskType.DATA_ANALYSIS]: { cpu: 0.5, memory: 0.4, gpu: false },
      [TaskType.LONG_FORM_WRITING]: { cpu: 0.2, memory: 0.2, gpu: false },
      [TaskType.MULTI_STEP_WORKFLOW]: { cpu: 0.6, memory: 0.5, gpu: false },
      [TaskType.VISION_ANALYSIS]: { cpu: 0.4, memory: 0.3, gpu: true }
    };

    const base = baseRequirements[classification.type] || { cpu: 0.2, memory: 0.2, gpu: false };

    // Adjust for complexity
    const complexityMultipliers = {
      [TaskComplexity.LOW]: 1.0,
      [TaskComplexity.MEDIUM]: 1.5,
      [TaskComplexity.HIGH]: 2.5
    };

    const multiplier = complexityMultipliers[classification.complexity];

    return {
      estimatedCpu: base.cpu * multiplier,
      estimatedMemory: base.memory * multiplier,
      estimatedDuration: classification.estimatedDuration,
      requiresGpu: base.gpu,
      requiresNetwork: true,
      priority: this.getTaskPriority(classification)
    };
  }

  private getTaskPriority(classification: TaskClassification): TaskPriority {
    if (classification.type === TaskType.QUICK_CHAT) {
      return TaskPriority.HIGH;
    }
    if (classification.complexity === TaskComplexity.HIGH) {
      return TaskPriority.NORMAL;
    }
    return TaskPriority.NORMAL;
  }

  private getDefaultLoadThresholds(): LoadThresholds {
    return {
      highCpu: 80,
      highMemory: 80,
      highQueue: 20,
      criticalCpu: 95,
      criticalMemory: 95
    };
  }

  private initializeDefaultRoutingRules(): void {
    this.routingRules = [
      {
        id: 'quick-chat-sync',
        name: 'Quick Chat Synchronous',
        description: 'Route quick chats to synchronous processing',
        conditions: [
          {
            type: ConditionType.TASK_TYPE,
            field: 'type',
            operator: ConditionOperator.EQUALS,
            value: TaskType.QUICK_CHAT,
            weight: 4
          },
          {
            type: ConditionType.DURATION,
            field: 'estimatedDuration',
            operator: ConditionOperator.LESS_THAN,
            value: 30,
            weight: 2
          }
        ],
        strategy: RoutingStrategy.SYNCHRONOUS,
        executionPath: ExecutionPath.QUICK_RESPONSE,
        priority: 10,
        isActive: true
      },
      {
        id: 'agent-tasks-async',
        name: 'Agent Tasks Asynchronous',
        description: 'Route agent-required tasks to asynchronous processing',
        conditions: [
          {
            type: ConditionType.TASK_TYPE,
            field: 'type',
            operator: ConditionOperator.IN,
            value: [TaskType.RESEARCH_TASK, TaskType.MULTI_STEP_WORKFLOW, TaskType.DATA_ANALYSIS],
            weight: 4
          },
          {
            type: ConditionType.COMPLEXITY,
            field: 'complexity',
            operator: ConditionOperator.EQUALS,
            value: TaskComplexity.HIGH,
            weight: 3
          }
        ],
        strategy: RoutingStrategy.ASYNCHRONOUS,
        executionPath: ExecutionPath.AGENT_FUNCTION,
        priority: 9,
        isActive: true
      },
      {
        id: 'high-load-queue',
        name: 'High Load Queuing',
        description: 'Queue tasks during high system load',
        conditions: [
          {
            type: ConditionType.SYSTEM_LOAD,
            field: 'cpuUsage',
            operator: ConditionOperator.GREATER_THAN,
            value: 80,
            weight: 4
          }
        ],
        strategy: RoutingStrategy.QUEUED,
        executionPath: ExecutionPath.PRIORITY_QUEUE,
        priority: 8,
        isActive: true
      },
      {
        id: 'image-generation-async',
        name: 'Image Generation Asynchronous',
        description: 'Route image generation to asynchronous processing',
        conditions: [
          {
            type: ConditionType.TASK_TYPE,
            field: 'type',
            operator: ConditionOperator.EQUALS,
            value: TaskType.IMAGE_GENERATION,
            weight: 4
          }
        ],
        strategy: RoutingStrategy.ASYNCHRONOUS,
        executionPath: ExecutionPath.AGENT_FUNCTION,
        priority: 7,
        isActive: true
      }
    ];
  }
}

interface LoadThresholds {
  highCpu: number;
  highMemory: number;
  highQueue: number;
  criticalCpu: number;
  criticalMemory: number;
}