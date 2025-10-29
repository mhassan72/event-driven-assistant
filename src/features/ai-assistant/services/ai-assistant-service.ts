/**
 * AI Assistant Service
 * Main orchestration service for AI assistant functionality with task classification and routing
 */

import {
  ConversationRequest,
  AgentTaskRequest,
  TaskClassification,
  TaskRoutingResult,
  ConversationResponse,
  AgentTaskInitiation,
  ModelSelection,
  AIModel,
  ModelRequirements,
  TaskType
} from '@/shared/types';
import { ITaskClassifier } from './task-classifier';
import { ITaskRouter, RoutingStrategy, ExecutionPath } from './task-router';
import { IModelManagementService } from './model-management-service';
import { IUserPreferenceManager } from './user-preference-manager';
import { IModelCostCalculator } from './model-cost-calculator';
import { IStructuredLogger } from '@/shared/observability/logger';
import { IMetricsCollector } from '@/shared/observability/metrics';

/**
 * Interface for AI Assistant Service
 */
export interface IAIAssistantService {
  // Main Processing Methods
  processConversation(request: ConversationRequest): Promise<ConversationResponse>;
  initiateAgentTask(request: AgentTaskRequest): Promise<AgentTaskInitiation>;
  
  // Task Analysis
  analyzeTask(request: ConversationRequest): Promise<TaskAnalysisResult>;
  estimateTaskCost(request: ConversationRequest): Promise<CostEstimation>;
  
  // Model Selection
  selectOptimalModel(userId: string, requirements: ModelRequirements): Promise<ModelSelection>;
  getRecommendedModels(userId: string, taskType: TaskType): Promise<AIModel[]>;
  
  // System Status
  getSystemStatus(): Promise<SystemStatus>;
  getProcessingCapacity(): Promise<ProcessingCapacity>;
}

/**
 * Supporting interfaces
 */
export interface TaskAnalysisResult {
  classification: TaskClassification;
  routing: TaskRoutingResult;
  modelRecommendations: ModelSelection[];
  costEstimation: CostEstimation;
  processingStrategy: ProcessingStrategy;
}

export interface CostEstimation {
  estimatedCost: number;
  costRange: {
    minimum: number;
    maximum: number;
  };
  factors: CostFactor[];
  alternatives: CostAlternative[];
}

export interface CostFactor {
  name: string;
  impact: number;
  description: string;
}

export interface CostAlternative {
  description: string;
  costSavings: number;
  qualityImpact: number;
  processingTimeImpact: number;
}

export interface ProcessingStrategy {
  approach: ProcessingApproach;
  estimatedDuration: number;
  qualityLevel: QualityLevel;
  resourceRequirements: ResourceAllocation;
}

export enum ProcessingApproach {
  IMMEDIATE = 'immediate',
  QUEUED = 'queued',
  BATCH = 'batch',
  PRIORITY = 'priority'
}

export enum QualityLevel {
  DRAFT = 'draft',
  STANDARD = 'standard',
  HIGH = 'high',
  PREMIUM = 'premium'
}

export interface ResourceAllocation {
  computeUnits: number;
  memoryMb: number;
  estimatedTokens: number;
  gpuRequired: boolean;
}

export interface ConversationResponse {
  id: string;
  conversationId: string;
  response: string;
  model: string;
  creditsUsed: number;
  processingTime: number;
  quality: number;
  metadata: ResponseMetadata;
}

export interface ResponseMetadata {
  taskClassification: TaskClassification;
  routingStrategy: RoutingStrategy;
  modelSelection: ModelSelection;
  processingPath: ExecutionPath;
  timestamp: Date;
}

export interface AgentTaskInitiation {
  taskId: string;
  status: TaskStatus;
  estimatedCompletion: Date;
  creditsReserved: number;
  progressTrackingUrl: string;
  queuePosition?: number;
}

export enum TaskStatus {
  INITIATED = 'initiated',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface SystemStatus {
  overallHealth: HealthStatus;
  processingCapacity: ProcessingCapacity;
  activeModels: number;
  queueLength: number;
  averageResponseTime: number;
  errorRate: number;
  lastUpdated: Date;
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  MAINTENANCE = 'maintenance'
}

export interface ProcessingCapacity {
  synchronousSlots: CapacityInfo;
  asynchronousSlots: CapacityInfo;
  agentFunctions: CapacityInfo;
  imageGeneration: CapacityInfo;
}

export interface CapacityInfo {
  total: number;
  available: number;
  utilizationPercentage: number;
  averageWaitTime: number;
}

/**
 * AI Assistant Service Implementation
 */
export class AIAssistantService implements IAIAssistantService {
  private taskClassifier: ITaskClassifier;
  private taskRouter: ITaskRouter;
  private modelManagement: IModelManagementService;
  private userPreferences: IUserPreferenceManager;
  private costCalculator: IModelCostCalculator;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;

  constructor(
    taskClassifier: ITaskClassifier,
    taskRouter: ITaskRouter,
    modelManagement: IModelManagementService,
    userPreferences: IUserPreferenceManager,
    costCalculator: IModelCostCalculator,
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ) {
    this.taskClassifier = taskClassifier;
    this.taskRouter = taskRouter;
    this.modelManagement = modelManagement;
    this.userPreferences = userPreferences;
    this.costCalculator = costCalculator;
    this.logger = logger;
    this.metrics = metrics;
  }

  // ============================================================================
  // Main Processing Methods
  // ============================================================================

  async processConversation(request: ConversationRequest): Promise<ConversationResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Processing conversation request', {
        conversationId: request.conversationId,
        userId: request.userId,
        messageLength: request.message.length
      });

      // Step 1: Analyze the task
      const analysis = await this.analyzeTask(request);
      
      // Step 2: Check if synchronous processing is appropriate
      if (analysis.routing.strategy !== RoutingStrategy.SYNCHRONOUS) {
        // For non-synchronous tasks, initiate agent processing
        const agentRequest: AgentTaskRequest = {
          ...request,
          taskType: analysis.classification.type,
          maxExecutionTime: analysis.classification.estimatedDuration * 1000,
          tools: [],
          workflow: undefined
        };
        
        const agentInitiation = await this.initiateAgentTask(agentRequest);
        
        // Return immediate response indicating async processing
        return {
          id: this.generateId(),
          conversationId: request.conversationId,
          response: `Your ${analysis.classification.type} request has been queued for processing. Task ID: ${agentInitiation.taskId}. Estimated completion: ${agentInitiation.estimatedCompletion.toLocaleString()}`,
          model: 'system',
          creditsUsed: 0, // Credits will be deducted when processing completes
          processingTime: Date.now() - startTime,
          quality: 1.0,
          metadata: {
            taskClassification: analysis.classification,
            routingStrategy: analysis.routing.strategy,
            modelSelection: analysis.modelRecommendations[0],
            processingPath: analysis.routing.executionPath,
            timestamp: new Date()
          }
        };
      }

      // Step 3: Process synchronously
      const selectedModel = analysis.modelRecommendations[0];
      
      // Step 4: Validate budget and deduct credits
      const budgetCheck = await this.userPreferences.checkBudgetConstraints(
        request.userId, 
        analysis.costEstimation.estimatedCost
      );
      
      if (!budgetCheck.withinBudget) {
        throw new Error(`Insufficient budget. Required: ${analysis.costEstimation.estimatedCost} credits. ${budgetCheck.recommendations[0]?.description || 'Please add more credits.'}`);
      }

      // Step 5: Generate response (placeholder - would integrate with actual AI models)
      const response = await this.generateResponse(request, selectedModel.selectedModel);
      
      // Step 6: Calculate actual cost and deduct credits
      const actualCost = await this.calculateActualCost(response, selectedModel.selectedModel);
      await this.deductCredits(request.userId, actualCost);

      const processingTime = Date.now() - startTime;

      // Step 7: Record metrics
      this.recordProcessingMetrics(analysis, processingTime, actualCost);

      const conversationResponse: ConversationResponse = {
        id: this.generateId(),
        conversationId: request.conversationId,
        response: response.content,
        model: selectedModel.selectedModel.id,
        creditsUsed: actualCost,
        processingTime,
        quality: response.quality,
        metadata: {
          taskClassification: analysis.classification,
          routingStrategy: analysis.routing.strategy,
          modelSelection: selectedModel,
          processingPath: analysis.routing.executionPath,
          timestamp: new Date()
        }
      };

      this.logger.info('Conversation processed successfully', {
        conversationId: request.conversationId,
        processingTime,
        creditsUsed: actualCost,
        model: selectedModel.selectedModel.id
      });

      return conversationResponse;

    } catch (error) {
      this.logger.error('Conversation processing failed', {
        conversationId: request.conversationId,
        error,
        processingTime: Date.now() - startTime
      });
      
      this.metrics.increment('ai_assistant.processing_errors');
      throw error;
    }
  }

  async initiateAgentTask(request: AgentTaskRequest): Promise<AgentTaskInitiation> {
    try {
      this.logger.info('Initiating agent task', {
        conversationId: request.conversationId,
        taskType: request.taskType,
        userId: request.userId
      });

      // Analyze task if not already done
      let classification: TaskClassification;
      if (!request.taskType) {
        const analysis = await this.analyzeTask(request);
        classification = analysis.classification;
      } else {
        classification = await this.taskClassifier.classifyTask(request);
      }

      // Route the task
      const routing = await this.taskRouter.routeTask(request, classification);

      // Reserve credits for the task
      const costEstimation = await this.estimateTaskCost(request);
      const reservationId = this.generateId();
      
      await this.costCalculator.reserveBudget(
        request.userId,
        costEstimation.estimatedCost,
        reservationId
      );

      // Create task initiation
      const taskId = this.generateId();
      const estimatedCompletion = new Date(Date.now() + routing.estimatedWaitTime * 1000);

      const initiation: AgentTaskInitiation = {
        taskId,
        status: TaskStatus.QUEUED,
        estimatedCompletion,
        creditsReserved: costEstimation.estimatedCost,
        progressTrackingUrl: `/api/v1/tasks/${taskId}/progress`,
        queuePosition: routing.queuePosition
      };

      // Store task for processing (in real implementation, this would trigger cloud function)
      await this.storeAgentTask(taskId, request, classification, routing, reservationId);

      this.metrics.increment('ai_assistant.agent_tasks_initiated', {
        taskType: classification.type.toString(),
        executionPath: routing.executionPath.toString()
      });

      this.logger.info('Agent task initiated successfully', {
        taskId,
        estimatedCompletion,
        creditsReserved: costEstimation.estimatedCost
      });

      return initiation;

    } catch (error) {
      this.logger.error('Agent task initiation failed', {
        conversationId: request.conversationId,
        error
      });
      
      this.metrics.increment('ai_assistant.agent_initiation_errors');
      throw error;
    }
  }

  // ============================================================================
  // Task Analysis
  // ============================================================================

  async analyzeTask(request: ConversationRequest): Promise<TaskAnalysisResult> {
    try {
      this.logger.debug('Analyzing task', { conversationId: request.conversationId });

      // Step 1: Classify the task
      const classification = await this.taskClassifier.classifyTask(request);

      // Step 2: Route the task
      const routing = await this.taskRouter.routeTask(request, classification);

      // Step 3: Get model recommendations
      const requirements = await this.taskClassifier.estimateResourceRequirements(classification);
      const availableModels = await this.modelManagement.getAvailableModels(
        this.getModelCategoryForTask(classification.type)
      );
      
      const modelRecommendations = [
        await this.userPreferences.selectOptimalModel(request.userId, requirements, availableModels)
      ];

      // Step 4: Estimate costs
      const costEstimation = await this.estimateTaskCost(request);

      // Step 5: Determine processing strategy
      const processingStrategy = this.determineProcessingStrategy(classification, routing);

      const analysis: TaskAnalysisResult = {
        classification,
        routing,
        modelRecommendations,
        costEstimation,
        processingStrategy
      };

      this.logger.debug('Task analysis completed', {
        conversationId: request.conversationId,
        taskType: classification.type,
        strategy: routing.strategy
      });

      return analysis;

    } catch (error) {
      this.logger.error('Task analysis failed', {
        conversationId: request.conversationId,
        error
      });
      throw error;
    }
  }

  async estimateTaskCost(request: ConversationRequest): Promise<CostEstimation> {
    try {
      const classification = await this.taskClassifier.classifyTask(request);
      const requirements = await this.taskClassifier.estimateResourceRequirements(classification);
      
      // Get user's preferred model for this task type
      const availableModels = await this.modelManagement.getAvailableModels(
        this.getModelCategoryForTask(classification.type)
      );
      
      const modelSelection = await this.userPreferences.selectOptimalModel(
        request.userId, 
        requirements, 
        availableModels
      );

      // Calculate base cost
      const baseCost = await this.taskClassifier.calculateCreditCost(
        classification, 
        modelSelection.selectedModel
      );

      // Calculate cost range
      const costRange = {
        minimum: Math.round(baseCost * 0.8),
        maximum: Math.round(baseCost * 1.5)
      };

      // Identify cost factors
      const factors: CostFactor[] = [
        {
          name: 'Task Complexity',
          impact: this.getComplexityImpact(classification.complexity),
          description: `${classification.complexity} complexity adds processing overhead`
        },
        {
          name: 'Model Quality',
          impact: modelSelection.selectedModel.performance.qualityScore / 10,
          description: `Higher quality model increases cost`
        }
      ];

      // Generate alternatives
      const alternatives = await this.generateCostAlternatives(
        request.userId,
        classification,
        modelSelection
      );

      return {
        estimatedCost: baseCost,
        costRange,
        factors,
        alternatives
      };

    } catch (error) {
      this.logger.error('Cost estimation failed', {
        conversationId: request.conversationId,
        error
      });
      throw error;
    }
  }

  // ============================================================================
  // Model Selection
  // ============================================================================

  async selectOptimalModel(userId: string, requirements: ModelRequirements): Promise<ModelSelection> {
    const availableModels = await this.modelManagement.getAvailableModels(
      this.getModelCategoryForTask(requirements.taskType)
    );
    
    return this.userPreferences.selectOptimalModel(userId, requirements, availableModels);
  }

  async getRecommendedModels(userId: string, taskType: TaskType): Promise<AIModel[]> {
    const availableModels = await this.modelManagement.getAvailableModels(
      this.getModelCategoryForTask(taskType)
    );
    
    const recommendations = await this.userPreferences.generateModelRecommendations(userId, taskType);
    
    return recommendations.recommendations
      .slice(0, 5)
      .map(rec => availableModels.find(model => model.id === rec.modelId))
      .filter(model => model !== undefined) as AIModel[];
  }

  // ============================================================================
  // System Status
  // ============================================================================

  async getSystemStatus(): Promise<SystemStatus> {
    try {
      const systemLoad = await this.taskRouter.checkSystemLoad();
      const modelHealth = await this.modelManagement.checkAllModelsHealth();
      const capacity = await this.getProcessingCapacity();

      let overallHealth = HealthStatus.HEALTHY;
      if (systemLoad.cpuUsage > 90 || systemLoad.errorRate > 0.1) {
        overallHealth = HealthStatus.UNHEALTHY;
      } else if (systemLoad.cpuUsage > 70 || systemLoad.errorRate > 0.05) {
        overallHealth = HealthStatus.DEGRADED;
      }

      return {
        overallHealth,
        processingCapacity: capacity,
        activeModels: modelHealth.healthyModels,
        queueLength: systemLoad.queueLength,
        averageResponseTime: systemLoad.averageResponseTime,
        errorRate: systemLoad.errorRate,
        lastUpdated: new Date()
      };

    } catch (error) {
      this.logger.error('Failed to get system status', { error });
      throw error;
    }
  }

  async getProcessingCapacity(): Promise<ProcessingCapacity> {
    // In a real implementation, this would check actual capacity metrics
    return {
      synchronousSlots: {
        total: 100,
        available: 75,
        utilizationPercentage: 25,
        averageWaitTime: 2
      },
      asynchronousSlots: {
        total: 50,
        available: 30,
        utilizationPercentage: 40,
        averageWaitTime: 30
      },
      agentFunctions: {
        total: 20,
        available: 15,
        utilizationPercentage: 25,
        averageWaitTime: 60
      },
      imageGeneration: {
        total: 10,
        available: 8,
        utilizationPercentage: 20,
        averageWaitTime: 45
      }
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private getModelCategoryForTask(taskType: TaskType): any {
    // This would map to actual ModelCategory enum from types
    const mapping = {
      [TaskType.QUICK_CHAT]: 'text_generation',
      [TaskType.LONG_FORM_WRITING]: 'text_generation',
      [TaskType.CODE_GENERATION]: 'text_generation',
      [TaskType.RESEARCH_TASK]: 'text_generation',
      [TaskType.DATA_ANALYSIS]: 'text_generation',
      [TaskType.MULTI_STEP_WORKFLOW]: 'text_generation',
      [TaskType.IMAGE_GENERATION]: 'image_generation',
      [TaskType.VISION_ANALYSIS]: 'vision_model'
    };
    
    return mapping[taskType] || 'text_generation';
  }

  private determineProcessingStrategy(classification: TaskClassification, routing: TaskRoutingResult): ProcessingStrategy {
    let approach = ProcessingApproach.IMMEDIATE;
    let qualityLevel = QualityLevel.STANDARD;

    if (routing.strategy === RoutingStrategy.QUEUED) {
      approach = ProcessingApproach.QUEUED;
    } else if (routing.strategy === RoutingStrategy.ASYNCHRONOUS) {
      approach = ProcessingApproach.PRIORITY;
      qualityLevel = QualityLevel.HIGH;
    }

    return {
      approach,
      estimatedDuration: routing.estimatedWaitTime,
      qualityLevel,
      resourceRequirements: {
        computeUnits: this.calculateComputeUnits(classification),
        memoryMb: this.calculateMemoryRequirement(classification),
        estimatedTokens: this.calculateTokenRequirement(classification),
        gpuRequired: this.requiresGpu(classification.type)
      }
    };
  }

  private getComplexityImpact(complexity: any): number {
    const impacts = {
      'low': 0.1,
      'medium': 0.3,
      'high': 0.6
    };
    return impacts[complexity] || 0.2;
  }

  private async generateCostAlternatives(userId: string, classification: TaskClassification, currentSelection: ModelSelection): Promise<CostAlternative[]> {
    // Generate cost-saving alternatives
    return [
      {
        description: 'Use faster, lower-cost model',
        costSavings: 0.3,
        qualityImpact: -0.1,
        processingTimeImpact: -0.2
      },
      {
        description: 'Queue for off-peak processing',
        costSavings: 0.15,
        qualityImpact: 0,
        processingTimeImpact: 2.0
      }
    ];
  }

  private async generateResponse(request: ConversationRequest, model: AIModel): Promise<{ content: string; quality: number }> {
    // Placeholder for actual AI model integration
    // In real implementation, this would call the selected model
    return {
      content: `This is a simulated response from ${model.name} for the message: "${request.message.substring(0, 100)}..."`,
      quality: model.performance.qualityScore / 10
    };
  }

  private async calculateActualCost(response: { content: string; quality: number }, model: AIModel): Promise<number> {
    // Calculate actual cost based on response
    const outputTokens = Math.ceil(response.content.length / 4); // Rough token estimation
    return Math.ceil(outputTokens * (model.pricing.costPer1kOutputTokens || 0.01) / 1000 * 100); // Convert to credits
  }

  private async deductCredits(userId: string, amount: number): Promise<void> {
    // Placeholder for credit deduction
    this.logger.info('Credits deducted', { userId, amount });
  }

  private async storeAgentTask(taskId: string, request: AgentTaskRequest, classification: TaskClassification, routing: TaskRoutingResult, reservationId: string): Promise<void> {
    // Placeholder for storing agent task
    this.logger.info('Agent task stored', { taskId, taskType: classification.type });
  }

  private recordProcessingMetrics(analysis: TaskAnalysisResult, processingTime: number, actualCost: number): void {
    this.metrics.histogram('ai_assistant.processing_time', processingTime);
    this.metrics.histogram('ai_assistant.actual_cost', actualCost);
    this.metrics.increment('ai_assistant.tasks_processed', {
      taskType: analysis.classification.type.toString(),
      strategy: analysis.routing.strategy.toString()
    });
  }

  private calculateComputeUnits(classification: TaskClassification): number {
    const baseUnits = {
      'quick_chat': 1,
      'image_generation': 5,
      'research_task': 3,
      'code_generation': 2,
      'data_analysis': 4,
      'long_form_writing': 2,
      'multi_step_workflow': 6,
      'vision_analysis': 3
    };
    
    return baseUnits[classification.type] || 2;
  }

  private calculateMemoryRequirement(classification: TaskClassification): number {
    const baseMemory = {
      'quick_chat': 512,
      'image_generation': 2048,
      'research_task': 1024,
      'code_generation': 1024,
      'data_analysis': 1536,
      'long_form_writing': 768,
      'multi_step_workflow': 2048,
      'vision_analysis': 1536
    };
    
    return baseMemory[classification.type] || 1024;
  }

  private calculateTokenRequirement(classification: TaskClassification): number {
    const baseTokens = {
      'quick_chat': 500,
      'image_generation': 100,
      'research_task': 2000,
      'code_generation': 1500,
      'data_analysis': 2500,
      'long_form_writing': 3000,
      'multi_step_workflow': 4000,
      'vision_analysis': 1000
    };
    
    return baseTokens[classification.type] || 1000;
  }

  private requiresGpu(taskType: TaskType): boolean {
    return taskType === TaskType.IMAGE_GENERATION || taskType === TaskType.VISION_ANALYSIS;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}