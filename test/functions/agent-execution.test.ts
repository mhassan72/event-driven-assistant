/**
 * Agent Execution Integration Tests
 * Tests for long-running agent task execution and progress tracking
 */

import { Database } from 'firebase-admin/database';
import { Firestore } from 'firebase-admin/firestore';
import { AgentExecutionHandler, AgentTask } from '@/functions/agent-execution';
import { LangChainManager } from '@/features/ai-assistant/services/langchain-manager';
import { LangGraphWorkflowManager } from '@/features/ai-assistant/services/langgraph-workflow';
import { NebiusAIService } from '@/features/ai-assistant/services/nebius-ai-service';
import { CreditService } from '@/features/credit-system/services/credit-service';
import { TaskType, TaskStatus, TaskPriority } from '@/shared/types/ai-assistant';
import { IStructuredLogger } from '@/shared/observability/logger';
import { IMetricsCollector } from '@/shared/observability/metrics';

// Mock dependencies
const mockRealtimeDB = {
  ref: jest.fn().mockReturnThis(),
  once: jest.fn(),
  update: jest.fn(),
  set: jest.fn(),
  remove: jest.fn(),
  on: jest.fn(),
  off: jest.fn()
} as unknown as jest.Mocked<Database>;

const mockFirestore = {
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  update: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis()
} as unknown as jest.Mocked<Firestore>;

const mockLangChainManager = {
  createAgent: jest.fn(),
  executeAgent: jest.fn(),
  deleteAgent: jest.fn(),
  configureAgent: jest.fn(),
  getAgent: jest.fn()
} as unknown as jest.Mocked<LangChainManager>;

const mockLangGraphManager = {
  executeWorkflowDefinition: jest.fn(),
  createWorkflow: jest.fn(),
  getWorkflow: jest.fn(),
  validateWorkflow: jest.fn()
} as unknown as jest.Mocked<LangGraphWorkflowManager>;

const mockNebiusService = {
  createChatCompletion: jest.fn(),
  validateModelAccess: jest.fn(),
  getAvailableModels: jest.fn(),
  testConnection: jest.fn()
} as unknown as jest.Mocked<NebiusAIService>;

const mockCreditService = {
  deductCredits: jest.fn(),
  addCredits: jest.fn(),
  getBalance: jest.fn(),
  validateBalance: jest.fn()
} as unknown as jest.Mocked<CreditService>;

const mockLogger: jest.Mocked<IStructuredLogger> = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  logError: jest.fn()
};

const mockMetrics: jest.Mocked<IMetricsCollector> = {
  increment: jest.fn(),
  gauge: jest.fn(),
  histogram: jest.fn(),
  recordHttpRequest: jest.fn(),
  recordCreditOperation: jest.fn(),
  recordPayment: jest.fn(),
  getMetrics: jest.fn(),
  clearMetrics: jest.fn()
};

describe('Agent Execution Integration Tests', () => {
  let agentHandler: AgentExecutionHandler;

  beforeEach(() => {
    agentHandler = new AgentExecutionHandler(
      mockRealtimeDB,
      mockFirestore,
      mockLangChainManager,
      mockLangGraphManager,
      mockNebiusService,
      mockCreditService
    );

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock implementations
    mockRealtimeDB.ref.mockReturnValue({
      once: jest.fn().mockResolvedValue({ val: () => null }),
      update: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined)
    } as any);

    mockFirestore.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn().mockResolvedValue(undefined)
      })
    } as any);
  });

  describe('Research Agent Execution', () => {
    it('should execute research agent workflow successfully', async () => {
      // Setup test data
      const taskData: AgentTask = {
        id: 'research-task-1',
        userId: 'user-123',
        type: TaskType.RESEARCH_TASK,
        prompt: 'Research the latest developments in quantum computing',
        status: TaskStatus.PENDING,
        progress: 0,
        creditsReserved: 100,
        estimatedDuration: 300,
        priority: TaskPriority.NORMAL,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        progressUpdates: []
      };

      // Mock workflow execution
      mockLangGraphManager.executeWorkflowDefinition.mockResolvedValue({
        id: 'workflow-exec-1',
        workflowId: 'research-workflow',
        status: 'completed',
        output: {
          data: {
            synthesis: 'Comprehensive research on quantum computing developments...',
            topic_analysis: 'Research plan created',
            information_gathering: 'Information gathered from multiple sources'
          },
          metadata: {
            executionPath: ['topic_analysis', 'information_gathering', 'synthesis'],
            totalNodes: 4,
            successfulNodes: 4,
            failedNodes: 0,
            totalCost: 75,
            executionTime: 180000
          }
        },
        cost: 75,
        startTime: new Date(),
        endTime: new Date(),
        duration: 180000,
        executedNodes: []
      });

      // Mock credit deduction
      mockCreditService.deductCredits.mockResolvedValue({
        id: 'credit-txn-1',
        userId: 'user-123',
        type: 'deduction' as any,
        amount: 75,
        balanceBefore: 1000,
        balanceAfter: 925,
        reason: 'Agent task: research_task',
        timestamp: new Date(),
        metadata: { taskId: 'research-task-1' }
      });

      // Execute the agent task
      const event = {
        params: { taskId: 'research-task-1' },
        data: { val: () => taskData }
      } as any;

      await agentHandler.executeAgentTask(event);

      // Verify workflow execution
      expect(mockLangGraphManager.executeWorkflowDefinition).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Research Agent Workflow',
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: 'start', type: 'start' }),
            expect.objectContaining({ id: 'topic_analysis', type: 'agent' }),
            expect.objectContaining({ id: 'information_gathering', type: 'agent' }),
            expect.objectContaining({ id: 'synthesis', type: 'agent' }),
            expect.objectContaining({ id: 'end', type: 'end' })
          ])
        }),
        expect.objectContaining({
          data: {
            researchTopic: taskData.prompt,
            context: taskData.context
          }
        })
      );

      // Verify progress updates
      expect(mockRealtimeDB.ref).toHaveBeenCalledWith(
        `orchestration/agent_tasks/${taskData.id}`
      );

      // Verify credit deduction
      expect(mockCreditService.deductCredits).toHaveBeenCalledWith(
        'user-123',
        75,
        'Agent task: research_task',
        expect.objectContaining({
          taskId: 'research-task-1'
        })
      );

      // Verify metrics recording
      expect(mockMetrics.histogram).toHaveBeenCalledWith(
        'agent_execution.task_duration',
        expect.any(Number),
        expect.objectContaining({
          taskType: TaskType.RESEARCH_TASK,
          userId: 'user-123'
        })
      );

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'agent_execution.tasks_completed',
        1,
        expect.objectContaining({
          taskType: TaskType.RESEARCH_TASK
        })
      );
    });

    it('should handle research agent workflow failures with retry', async () => {
      const taskData: AgentTask = {
        id: 'research-task-2',
        userId: 'user-123',
        type: TaskType.RESEARCH_TASK,
        prompt: 'Research quantum computing',
        status: TaskStatus.PENDING,
        progress: 0,
        creditsReserved: 100,
        estimatedDuration: 300,
        priority: TaskPriority.NORMAL,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        progressUpdates: []
      };

      // Mock workflow failure
      mockLangGraphManager.executeWorkflowDefinition.mockRejectedValue(
        new Error('NETWORK_ERROR: Connection timeout')
      );

      const event = {
        params: { taskId: 'research-task-2' },
        data: { val: () => taskData }
      } as any;

      await agentHandler.executeAgentTask(event);

      // Verify error handling and retry scheduling
      expect(mockRealtimeDB.ref).toHaveBeenCalledWith(
        `orchestration/agent_tasks/${taskData.id}`
      );

      // Should update task status to pending for retry
      const updateCalls = (mockRealtimeDB.ref().update as jest.Mock).mock.calls;
      const retryUpdate = updateCalls.find(call => 
        call[0].status === TaskStatus.PENDING && call[0].retryCount === 1
      );
      expect(retryUpdate).toBeDefined();
    });
  });

  describe('Code Generation Agent Execution', () => {
    it('should execute code generation agent successfully', async () => {
      const taskData: AgentTask = {
        id: 'code-task-1',
        userId: 'user-456',
        type: TaskType.CODE_GENERATION,
        prompt: 'Write a Python function to calculate fibonacci numbers',
        status: TaskStatus.PENDING,
        progress: 0,
        creditsReserved: 50,
        estimatedDuration: 120,
        priority: TaskPriority.HIGH,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        progressUpdates: []
      };

      // Mock agent creation and execution
      mockLangChainManager.createAgent.mockResolvedValue({
        id: 'code-agent-1',
        name: 'Code Generation Agent',
        description: 'Expert code generation assistant',
        config: {
          name: 'Code Generation Agent',
          description: 'Expert code generation assistant',
          modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
          systemPrompt: expect.any(String),
          tools: ['code_analysis', 'documentation', 'testing'],
          temperature: 0.2,
          maxTokens: 4000
        },
        tools: [],
        memory: { shortTerm: [], longTerm: [], episodic: [], semantic: [] },
        status: 'active' as any,
        createdAt: new Date(),
        lastUsed: new Date(),
        usageStats: {
          totalExecutions: 0,
          totalTokensUsed: 0,
          averageLatency: 0,
          successRate: 1.0,
          lastExecution: new Date()
        }
      });

      mockLangChainManager.executeAgent.mockResolvedValue({
        id: 'exec-1',
        agentId: 'code-agent-1',
        input: taskData.prompt,
        output: `def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)`,
        success: true,
        executionTime: 5000,
        tokensUsed: { input: 50, output: 150, total: 200 },
        toolsUsed: [
          {
            toolId: 'code_analysis',
            toolName: 'Code Analysis',
            input: taskData.prompt,
            output: 'Analysis complete',
            executionTime: 1000,
            success: true
          }
        ],
        cost: 25,
        metadata: {
          startTime: new Date(),
          endTime: new Date(),
          model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
          temperature: 0.2,
          steps: [],
          reasoning: []
        }
      });

      mockLangChainManager.deleteAgent.mockResolvedValue();

      const event = {
        params: { taskId: 'code-task-1' },
        data: { val: () => taskData }
      } as any;

      await agentHandler.executeAgentTask(event);

      // Verify agent lifecycle
      expect(mockLangChainManager.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Code Generation Agent',
          modelId: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
          tools: ['code_analysis', 'documentation', 'testing']
        })
      );

      expect(mockLangChainManager.executeAgent).toHaveBeenCalledWith(
        'code-agent-1',
        taskData.prompt,
        expect.objectContaining({
          userId: taskData.userId,
          variables: expect.objectContaining({
            taskType: 'code_generation',
            requirements: taskData.prompt
          })
        })
      );

      expect(mockLangChainManager.deleteAgent).toHaveBeenCalledWith('code-agent-1');

      // Verify task completion
      const updateCalls = (mockRealtimeDB.ref().update as jest.Mock).mock.calls;
      const completionUpdate = updateCalls.find(call => 
        call[0].status === TaskStatus.COMPLETED
      );
      expect(completionUpdate).toBeDefined();
      expect(completionUpdate[0].result).toBeDefined();
      expect(completionUpdate[0].creditsUsed).toBe(25);
    });
  });

  describe('Multi-Step Workflow Agent Execution', () => {
    it('should execute complex multi-step workflow successfully', async () => {
      const taskData: AgentTask = {
        id: 'workflow-task-1',
        userId: 'user-789',
        type: TaskType.MULTI_STEP_WORKFLOW,
        prompt: 'Create a comprehensive project plan for a web application',
        status: TaskStatus.PENDING,
        progress: 0,
        creditsReserved: 200,
        estimatedDuration: 600,
        priority: TaskPriority.NORMAL,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        progressUpdates: []
      };

      // Mock workflow execution
      mockLangGraphManager.executeWorkflowDefinition.mockResolvedValue({
        id: 'workflow-exec-2',
        workflowId: 'custom-workflow',
        status: 'completed',
        output: {
          data: {
            final_result: 'Comprehensive project plan completed',
            planning: 'Project planning phase completed',
            execution: 'Project execution phase completed'
          },
          metadata: {
            executionPath: ['planning', 'execution'],
            totalNodes: 3,
            successfulNodes: 3,
            failedNodes: 0,
            totalCost: 150,
            executionTime: 480000
          }
        },
        cost: 150,
        startTime: new Date(),
        endTime: new Date(),
        duration: 480000,
        executedNodes: []
      });

      const event = {
        params: { taskId: 'workflow-task-1' },
        data: { val: () => taskData }
      } as any;

      await agentHandler.executeAgentTask(event);

      // Verify workflow creation and execution
      expect(mockLangGraphManager.executeWorkflowDefinition).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Custom Multi-Step Workflow',
          nodes: expect.arrayContaining([
            expect.objectContaining({ id: 'start', type: 'start' }),
            expect.objectContaining({ id: 'planning', type: 'agent' }),
            expect.objectContaining({ id: 'execution', type: 'agent' }),
            expect.objectContaining({ id: 'end', type: 'end' })
          ])
        }),
        expect.objectContaining({
          data: {
            task: taskData.prompt,
            context: taskData.context
          }
        })
      );

      // Verify progress tracking through multiple steps
      const updateCalls = (mockRealtimeDB.ref().update as jest.Mock).mock.calls;
      
      // Should have progress updates for workflow design, execution, and completion
      const progressUpdates = updateCalls.filter(call => 
        call[0].progress !== undefined
      );
      expect(progressUpdates.length).toBeGreaterThan(2);

      // Verify final completion
      const completionUpdate = updateCalls.find(call => 
        call[0].status === TaskStatus.COMPLETED && call[0].progress === 100
      );
      expect(completionUpdate).toBeDefined();
    });
  });

  describe('Agent Task Progress Tracking', () => {
    it('should track progress updates in real-time', async () => {
      const taskData: AgentTask = {
        id: 'progress-task-1',
        userId: 'user-progress',
        type: TaskType.DATA_ANALYSIS,
        prompt: 'Analyze sales data trends',
        status: TaskStatus.PENDING,
        progress: 0,
        creditsReserved: 75,
        estimatedDuration: 180,
        priority: TaskPriority.NORMAL,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        progressUpdates: []
      };

      // Mock successful agent execution
      mockLangChainManager.createAgent.mockResolvedValue({
        id: 'analysis-agent-1',
        name: 'Data Analysis Agent',
        description: 'Expert data analyst',
        config: {} as any,
        tools: [],
        memory: { shortTerm: [], longTerm: [], episodic: [], semantic: [] },
        status: 'active' as any,
        createdAt: new Date(),
        lastUsed: new Date(),
        usageStats: {
          totalExecutions: 0,
          totalTokensUsed: 0,
          averageLatency: 0,
          successRate: 1.0,
          lastExecution: new Date()
        }
      });

      mockLangChainManager.executeAgent.mockResolvedValue({
        id: 'exec-analysis-1',
        agentId: 'analysis-agent-1',
        input: taskData.prompt,
        output: 'Data analysis completed with insights',
        success: true,
        executionTime: 8000,
        tokensUsed: { input: 100, output: 300, total: 400 },
        toolsUsed: [],
        cost: 40,
        metadata: {
          startTime: new Date(),
          endTime: new Date(),
          model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
          temperature: 0.3,
          steps: [],
          reasoning: []
        }
      });

      mockLangChainManager.deleteAgent.mockResolvedValue();

      const event = {
        params: { taskId: 'progress-task-1' },
        data: { val: () => taskData }
      } as any;

      await agentHandler.executeAgentTask(event);

      // Verify progress tracking
      const updateCalls = (mockRealtimeDB.ref().update as jest.Mock).mock.calls;
      
      // Should have multiple progress updates
      const progressUpdates = updateCalls.filter(call => 
        call[0].progress !== undefined
      );
      expect(progressUpdates.length).toBeGreaterThanOrEqual(3);

      // Verify progress sequence
      const progressValues = progressUpdates.map(call => call[0].progress);
      expect(progressValues).toContain(0); // Start
      expect(progressValues).toContain(100); // Completion

      // Verify progress update structure
      const progressUpdate = updateCalls.find(call => 
        call[0].progressUpdates
      );
      expect(progressUpdate).toBeDefined();
    });
  });

  describe('Agent Task Error Handling and Recovery', () => {
    it('should handle retryable errors with exponential backoff', async () => {
      const taskData: AgentTask = {
        id: 'retry-task-1',
        userId: 'user-retry',
        type: TaskType.RESEARCH_TASK,
        prompt: 'Research with network issues',
        status: TaskStatus.PENDING,
        progress: 0,
        creditsReserved: 100,
        estimatedDuration: 300,
        priority: TaskPriority.NORMAL,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 1,
        maxRetries: 3,
        progressUpdates: []
      };

      // Mock retryable error
      mockLangGraphManager.executeWorkflowDefinition.mockRejectedValue(
        new Error('TIMEOUT_ERROR: Request timeout')
      );

      const event = {
        params: { taskId: 'retry-task-1' },
        data: { val: () => taskData }
      } as any;

      await agentHandler.executeAgentTask(event);

      // Verify retry scheduling
      const updateCalls = (mockRealtimeDB.ref().update as jest.Mock).mock.calls;
      const retryUpdate = updateCalls.find(call => 
        call[0].status === TaskStatus.PENDING && 
        call[0].retryCount === 2 &&
        call[0].error
      );
      expect(retryUpdate).toBeDefined();
      expect(retryUpdate[0].error.retryable).toBe(true);
    });

    it('should mark task as failed after max retries exceeded', async () => {
      const taskData: AgentTask = {
        id: 'failed-task-1',
        userId: 'user-failed',
        type: TaskType.CODE_GENERATION,
        prompt: 'Generate code with persistent errors',
        status: TaskStatus.PENDING,
        progress: 50,
        creditsReserved: 50,
        estimatedDuration: 120,
        priority: TaskPriority.NORMAL,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 3, // Already at max retries
        maxRetries: 3,
        progressUpdates: []
      };

      // Mock non-retryable error
      mockLangChainManager.createAgent.mockRejectedValue(
        new Error('INVALID_MODEL: Model not found')
      );

      const event = {
        params: { taskId: 'failed-task-1' },
        data: { val: () => taskData }
      } as any;

      await agentHandler.executeAgentTask(event);

      // Verify permanent failure
      const updateCalls = (mockRealtimeDB.ref().update as jest.Mock).mock.calls;
      const failureUpdate = updateCalls.find(call => 
        call[0].status === TaskStatus.FAILED
      );
      expect(failureUpdate).toBeDefined();
      expect(failureUpdate[0].error).toBeDefined();
      expect(failureUpdate[0].completedAt).toBeDefined();

      // Verify metrics
      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'agent_execution.tasks_failed',
        1,
        expect.objectContaining({
          taskType: TaskType.CODE_GENERATION
        })
      );
    });
  });

  describe('Resource Management and Cleanup', () => {
    it('should properly clean up resources after task completion', async () => {
      const taskData: AgentTask = {
        id: 'cleanup-task-1',
        userId: 'user-cleanup',
        type: TaskType.LONG_FORM_WRITING,
        prompt: 'Write a comprehensive article',
        status: TaskStatus.PENDING,
        progress: 0,
        creditsReserved: 80,
        estimatedDuration: 240,
        priority: TaskPriority.NORMAL,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        progressUpdates: []
      };

      // Mock successful execution
      mockLangChainManager.createAgent.mockResolvedValue({
        id: 'writing-agent-1',
        name: 'Writing Agent',
        description: 'Expert content writer',
        config: {} as any,
        tools: [],
        memory: { shortTerm: [], longTerm: [], episodic: [], semantic: [] },
        status: 'active' as any,
        createdAt: new Date(),
        lastUsed: new Date(),
        usageStats: {
          totalExecutions: 0,
          totalTokensUsed: 0,
          averageLatency: 0,
          successRate: 1.0,
          lastExecution: new Date()
        }
      });

      mockLangChainManager.executeAgent.mockResolvedValue({
        id: 'exec-writing-1',
        agentId: 'writing-agent-1',
        input: taskData.prompt,
        output: 'Comprehensive article written successfully',
        success: true,
        executionTime: 12000,
        tokensUsed: { input: 200, output: 800, total: 1000 },
        toolsUsed: [],
        cost: 60,
        metadata: {
          startTime: new Date(),
          endTime: new Date(),
          model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
          temperature: 0.7,
          steps: [],
          reasoning: []
        }
      });

      mockLangChainManager.deleteAgent.mockResolvedValue();

      const event = {
        params: { taskId: 'cleanup-task-1' },
        data: { val: () => taskData }
      } as any;

      await agentHandler.executeAgentTask(event);

      // Verify agent cleanup
      expect(mockLangChainManager.deleteAgent).toHaveBeenCalledWith('writing-agent-1');

      // Verify credit deduction
      expect(mockCreditService.deductCredits).toHaveBeenCalledWith(
        'user-cleanup',
        60,
        'Agent task: long_form_writing',
        expect.objectContaining({
          taskId: 'cleanup-task-1'
        })
      );

      // Verify task completion
      const updateCalls = (mockRealtimeDB.ref().update as jest.Mock).mock.calls;
      const completionUpdate = updateCalls.find(call => 
        call[0].status === TaskStatus.COMPLETED
      );
      expect(completionUpdate).toBeDefined();
      expect(completionUpdate[0].result).toBeDefined();
      expect(completionUpdate[0].result.artifacts).toBeDefined();
    });

    it('should handle cleanup failures gracefully', async () => {
      const taskData: AgentTask = {
        id: 'cleanup-fail-task-1',
        userId: 'user-cleanup-fail',
        type: TaskType.CODE_GENERATION,
        prompt: 'Generate code with cleanup issues',
        status: TaskStatus.PENDING,
        progress: 0,
        creditsReserved: 50,
        estimatedDuration: 120,
        priority: TaskPriority.NORMAL,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        progressUpdates: []
      };

      // Mock successful execution but failed cleanup
      mockLangChainManager.createAgent.mockResolvedValue({
        id: 'code-agent-cleanup-fail',
        name: 'Code Generation Agent',
        description: 'Expert code generation assistant',
        config: {} as any,
        tools: [],
        memory: { shortTerm: [], longTerm: [], episodic: [], semantic: [] },
        status: 'active' as any,
        createdAt: new Date(),
        lastUsed: new Date(),
        usageStats: {
          totalExecutions: 0,
          totalTokensUsed: 0,
          averageLatency: 0,
          successRate: 1.0,
          lastExecution: new Date()
        }
      });

      mockLangChainManager.executeAgent.mockResolvedValue({
        id: 'exec-cleanup-fail-1',
        agentId: 'code-agent-cleanup-fail',
        input: taskData.prompt,
        output: 'Code generated successfully',
        success: true,
        executionTime: 5000,
        tokensUsed: { input: 50, output: 150, total: 200 },
        toolsUsed: [],
        cost: 25,
        metadata: {
          startTime: new Date(),
          endTime: new Date(),
          model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
          temperature: 0.2,
          steps: [],
          reasoning: []
        }
      });

      // Mock cleanup failure
      mockLangChainManager.deleteAgent.mockRejectedValue(
        new Error('Agent cleanup failed')
      );

      const event = {
        params: { taskId: 'cleanup-fail-task-1' },
        data: { val: () => taskData }
      } as any;

      await agentHandler.executeAgentTask(event);

      // Verify task still completes despite cleanup failure
      const updateCalls = (mockRealtimeDB.ref().update as jest.Mock).mock.calls;
      const completionUpdate = updateCalls.find(call => 
        call[0].status === TaskStatus.COMPLETED
      );
      expect(completionUpdate).toBeDefined();

      // Verify cleanup was attempted
      expect(mockLangChainManager.deleteAgent).toHaveBeenCalledWith('code-agent-cleanup-fail');

      // Verify error was logged but didn't fail the task
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});