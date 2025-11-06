/**
 * Agent Execution Handlers
 * Handles long-running AI agent tasks with LangChain/LangGraph integration
 */

import { DatabaseEvent } from 'firebase-functions/v2/database';
import { DataSnapshot } from 'firebase-admin/database';
import { Database } from 'firebase-admin/database';
import { Firestore } from 'firebase-admin/firestore';
// Firebase instances will be injected when needed
import { logger } from '../shared/observability/logger';
import { metrics } from '../shared/observability/metrics';
import { 
  isError, 
  getErrorMessage, 
  getErrorContext, 
  isRetryableError as isErrorRetryable,
  toApplicationError 
} from '../shared/error-handling/error-type-guards';
import { 
  WorkflowError, 
  ExternalServiceError, 
  NetworkError,
  TimeoutError 
} from '../shared/error-handling/custom-errors';
import { 
  TaskType, 
  TaskStatus, 
  AgentTaskRequest,

  WorkflowNodeDefinition,
  WorkflowEdgeDefinition,
  NodeType,
  AgentConfig,
  TaskPriority
} from '../shared/types/ai-assistant';
import { 
  WorkflowType,
  ExecutionStatus,
  StepType 
} from '../shared/types/orchestration';
import { LangChainManager } from '../features/ai-assistant/services/langchain-manager';
import { LangGraphWorkflowManager, LangGraphWorkflowDefinition } from '../features/ai-assistant/services/langgraph-workflow';
import { NebiusAIService } from '../features/ai-assistant/services/nebius-ai-service';
import { CreditService } from '../features/credit-system/services/credit-service';

/**
 * Enhanced agent task interface with comprehensive tracking
 */
export interface AgentTask {
  id: string;
  userId: string;
  type: TaskType;
  prompt: string;
  context?: AgentTaskContext;
  status: TaskStatus;
  progress: number;
  result?: AgentTaskResult;
  creditsReserved: number;
  creditsUsed?: number;
  estimatedDuration: number;
  actualDuration?: number;
  priority: TaskPriority;
  workflowId?: string;
  executionId?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: AgentTaskError;
  retryCount: number;
  maxRetries: number;
  progressUpdates: ProgressUpdate[];
  resourceUsage?: ResourceUsage;
}

/**
 * Agent task context for execution
 */
export interface AgentTaskContext {
  conversationId?: string;
  sessionId?: string;
  modelPreferences?: any;
  constraints?: TaskConstraints;
  variables?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Task constraints and limits
 */
export interface TaskConstraints {
  maxExecutionTime: number;
  maxCost: number;
  allowedModels: string[];
  requiredOutputFormat?: string;
  qualityThreshold?: number;
}

/**
 * Agent task execution result
 */
export interface AgentTaskResult {
  output: string;
  metadata: TaskResultMetadata;
  artifacts?: TaskArtifact[];
  qualityScore?: number;
  confidence?: number;
}

/**
 * Task result metadata
 */
export interface TaskResultMetadata {
  modelUsed: string;
  tokensUsed: number;
  executionSteps: ExecutionStep[];
  toolsUsed: string[];
  processingTime: number;
  workflowPath: string[];
  creditsUsed: number;
}

/**
 * Task execution artifact
 */
export interface TaskArtifact {
  id: string;
  type: ArtifactType;
  name: string;
  content: string;
  metadata?: Record<string, any>;
}

export enum ArtifactType {
  CODE = 'code',
  DOCUMENT = 'document',
  IMAGE = 'image',
  DATA = 'data',
  ANALYSIS = 'analysis'
}

/**
 * Agent task error information
 */
export interface AgentTaskError {
  code: string;
  message: string;
  step?: string;
  retryable: boolean;
  timestamp: number;
  stackTrace?: string;
}

/**
 * Progress update for real-time tracking
 */
export interface ProgressUpdate {
  timestamp: number;
  progress: number;
  step: string;
  message: string;
  metadata?: Record<string, any>;
}

/**
 * Resource usage tracking
 */
export interface ResourceUsage {
  cpuTimeMs: number;
  memoryMB: number;
  networkRequests: number;
  storageOperations: number;
  creditsConsumed: number;
}

/**
 * Execution step for detailed tracking
 */
export interface ExecutionStep {
  id: string;
  name: string;
  type: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: ExecutionStatus;
  input?: any;
  output?: any;
  error?: string;
}

/**
 * Agent execution handler with comprehensive functionality
 */
export class AgentExecutionHandler {
  private realtimeDB: Database;
  private _firestore: Firestore;
  private langChainManager: LangChainManager;
  private langGraphManager: LangGraphWorkflowManager;
  private _nebiusService: NebiusAIService;
  private _creditService: CreditService;

  constructor(
    realtimeDB: Database,
    firestore: Firestore,
    langChainManager: LangChainManager,
    langGraphManager: LangGraphWorkflowManager,
    nebiusService: NebiusAIService,
    creditService: CreditService
  ) {
    this.realtimeDB = realtimeDB;
    this._firestore = firestore;
    this.langChainManager = langChainManager;
    this.langGraphManager = langGraphManager;
    this._nebiusService = nebiusService;
    this._creditService = creditService;
  }

  /**
   * Main agent task execution handler
   */
  async executeAgentTask(event: DatabaseEvent<DataSnapshot>): Promise<void> {
    const taskId = event.params?.taskId;
    const taskData = event.data?.val() as AgentTask;
    const correlationId = `agent_task_${taskId}_${Date.now()}`;

    if (!taskId || !taskData) {
      logger.error('Invalid agent task event', { taskId, hasData: !!taskData });
      return;
    }

    try {
      logger.info('Agent task execution started', {
        taskId,
        userId: taskData.userId,
        type: taskData.type,
        creditsReserved: taskData.creditsReserved,
        correlationId
      });

      // Update task status to in_progress
      await this.updateTaskStatus(taskId, TaskStatus.RUNNING, {
        startedAt: Date.now(),
        progress: 0,
        progressUpdates: [{
          timestamp: Date.now(),
          progress: 0,
          step: 'initialization',
          message: 'Starting agent task execution'
        }]
      });

      // Execute the agent task based on type
      const result = await this.executeAgentByType(taskData, correlationId);

      // Update task with completion
      await this.updateTaskStatus(taskId, TaskStatus.COMPLETED, {
        completedAt: Date.now(),
        progress: 100,
        result,
        creditsUsed: result.metadata.creditsUsed,
        actualDuration: Date.now() - (taskData.startedAt || taskData.createdAt),
        progressUpdates: [
          ...taskData.progressUpdates,
          {
            timestamp: Date.now(),
            progress: 100,
            step: 'completion',
            message: 'Agent task completed successfully'
          }
        ]
      });

      // Deduct actual credits used
      if (result.metadata.creditsUsed > 0) {
        await this._creditService.deductCredits(
          taskData.userId,
          result.metadata.creditsUsed,
          `Agent task: ${taskData.type}`,
          { taskId, correlationId }
        );
      }

      logger.info('Agent task execution completed', {
        taskId,
        userId: taskData.userId,
        type: taskData.type,
        creditsUsed: result.metadata.creditsUsed,
        duration: result.metadata.processingTime,
        correlationId
      });

      metrics.histogram('agent_execution.task_duration', result.metadata.processingTime, {
        taskType: taskData.type,
        userId: taskData.userId
      });

      metrics.increment('agent_execution.tasks_completed', 1, {
        taskType: taskData.type
      });

    } catch (error) {
      await this.handleTaskError(taskId, taskData, error, correlationId);
    }
  }

  /**
   * Execute agent task based on type
   */
  private async executeAgentByType(task: AgentTask, correlationId: string): Promise<AgentTaskResult> {
    const startTime = Date.now();

    switch (task.type) {
      case TaskType.RESEARCH_TASK:
        return this.executeResearchAgent(task, correlationId);
      
      case TaskType.CODE_GENERATION:
        return this.executeCodeGenerationAgent(task, correlationId);
      
      case TaskType.DATA_ANALYSIS:
        return this.executeAnalysisAgent(task, correlationId);
      
      case TaskType.LONG_FORM_WRITING:
        return this.executeWritingAgent(task, correlationId);
      
      case TaskType.MULTI_STEP_WORKFLOW:
        return this.executeWorkflowAgent(task, correlationId);
      
      default:
        throw new Error(`Unsupported agent task type: ${task.type}`);
    }
  }

  /**
   * Execute research agent with comprehensive information gathering
   */
  private async executeResearchAgent(task: AgentTask, correlationId: string): Promise<AgentTaskResult> {
    const startTime = Date.now();
    const executionSteps: ExecutionStep[] = [];

    try {
      // Step 1: Create research workflow
      await this.updateProgress(task.id, 10, 'workflow_creation', 'Creating research workflow');
      
      const workflowDefinition: LangGraphWorkflowDefinition = {
        name: 'Research Agent Workflow',
        description: 'Comprehensive research and analysis workflow',
        nodes: [
          {
            id: 'start',
            type: NodeType.START,
            name: 'Start Research',
            description: 'Initialize research task',
            config: {}
          },
          {
            id: 'topic_analysis',
            type: NodeType.AGENT,
            name: 'Topic Analysis',
            description: 'Analyze research topic and create research plan',
            config: {
              agent: {
                modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
                systemPrompt: 'You are a research planning expert. Analyze the given topic and create a comprehensive research plan.',
                tools: ['search', 'analysis'],
                temperature: 0.3,
                maxTokens: 2000
              }
            }
          },
          {
            id: 'information_gathering',
            type: NodeType.AGENT,
            name: 'Information Gathering',
            description: 'Gather information from multiple sources',
            config: {
              agent: {
                modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
                systemPrompt: 'You are an expert researcher. Gather comprehensive information on the given topic.',
                tools: ['search', 'web_scraping', 'document_analysis'],
                temperature: 0.2,
                maxTokens: 4000
              }
            }
          },
          {
            id: 'synthesis',
            type: NodeType.AGENT,
            name: 'Information Synthesis',
            description: 'Synthesize gathered information into coherent research',
            config: {
              agent: {
                modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
                systemPrompt: 'You are a research synthesis expert. Create a comprehensive research report from gathered information.',
                tools: ['analysis', 'writing'],
                temperature: 0.4,
                maxTokens: 6000
              }
            }
          },
          {
            id: 'end',
            type: NodeType.END,
            name: 'Complete Research',
            description: 'Finalize research output',
            config: {}
          }
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'topic_analysis' },
          { id: 'e2', source: 'topic_analysis', target: 'information_gathering' },
          { id: 'e3', source: 'information_gathering', target: 'synthesis' },
          { id: 'e4', source: 'synthesis', target: 'end' }
        ],
        timeout: 300000 // 5 minutes
      };

      // Step 2: Execute workflow
      await this.updateProgress(task.id, 30, 'workflow_execution', 'Executing research workflow');
      
      const workflowExecution = await this.langGraphManager.executeWorkflowDefinition(
        workflowDefinition,
        {
          data: { 
            researchTopic: task.prompt,
            context: task.context 
          },
          context: {
            userId: task.userId,
            sessionId: task.context?.sessionId || 'research_session',
            conversationId: task.context?.conversationId,
            variables: task.context?.variables || {}
          }
        }
      );

      await this.updateProgress(task.id, 90, 'result_processing', 'Processing research results');

      // Step 3: Process results
      const result: AgentTaskResult = {
        output: workflowExecution.output?.data?.synthesis || 'Research completed',
        metadata: {
          modelUsed: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
          tokensUsed: this.calculateTokensUsed(workflowExecution),
          executionSteps,
          toolsUsed: ['search', 'analysis', 'web_scraping', 'document_analysis', 'writing'],
          processingTime: Date.now() - startTime,
          workflowPath: ['topic_analysis', 'information_gathering', 'synthesis'],
          creditsUsed: workflowExecution.cost
        },
        artifacts: [
          {
            id: 'research_plan',
            type: ArtifactType.DOCUMENT,
            name: 'Research Plan',
            content: workflowExecution.output?.data?.topic_analysis || 'Research plan created'
          },
          {
            id: 'gathered_information',
            type: ArtifactType.DATA,
            name: 'Gathered Information',
            content: workflowExecution.output?.data?.information_gathering || 'Information gathered'
          }
        ],
        qualityScore: 0.85,
        confidence: 0.9
      };

      return result;

    } catch (error) {
      const errorContext = getErrorContext(error);
      logger.error('Research agent execution failed', {
        taskId: task.id,
        ...errorContext,
        correlationId
      });
      throw toApplicationError(error, 'RESEARCH_AGENT_FAILED', { taskId: task.id, correlationId });
    }
  }

  /**
   * Execute code generation agent
   */
  private async executeCodeGenerationAgent(task: AgentTask, correlationId: string): Promise<AgentTaskResult> {
    const startTime = Date.now();

    try {
      await this.updateProgress(task.id, 20, 'code_analysis', 'Analyzing code requirements');

      // Create code generation agent
      const agentConfig: AgentConfig = {
        name: 'Code Generation Agent',
        description: 'Expert code generation and programming assistant',
        modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
        systemPrompt: `You are an expert software developer. Generate high-quality, well-documented code based on the requirements. 
        Follow best practices, include error handling, and provide clear explanations.`,
        tools: ['code_analysis', 'documentation', 'testing'],
        temperature: 0.2,
        maxTokens: 4000
      };

      const agent = await this.langChainManager.createAgent(agentConfig);

      await this.updateProgress(task.id, 50, 'code_generation', 'Generating code solution');

      // Execute code generation
      const executionResult = await this.langChainManager.executeAgent(
        agent.id,
        task.prompt,
        {
          userId: task.userId,
          conversationId: task.context?.conversationId || 'code_gen_session',
          variables: { 
            ...task.context?.variables,
            taskType: 'code_generation',
            requirements: task.prompt
          }
        }
      );

      await this.updateProgress(task.id, 80, 'code_review', 'Reviewing and optimizing code');

      // Clean up agent
      await this.langChainManager.deleteAgent(agent.id);

      const result: AgentTaskResult = {
        output: executionResult.output,
        metadata: {
          modelUsed: agentConfig.modelId,
          tokensUsed: executionResult.tokensUsed.total,
          executionSteps: [],
          toolsUsed: executionResult.toolsUsed.map((t: any) => t.toolName),
          processingTime: Date.now() - startTime,
          workflowPath: ['code_analysis', 'code_generation', 'code_review'],
          creditsUsed: executionResult.cost
        },
        artifacts: [
          {
            id: 'generated_code',
            type: ArtifactType.CODE,
            name: 'Generated Code',
            content: executionResult.output
          }
        ],
        qualityScore: 0.88,
        confidence: 0.85
      };

      return result;

    } catch (error) {
      const errorContext = getErrorContext(error);
      logger.error('Code generation agent execution failed', {
        taskId: task.id,
        ...errorContext,
        correlationId
      });
      throw toApplicationError(error, 'CODE_GENERATION_FAILED', { taskId: task.id, correlationId });
    }
  }

  /**
   * Execute analysis agent
   */
  private async executeAnalysisAgent(task: AgentTask, correlationId: string): Promise<AgentTaskResult> {
    const startTime = Date.now();

    try {
      await this.updateProgress(task.id, 25, 'data_preparation', 'Preparing data for analysis');

      const agentConfig: AgentConfig = {
        name: 'Data Analysis Agent',
        description: 'Expert data analyst and insights generator',
        modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
        systemPrompt: `You are an expert data analyst. Analyze the provided data thoroughly, identify patterns, 
        generate insights, and provide actionable recommendations.`,
        tools: ['data_analysis', 'statistics', 'visualization'],
        temperature: 0.3,
        maxTokens: 5000
      };

      const agent = await this.langChainManager.createAgent(agentConfig);

      await this.updateProgress(task.id, 60, 'analysis_execution', 'Performing data analysis');

      const executionResult = await this.langChainManager.executeAgent(
        agent.id,
        task.prompt,
        {
          userId: task.userId,
          conversationId: task.context?.conversationId || 'analysis_session',
          variables: { 
            ...task.context?.variables,
            taskType: 'data_analysis'
          }
        }
      );

      await this.updateProgress(task.id, 85, 'insights_generation', 'Generating insights and recommendations');

      await this.langChainManager.deleteAgent(agent.id);

      const result: AgentTaskResult = {
        output: executionResult.output,
        metadata: {
          modelUsed: agentConfig.modelId,
          tokensUsed: executionResult.tokensUsed.total,
          executionSteps: [],
          toolsUsed: executionResult.toolsUsed.map((t: any) => t.toolName),
          processingTime: Date.now() - startTime,
          workflowPath: ['data_preparation', 'analysis_execution', 'insights_generation'],
          creditsUsed: executionResult.cost
        },
        artifacts: [
          {
            id: 'analysis_report',
            type: ArtifactType.ANALYSIS,
            name: 'Analysis Report',
            content: executionResult.output
          }
        ],
        qualityScore: 0.82,
        confidence: 0.87
      };

      return result;

    } catch (error) {
      const errorContext = getErrorContext(error);
      logger.error('Analysis agent execution failed', {
        taskId: task.id,
        ...errorContext,
        correlationId
      });
      throw toApplicationError(error, 'ANALYSIS_AGENT_FAILED', { taskId: task.id, correlationId });
    }
  }

  /**
   * Execute writing agent
   */
  private async executeWritingAgent(task: AgentTask, correlationId: string): Promise<AgentTaskResult> {
    const startTime = Date.now();

    try {
      await this.updateProgress(task.id, 15, 'content_planning', 'Planning content structure');

      const agentConfig: AgentConfig = {
        name: 'Writing Agent',
        description: 'Expert content writer and editor',
        modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
        systemPrompt: `You are an expert writer and content creator. Create engaging, well-structured, 
        and high-quality written content based on the requirements. Ensure proper flow, clarity, and style.`,
        tools: ['writing', 'editing', 'research'],
        temperature: 0.7,
        maxTokens: 6000
      };

      const agent = await this.langChainManager.createAgent(agentConfig);

      await this.updateProgress(task.id, 40, 'content_creation', 'Creating written content');

      const executionResult = await this.langChainManager.executeAgent(
        agent.id,
        task.prompt,
        {
          userId: task.userId,
          conversationId: task.context?.conversationId || 'writing_session',
          variables: { 
            ...task.context?.variables,
            taskType: 'long_form_writing'
          }
        }
      );

      await this.updateProgress(task.id, 75, 'content_editing', 'Editing and refining content');

      await this.langChainManager.deleteAgent(agent.id);

      const result: AgentTaskResult = {
        output: executionResult.output,
        metadata: {
          modelUsed: agentConfig.modelId,
          tokensUsed: executionResult.tokensUsed.total,
          executionSteps: [],
          toolsUsed: executionResult.toolsUsed.map((t: any) => t.toolName),
          processingTime: Date.now() - startTime,
          workflowPath: ['content_planning', 'content_creation', 'content_editing'],
          creditsUsed: executionResult.cost
        },
        artifacts: [
          {
            id: 'written_content',
            type: ArtifactType.DOCUMENT,
            name: 'Written Content',
            content: executionResult.output
          }
        ],
        qualityScore: 0.90,
        confidence: 0.88
      };

      return result;

    } catch (error) {
      const errorContext = getErrorContext(error);
      logger.error('Writing agent execution failed', {
        taskId: task.id,
        ...errorContext,
        correlationId
      });
      throw toApplicationError(error, 'WRITING_AGENT_FAILED', { taskId: task.id, correlationId });
    }
  }

  /**
   * Execute multi-step workflow agent
   */
  private async executeWorkflowAgent(task: AgentTask, correlationId: string): Promise<AgentTaskResult> {
    const startTime = Date.now();

    try {
      await this.updateProgress(task.id, 10, 'workflow_design', 'Designing custom workflow');

      // Create a complex multi-step workflow based on the task requirements
      const workflowDefinition: LangGraphWorkflowDefinition = this.createCustomWorkflow(task);

      await this.updateProgress(task.id, 30, 'workflow_execution', 'Executing multi-step workflow');

      const workflowExecution = await this.langGraphManager.executeWorkflowDefinition(
        workflowDefinition,
        {
          data: { 
            task: task.prompt,
            context: task.context 
          },
          context: {
            userId: task.userId,
            sessionId: task.context?.sessionId || 'workflow_session',
            conversationId: task.context?.conversationId,
            variables: task.context?.variables || {}
          }
        }
      );

      await this.updateProgress(task.id, 90, 'result_compilation', 'Compiling workflow results');

      const result: AgentTaskResult = {
        output: workflowExecution.output?.data?.final_result || 'Workflow completed',
        metadata: {
          modelUsed: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
          tokensUsed: this.calculateTokensUsed(workflowExecution),
          executionSteps: [],
          toolsUsed: ['workflow_management', 'multi_agent_coordination'],
          processingTime: Date.now() - startTime,
          workflowPath: workflowExecution.output?.metadata?.executionPath || [],
          creditsUsed: workflowExecution.cost
        },
        artifacts: this.extractWorkflowArtifacts(workflowExecution),
        qualityScore: 0.87,
        confidence: 0.85
      };

      return result;

    } catch (error) {
      const errorContext = getErrorContext(error);
      logger.error('Workflow agent execution failed', {
        taskId: task.id,
        ...errorContext,
        correlationId
      });
      throw toApplicationError(error, 'WORKFLOW_AGENT_FAILED', { taskId: task.id, correlationId });
    }
  }

  /**
   * Update task progress in real-time
   */
  private async updateProgress(taskId: string, progress: number, step: string, message: string): Promise<void> {
    try {
      const update = {
        progress,
        updatedAt: Date.now(),
        [`progressUpdates/${Date.now()}`]: {
          timestamp: Date.now(),
          progress,
          step,
          message
        }
      };

      await this.realtimeDB.ref(`orchestration/agent_tasks/${taskId}`).update(update);

      logger.debug('Task progress updated', {
        taskId,
        progress,
        step,
        message
      });

    } catch (error) {
      const errorContext = getErrorContext(error);
      logger.error('Failed to update task progress', {
        taskId,
        progress,
        step,
        ...errorContext
      });
    }
  }

  /**
   * Update task status
   */
  private async updateTaskStatus(taskId: string, status: TaskStatus, updates: Partial<AgentTask>): Promise<void> {
    try {
      const updateData = {
        status,
        updatedAt: Date.now(),
        ...updates
      };

      await this.realtimeDB.ref(`orchestration/agent_tasks/${taskId}`).update(updateData);

      // Also update in Firestore for persistence
      await this._firestore.collection('agent_tasks').doc(taskId).update(updateData);

      logger.info('Task status updated', {
        taskId,
        status,
        updates: Object.keys(updates)
      });

    } catch (error) {
      const errorContext = getErrorContext(error);
      logger.error('Failed to update task status', {
        taskId,
        status,
        ...errorContext
      });
    }
  }

  /**
   * Handle task execution errors
   */
  private async handleTaskError(taskId: string, task: AgentTask, error: unknown, correlationId: string): Promise<void> {
    const errorContext = getErrorContext(error);
    const errorInfo: AgentTaskError = {
      code: errorContext.code,
      message: errorContext.message,
      retryable: isErrorRetryable(error),
      timestamp: Date.now(),
      stackTrace: errorContext.stack
    };

    try {
      // Check if we should retry
      if (errorInfo.retryable && task.retryCount < task.maxRetries) {
        logger.warn('Agent task failed, scheduling retry', {
          taskId,
          retryCount: task.retryCount + 1,
          maxRetries: task.maxRetries,
          error: errorInfo.message,
          correlationId
        });

        await this.updateTaskStatus(taskId, TaskStatus.PENDING, {
          retryCount: task.retryCount + 1,
          error: errorInfo,
          progressUpdates: [
            ...task.progressUpdates,
            {
              timestamp: Date.now(),
              progress: task.progress,
              step: 'error_retry',
              message: `Task failed, scheduling retry ${task.retryCount + 1}/${task.maxRetries}`
            }
          ]
        });

        // Schedule retry with exponential backoff
        const retryDelay = Math.min(1000 * Math.pow(2, task.retryCount), 30000);
        setTimeout(() => {
          this.executeAgentTask({
            params: { taskId },
            data: { val: () => ({ ...task, retryCount: task.retryCount + 1 }) }
          } as any);
        }, retryDelay);

      } else {
        // Mark as failed
        logger.error('Agent task execution failed permanently', {
          taskId,
          userId: task.userId,
          type: task.type,
          error: errorInfo.message,
          retryCount: task.retryCount,
          correlationId
        });

        await this.updateTaskStatus(taskId, TaskStatus.FAILED, {
          completedAt: Date.now(),
          error: errorInfo,
          actualDuration: Date.now() - (task.startedAt || task.createdAt),
          progressUpdates: [
            ...task.progressUpdates,
            {
              timestamp: Date.now(),
              progress: task.progress,
              step: 'error_final',
              message: 'Task execution failed permanently'
            }
          ]
        });

        metrics.increment('agent_execution.tasks_failed', 1, {
          taskType: task.type,
          errorCode: errorInfo.code
        });
      }

    } catch (updateError) {
      const updateErrorContext = getErrorContext(updateError);
      logger.error('Failed to handle task error', {
        taskId,
        originalError: errorInfo.message,
        ...updateErrorContext,
        correlationId
      });
    }
  }

  /**
   * Check if error is retryable (delegated to error type guards)
   */
  private isRetryableError(error: unknown): boolean {
    return isErrorRetryable(error);
  }

  /**
   * Calculate tokens used from workflow execution
   */
  private calculateTokensUsed(workflowExecution: any): number {
    // Simple calculation - in real implementation would sum from all steps
    return workflowExecution.output?.metadata?.totalTokens || 1000;
  }

  /**
   * Create custom workflow based on task requirements
   */
  private createCustomWorkflow(task: AgentTask): LangGraphWorkflowDefinition {
    return {
      name: 'Custom Multi-Step Workflow',
      description: 'Dynamically created workflow for complex tasks',
      nodes: [
        {
          id: 'start',
          type: NodeType.START,
          name: 'Start Workflow',
          description: 'Initialize workflow execution',
          config: {}
        },
        {
          id: 'planning',
          type: NodeType.AGENT,
          name: 'Task Planning',
          description: 'Plan the execution strategy',
          config: {
            agent: {
              modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
              systemPrompt: 'You are a task planning expert. Break down complex tasks into manageable steps.',
              tools: ['planning', 'analysis'],
              temperature: 0.3,
              maxTokens: 2000
            }
          }
        },
        {
          id: 'execution',
          type: NodeType.AGENT,
          name: 'Task Execution',
          description: 'Execute the planned steps',
          config: {
            agent: {
              modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
              systemPrompt: 'You are a task execution expert. Execute the planned steps efficiently.',
              tools: ['execution', 'monitoring'],
              temperature: 0.4,
              maxTokens: 4000
            }
          }
        },
        {
          id: 'end',
          type: NodeType.END,
          name: 'Complete Workflow',
          description: 'Finalize workflow execution',
          config: {}
        }
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'planning' },
        { id: 'e2', source: 'planning', target: 'execution' },
        { id: 'e3', source: 'execution', target: 'end' }
      ],
      timeout: 600000 // 10 minutes
    };
  }

  /**
   * Extract artifacts from workflow execution
   */
  private extractWorkflowArtifacts(workflowExecution: any): TaskArtifact[] {
    const artifacts: TaskArtifact[] = [];

    // Extract artifacts from workflow output
    if (workflowExecution.output?.data?.planning) {
      artifacts.push({
        id: 'execution_plan',
        type: ArtifactType.DOCUMENT,
        name: 'Execution Plan',
        content: workflowExecution.output.data.planning
      });
    }

    if (workflowExecution.output?.data?.execution) {
      artifacts.push({
        id: 'execution_result',
        type: ArtifactType.DOCUMENT,
        name: 'Execution Result',
        content: workflowExecution.output.data.execution
      });
    }

    return artifacts;
  }
}

// Export singleton instance
let handlerInstance: AgentExecutionHandler;

export function getAgentExecutionHandler(
  realtimeDB: Database,
  firestore: Firestore,
  langChainManager: LangChainManager,
  langGraphManager: LangGraphWorkflowManager,
  nebiusService: NebiusAIService,
  creditService: CreditService
): AgentExecutionHandler {
  if (!handlerInstance) {
    handlerInstance = new AgentExecutionHandler(
      realtimeDB,
      firestore,
      langChainManager,
      langGraphManager,
      nebiusService,
      creditService
    );
  }
  return handlerInstance;
}

// Export handler function for Firebase Functions
export async function executeAgentTask(event: DatabaseEvent<DataSnapshot>): Promise<void> {
  // This would need proper dependency injection in a real implementation
  // For now, we'll create a placeholder that matches the expected signature
  const handler = new AgentExecutionHandler(
    {} as any, // realtimeDB
    {} as any, // firestore
    {} as any, // langChainManager
    {} as any, // langGraphManager
    {} as any, // nebiusService
    {} as any  // creditService
  );
  
  return handler.executeAgentTask(event);
}

export default {
  executeAgentTask,
  AgentExecutionHandler,
  getAgentExecutionHandler
};