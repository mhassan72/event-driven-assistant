/**
 * Agent Workflow Manager Integration Tests
 * Tests for saga patterns, distributed agent operations, and recovery mechanisms
 */

import { Database } from 'firebase-admin/database';
import { Firestore } from 'firebase-admin/firestore';
import { 
  AgentWorkflowManager, 
  IAgentWorkflowManager,
  AgentSagaDefinition,
  AgentWorkflowRequest,
  AgentWorkflowType,
  WorkflowPriority,
  RecoveryStrategy,
  HealthLevel,
  AlertType,
  AlertSeverity
} from '@/features/ai-assistant/services/agent-workflow-manager';
import { 
  SagaStatus,
  CompensationStrategy,
  SagaStep,
  CompensationStep
} from '@/shared/types/orchestration';
import { 
  TaskType, 
  TaskStatus, 
  TaskPriority,
  AgentTaskRequest
} from '@/shared/types/ai-assistant';
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

describe('Agent Workflow Manager Integration Tests', () => {
  let workflowManager: IAgentWorkflowManager;

  beforeEach(() => {
    workflowManager = new AgentWorkflowManager(
      mockRealtimeDB,
      mockFirestore,
      mockLogger,
      mockMetrics
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

  describe('Saga Pattern Implementation', () => {
    it('should start and execute agent saga successfully', async () => {
      const sagaDefinition: AgentSagaDefinition = {
        id: 'research-saga-1',
        name: 'Research Agent Saga',
        agentType: TaskType.RESEARCH_TASK,
        steps: [
          {
            id: 'init',
            name: 'Initialize Agent',
            action: {
              type: 'agent_initialization',
              handler: 'initializeAgent',
              parameters: { agentType: 'research' }
            }
          },
          {
            id: 'allocate',
            name: 'Allocate Resources',
            action: {
              type: 'resource_allocation',
              handler: 'allocateResources',
              parameters: { cpu: 2, memory: 1024 }
            }
          },
          {
            id: 'execute',
            name: 'Execute Task',
            action: {
              type: 'task_execution',
              handler: 'executeTask',
              parameters: { timeout: 300000 }
            }
          }
        ],
        compensationSteps: [
          {
            id: 'cleanup',
            name: 'Cleanup Resources',
            action: {
              type: 'compensate',
              handler: 'cleanupResources',
              parameters: {}
            }
          }
        ],
        timeoutMs: 600000,
        retryPolicy: {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
          retryableErrors: ['NETWORK_ERROR', 'TIMEOUT_ERROR']
        },
        resourceRequirements: {
          maxExecutionTime: 600000,
          maxMemoryMB: 1024,
          maxCpuUnits: 2,
          maxCredits: 200,
          requiredTools: ['search', 'analysis'],
          requiredModels: ['meta-llama/Meta-Llama-3.1-8B-Instruct']
        },
        failureHandling: {
          maxRetries: 3,
          retryDelayMs: 2000,
          backoffMultiplier: 2,
          compensationStrategy: CompensationStrategy.ROLLBACK,
          escalationThreshold: 5,
          notificationChannels: ['email', 'slack']
        },
        monitoringConfig: {
          progressUpdateInterval: 5000,
          healthCheckInterval: 10000,
          performanceMetrics: ['latency', 'throughput', 'error_rate'],
          alertThresholds: {
            executionTimeWarning: 300000,
            executionTimeCritical: 500000,
            memoryUsageWarning: 512,
            memoryUsageCritical: 900,
            errorRateWarning: 0.1,
            errorRateCritical: 0.25
          }
        }
      };

      const sagaInstance = await workflowManager.startAgentSaga(sagaDefinition);

      expect(sagaInstance).toBeDefined();
      expect(sagaInstance.id).toBeDefined();
      expect(sagaInstance.status).toBe(SagaStatus.STARTED);
      expect(sagaInstance.definitionId).toBe(sagaDefinition.id);

      // Verify saga persistence
      expect(mockRealtimeDB.ref).toHaveBeenCalledWith(
        `orchestration/agent_sagas/${sagaInstance.id}`
      );

      // Verify metrics
      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'agent_workflow.sagas_started',
        1,
        expect.objectContaining({
          agentType: TaskType.RESEARCH_TASK
        })
      );

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting agent saga',
        expect.objectContaining({
          sagaId: sagaInstance.id,
          agentType: TaskType.RESEARCH_TASK,
          stepCount: 3
        })
      );
    });

    it('should handle saga step failures and trigger compensation', async () => {
      const sagaDefinition: AgentSagaDefinition = {
        id: 'failing-saga-1',
        name: 'Failing Agent Saga',
        agentType: TaskType.CODE_GENERATION,
        steps: [
          {
            id: 'init',
            name: 'Initialize Agent',
            action: {
              type: 'agent_initialization',
              handler: 'initializeAgent',
              parameters: {}
            }
          },
          {
            id: 'fail_step',
            name: 'Failing Step',
            action: {
              type: 'task_execution',
              handler: 'executeFailingTask',
              parameters: {}
            }
          }
        ],
        compensationSteps: [
          {
            id: 'rollback_init',
            name: 'Rollback Initialization',
            action: {
              type: 'compensate',
              handler: 'rollbackInit',
              parameters: {}
            }
          }
        ],
        timeoutMs: 300000,
        retryPolicy: {
          maxRetries: 1,
          initialDelayMs: 1000,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          retryableErrors: []
        },
        resourceRequirements: {
          maxExecutionTime: 300000,
          maxMemoryMB: 512,
          maxCpuUnits: 1,
          maxCredits: 100,
          requiredTools: ['code_analysis'],
          requiredModels: ['meta-llama/Meta-Llama-3.1-8B-Instruct']
        },
        failureHandling: {
          maxRetries: 1,
          retryDelayMs: 1000,
          backoffMultiplier: 2,
          compensationStrategy: CompensationStrategy.ROLLBACK,
          escalationThreshold: 2,
          notificationChannels: ['email']
        },
        monitoringConfig: {
          progressUpdateInterval: 5000,
          healthCheckInterval: 10000,
          performanceMetrics: ['latency', 'error_rate'],
          alertThresholds: {
            executionTimeWarning: 180000,
            executionTimeCritical: 250000,
            memoryUsageWarning: 256,
            memoryUsageCritical: 450,
            errorRateWarning: 0.05,
            errorRateCritical: 0.15
          }
        }
      };

      const sagaInstance = await workflowManager.startAgentSaga(sagaDefinition);

      // Simulate saga failure and compensation
      const compensationResult = await workflowManager.compensateAgentSaga(
        sagaInstance.id,
        'Step execution failed'
      );

      expect(compensationResult).toBeDefined();
      expect(compensationResult.sagaId).toBe(sagaInstance.id);
      expect(compensationResult.compensatedSteps).toContain('compensate_init');

      // Verify compensation metrics
      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'agent_workflow.sagas_compensated',
        1,
        expect.objectContaining({
          success: expect.any(String)
        })
      );
    });

    it('should continue saga execution after step completion', async () => {
      const sagaDefinition: AgentSagaDefinition = {
        id: 'continuing-saga-1',
        name: 'Continuing Agent Saga',
        agentType: TaskType.DATA_ANALYSIS,
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            action: {
              type: 'agent_initialization',
              handler: 'init',
              parameters: {}
            }
          },
          {
            id: 'step2',
            name: 'Step 2',
            action: {
              type: 'task_execution',
              handler: 'execute',
              parameters: {}
            }
          }
        ],
        compensationSteps: [],
        timeoutMs: 300000,
        retryPolicy: {
          maxRetries: 2,
          initialDelayMs: 1000,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          retryableErrors: ['NETWORK_ERROR']
        },
        resourceRequirements: {
          maxExecutionTime: 300000,
          maxMemoryMB: 512,
          maxCpuUnits: 1,
          maxCredits: 75,
          requiredTools: ['data_analysis'],
          requiredModels: ['meta-llama/Meta-Llama-3.1-8B-Instruct']
        },
        failureHandling: {
          maxRetries: 2,
          retryDelayMs: 1000,
          backoffMultiplier: 2,
          compensationStrategy: CompensationStrategy.ROLLBACK,
          escalationThreshold: 3,
          notificationChannels: ['email']
        },
        monitoringConfig: {
          progressUpdateInterval: 5000,
          healthCheckInterval: 10000,
          performanceMetrics: ['latency'],
          alertThresholds: {
            executionTimeWarning: 180000,
            executionTimeCritical: 250000,
            memoryUsageWarning: 256,
            memoryUsageCritical: 450,
            errorRateWarning: 0.05,
            errorRateCritical: 0.15
          }
        }
      };

      const sagaInstance = await workflowManager.startAgentSaga(sagaDefinition);

      // Simulate step completion event
      const stepCompletedEvent = {
        sagaId: sagaInstance.id,
        type: 'step_completed' as any,
        data: { stepId: 'step1', result: 'Step 1 completed' },
        timestamp: new Date()
      };

      const sagaResult = await workflowManager.continueAgentSaga(
        sagaInstance.id,
        stepCompletedEvent
      );

      expect(sagaResult).toBeDefined();
      expect(sagaResult.sagaId).toBe(sagaInstance.id);
      expect(sagaResult.status).toBe(SagaStatus.IN_PROGRESS);

      // Verify saga state update
      expect(mockRealtimeDB.ref).toHaveBeenCalledWith(
        `orchestration/agent_sagas/${sagaInstance.id}`
      );
    });
  });

  describe('Agent Task Monitoring', () => {
    it('should monitor agent task health and performance', async () => {
      const taskId = 'monitor-task-1';

      // Mock task data
      mockRealtimeDB.ref.mockReturnValue({
        once: jest.fn().mockResolvedValue({
          val: () => ({
            id: taskId,
            userId: 'user-123',
            type: TaskType.RESEARCH_TASK,
            status: TaskStatus.RUNNING,
            progress: 45,
            updatedAt: Date.now()
          })
        })
      } as any);

      const monitoring = await workflowManager.monitorAgentTask(taskId);

      expect(monitoring).toBeDefined();
      expect(monitoring.taskId).toBe(taskId);
      expect(monitoring.status).toBe(TaskStatus.RUNNING);
      expect(monitoring.progress).toBe(45);
      expect(monitoring.healthStatus).toBeDefined();
      expect(monitoring.resourceUsage).toBeDefined();
      expect(monitoring.performanceMetrics).toBeDefined();

      // Verify health status structure
      expect(monitoring.healthStatus.overall).toBeDefined();
      expect(monitoring.healthStatus.components).toBeDefined();
      expect(monitoring.healthStatus.lastHealthCheck).toBeDefined();

      // Verify resource usage structure
      expect(monitoring.resourceUsage.cpuUsage).toBeDefined();
      expect(monitoring.resourceUsage.memoryUsage).toBeDefined();
      expect(monitoring.resourceUsage.creditsConsumed).toBeDefined();

      // Verify performance metrics structure
      expect(monitoring.performanceMetrics.throughput).toBeDefined();
      expect(monitoring.performanceMetrics.latency).toBeDefined();
      expect(monitoring.performanceMetrics.successRate).toBeDefined();
    });

    it('should detect performance issues and generate alerts', async () => {
      const taskId = 'alert-task-1';

      // Mock task with performance issues
      mockRealtimeDB.ref.mockReturnValue({
        once: jest.fn().mockResolvedValue({
          val: () => ({
            id: taskId,
            userId: 'user-456',
            type: TaskType.CODE_GENERATION,
            status: TaskStatus.RUNNING,
            progress: 25,
            updatedAt: Date.now()
          })
        })
      } as any);

      const monitoring = await workflowManager.monitorAgentTask(taskId);

      // Verify monitoring detects issues
      expect(monitoring.alerts).toBeDefined();
      expect(Array.isArray(monitoring.alerts)).toBe(true);

      // Check if high latency would be detected (simulated in implementation)
      if (monitoring.performanceMetrics.latency > 5000) {
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'High latency detected',
          expect.objectContaining({
            taskId,
            latency: monitoring.performanceMetrics.latency
          })
        );
      }

      // Check if high memory usage would be detected
      if (monitoring.resourceUsage.memoryUsage > 500) {
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'High memory usage detected',
          expect.objectContaining({
            taskId,
            memoryUsage: monitoring.resourceUsage.memoryUsage
          })
        );
      }
    });
  });

  describe('Agent Recovery Mechanisms', () => {
    it('should restart failed agent successfully', async () => {
      const taskId = 'restart-task-1';

      const recoveryResult = await workflowManager.recoverFailedAgent(
        taskId,
        RecoveryStrategy.RESTART
      );

      expect(recoveryResult).toBeDefined();
      expect(recoveryResult.taskId).toBe(taskId);
      expect(recoveryResult.strategy).toBe(RecoveryStrategy.RESTART);
      expect(recoveryResult.success).toBe(true);
      expect(recoveryResult.newStatus).toBe(TaskStatus.RUNNING);
      expect(recoveryResult.actions).toHaveLength(1);
      expect(recoveryResult.actions[0].type).toBe('restart');

      // Verify metrics
      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'agent_workflow.recovery_attempts',
        1,
        expect.objectContaining({
          strategy: RecoveryStrategy.RESTART,
          success: 'true'
        })
      );
    });

    it('should rollback agent to previous state', async () => {
      const taskId = 'rollback-task-1';

      const recoveryResult = await workflowManager.recoverFailedAgent(
        taskId,
        RecoveryStrategy.ROLLBACK
      );

      expect(recoveryResult).toBeDefined();
      expect(recoveryResult.strategy).toBe(RecoveryStrategy.ROLLBACK);
      expect(recoveryResult.success).toBe(true);
      expect(recoveryResult.newStatus).toBe(TaskStatus.PENDING);
      expect(recoveryResult.actions[0].type).toBe('rollback');
      expect(recoveryResult.actions[0].description).toContain('rolled back');
    });

    it('should skip failed step and continue execution', async () => {
      const taskId = 'skip-task-1';

      const recoveryResult = await workflowManager.recoverFailedAgent(
        taskId,
        RecoveryStrategy.SKIP_STEP
      );

      expect(recoveryResult).toBeDefined();
      expect(recoveryResult.strategy).toBe(RecoveryStrategy.SKIP_STEP);
      expect(recoveryResult.success).toBe(true);
      expect(recoveryResult.newStatus).toBe(TaskStatus.RUNNING);
      expect(recoveryResult.actions[0].type).toBe('skip_step');
      expect(recoveryResult.actions[0].description).toContain('skipped');
    });

    it('should use alternative execution path', async () => {
      const taskId = 'alternative-task-1';

      const recoveryResult = await workflowManager.recoverFailedAgent(
        taskId,
        RecoveryStrategy.ALTERNATIVE_PATH
      );

      expect(recoveryResult).toBeDefined();
      expect(recoveryResult.strategy).toBe(RecoveryStrategy.ALTERNATIVE_PATH);
      expect(recoveryResult.success).toBe(true);
      expect(recoveryResult.newStatus).toBe(TaskStatus.RUNNING);
      expect(recoveryResult.actions[0].type).toBe('alternative_path');
      expect(recoveryResult.actions[0].description).toContain('alternative');
    });
  });

  describe('Workflow Orchestration', () => {
    it('should orchestrate sequential agent workflow', async () => {
      const workflowRequest: AgentWorkflowRequest = {
        userId: 'user-workflow-1',
        workflowType: AgentWorkflowType.SEQUENTIAL,
        tasks: [
          {
            taskId: 'task-1',
            conversationId: 'conv-1',
            message: 'Research quantum computing',
            userId: 'user-workflow-1',
            taskType: TaskType.RESEARCH_TASK,
            maxExecutionTime: 300000,
            tools: [],
            priority: TaskPriority.NORMAL,
            status: TaskStatus.PENDING
          },
          {
            taskId: 'task-2',
            conversationId: 'conv-1',
            message: 'Analyze research findings',
            userId: 'user-workflow-1',
            taskType: TaskType.DATA_ANALYSIS,
            maxExecutionTime: 180000,
            tools: [],
            priority: TaskPriority.NORMAL,
            status: TaskStatus.PENDING
          }
        ],
        dependencies: [
          {
            taskId: 'task-2',
            dependsOn: ['task-1']
          }
        ],
        constraints: {
          maxExecutionTime: 600000,
          maxTotalCost: 200,
          maxParallelTasks: 1,
          requiredQuality: 0.8,
          allowedFailures: 0
        },
        priority: WorkflowPriority.NORMAL
      };

      const workflowResult = await workflowManager.orchestrateAgentWorkflow(workflowRequest);

      expect(workflowResult).toBeDefined();
      expect(workflowResult.workflowId).toBeDefined();
      expect(workflowResult.status).toBeDefined();
      expect(workflowResult.tasks).toHaveLength(2);
      expect(workflowResult.totalExecutionTime).toBeGreaterThan(0);
      expect(workflowResult.totalCost).toBeGreaterThan(0);
      expect(workflowResult.successRate).toBeGreaterThanOrEqual(0);

      // Verify workflow metadata
      expect(workflowResult.metadata).toBeDefined();
      expect(workflowResult.metadata.startTime).toBeDefined();
      expect(workflowResult.metadata.endTime).toBeDefined();
      expect(workflowResult.metadata.executionPath).toBeDefined();

      // Verify metrics
      expect(mockMetrics.histogram).toHaveBeenCalledWith(
        'agent_workflow.execution_time',
        workflowResult.totalExecutionTime,
        expect.objectContaining({
          workflowType: AgentWorkflowType.SEQUENTIAL,
          taskCount: '2'
        })
      );
    });

    it('should orchestrate parallel agent workflow', async () => {
      const workflowRequest: AgentWorkflowRequest = {
        userId: 'user-workflow-2',
        workflowType: AgentWorkflowType.PARALLEL,
        tasks: [
          {
            taskId: 'parallel-task-1',
            conversationId: 'conv-2',
            message: 'Generate code for feature A',
            userId: 'user-workflow-2',
            taskType: TaskType.CODE_GENERATION,
            maxExecutionTime: 120000,
            tools: [],
            priority: TaskPriority.HIGH,
            status: TaskStatus.PENDING
          },
          {
            taskId: 'parallel-task-2',
            conversationId: 'conv-2',
            message: 'Generate code for feature B',
            userId: 'user-workflow-2',
            taskType: TaskType.CODE_GENERATION,
            maxExecutionTime: 120000,
            tools: [],
            priority: TaskPriority.HIGH,
            status: TaskStatus.PENDING
          }
        ],
        dependencies: [], // No dependencies for parallel execution
        constraints: {
          maxExecutionTime: 150000,
          maxTotalCost: 150,
          maxParallelTasks: 2,
          requiredQuality: 0.85,
          allowedFailures: 1
        },
        priority: WorkflowPriority.HIGH
      };

      const workflowResult = await workflowManager.orchestrateAgentWorkflow(workflowRequest);

      expect(workflowResult).toBeDefined();
      expect(workflowResult.tasks).toHaveLength(2);
      
      // Parallel execution should be faster than sequential
      expect(workflowResult.totalExecutionTime).toBeLessThan(240000); // Less than sum of individual times

      // Both tasks should have been processed
      const completedTasks = workflowResult.tasks.filter(t => t.status === TaskStatus.COMPLETED);
      const failedTasks = workflowResult.tasks.filter(t => t.status === TaskStatus.FAILED);
      
      expect(completedTasks.length + failedTasks.length).toBe(2);
    });

    it('should get workflow status during execution', async () => {
      const workflowRequest: AgentWorkflowRequest = {
        userId: 'user-status-1',
        workflowType: AgentWorkflowType.SEQUENTIAL,
        tasks: [
          {
            taskId: 'status-task-1',
            conversationId: 'conv-status',
            message: 'Long running task',
            userId: 'user-status-1',
            taskType: TaskType.RESEARCH_TASK,
            maxExecutionTime: 600000,
            tools: [],
            priority: TaskPriority.NORMAL,
            status: TaskStatus.RUNNING
          }
        ],
        dependencies: [],
        constraints: {
          maxExecutionTime: 700000,
          maxTotalCost: 100,
          maxParallelTasks: 1,
          requiredQuality: 0.8,
          allowedFailures: 0
        },
        priority: WorkflowPriority.NORMAL
      };

      const workflowResult = await workflowManager.orchestrateAgentWorkflow(workflowRequest);
      const workflowStatus = await workflowManager.getWorkflowStatus(workflowResult.workflowId);

      expect(workflowStatus).toBeDefined();
      expect(workflowStatus.workflowId).toBe(workflowResult.workflowId);
      expect(workflowStatus.status).toBeDefined();
      expect(workflowStatus.progress).toBeGreaterThanOrEqual(0);
      expect(workflowStatus.progress).toBeLessThanOrEqual(100);
      expect(workflowStatus.currentTasks).toBeDefined();
      expect(workflowStatus.completedTasks).toBeDefined();
      expect(workflowStatus.failedTasks).toBeDefined();
      expect(workflowStatus.estimatedCompletion).toBeDefined();
      expect(workflowStatus.resourceUsage).toBeDefined();
    });
  });

  describe('Metrics and Health Monitoring', () => {
    it('should provide comprehensive agent metrics', async () => {
      const metrics = await workflowManager.getAgentMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.totalTasks).toBeGreaterThanOrEqual(0);
      expect(metrics.activeTasks).toBeGreaterThanOrEqual(0);
      expect(metrics.completedTasks).toBeGreaterThanOrEqual(0);
      expect(metrics.failedTasks).toBeGreaterThanOrEqual(0);
      expect(metrics.averageExecutionTime).toBeGreaterThanOrEqual(0);
      expect(metrics.averageCost).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeLessThanOrEqual(1);

      // Verify resource utilization
      expect(metrics.resourceUtilization).toBeDefined();
      expect(metrics.resourceUtilization.cpu).toBeGreaterThanOrEqual(0);
      expect(metrics.resourceUtilization.memory).toBeGreaterThanOrEqual(0);
      expect(metrics.resourceUtilization.credits).toBeGreaterThanOrEqual(0);

      // Verify performance trends
      expect(metrics.performanceTrends).toBeDefined();
      expect(Array.isArray(metrics.performanceTrends)).toBe(true);
    });

    it('should track active workflows', async () => {
      const activeWorkflows = await workflowManager.getActiveWorkflows();

      expect(activeWorkflows).toBeDefined();
      expect(Array.isArray(activeWorkflows)).toBe(true);

      // Each active workflow should have required properties
      activeWorkflows.forEach(workflow => {
        expect(workflow.id).toBeDefined();
        expect(workflow.type).toBeDefined();
        expect(workflow.status).toBeDefined();
        expect(workflow.userId).toBeDefined();
        expect(workflow.tasks).toBeDefined();
        expect(workflow.startTime).toBeDefined();
        expect(workflow.priority).toBeDefined();
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle saga not found error', async () => {
      const nonExistentSagaId = 'non-existent-saga';
      const event = {
        sagaId: nonExistentSagaId,
        type: 'step_completed' as any,
        data: {},
        timestamp: new Date()
      };

      await expect(
        workflowManager.continueAgentSaga(nonExistentSagaId, event)
      ).rejects.toThrow(`Saga instance not found: ${nonExistentSagaId}`);
    });

    it('should handle workflow not found error', async () => {
      const nonExistentWorkflowId = 'non-existent-workflow';

      await expect(
        workflowManager.getWorkflowStatus(nonExistentWorkflowId)
      ).rejects.toThrow(`Workflow not found: ${nonExistentWorkflowId}`);
    });

    it('should handle task not found in monitoring', async () => {
      const nonExistentTaskId = 'non-existent-task';

      // Mock empty task data
      mockRealtimeDB.ref.mockReturnValue({
        once: jest.fn().mockResolvedValue({ val: () => null })
      } as any);

      await expect(
        workflowManager.monitorAgentTask(nonExistentTaskId)
      ).rejects.toThrow(`Agent task not found: ${nonExistentTaskId}`);
    });

    it('should handle database connection errors gracefully', async () => {
      // Mock database error
      mockRealtimeDB.ref.mockReturnValue({
        once: jest.fn().mockRejectedValue(new Error('Database connection failed')),
        set: jest.fn().mockRejectedValue(new Error('Database connection failed'))
      } as any);

      const sagaDefinition: AgentSagaDefinition = {
        id: 'error-saga-1',
        name: 'Error Saga',
        agentType: TaskType.QUICK_CHAT,
        steps: [],
        compensationSteps: [],
        timeoutMs: 60000,
        retryPolicy: {
          maxRetries: 1,
          initialDelayMs: 1000,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          retryableErrors: []
        },
        resourceRequirements: {
          maxExecutionTime: 60000,
          maxMemoryMB: 256,
          maxCpuUnits: 1,
          maxCredits: 25,
          requiredTools: [],
          requiredModels: []
        },
        failureHandling: {
          maxRetries: 1,
          retryDelayMs: 1000,
          backoffMultiplier: 2,
          compensationStrategy: CompensationStrategy.ROLLBACK,
          escalationThreshold: 1,
          notificationChannels: []
        },
        monitoringConfig: {
          progressUpdateInterval: 5000,
          healthCheckInterval: 10000,
          performanceMetrics: [],
          alertThresholds: {
            executionTimeWarning: 30000,
            executionTimeCritical: 50000,
            memoryUsageWarning: 128,
            memoryUsageCritical: 200,
            errorRateWarning: 0.1,
            errorRateCritical: 0.2
          }
        }
      };

      await expect(
        workflowManager.startAgentSaga(sagaDefinition)
      ).rejects.toThrow('Database connection failed');

      // Verify error logging
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start agent saga',
        expect.objectContaining({
          agentType: TaskType.QUICK_CHAT,
          error: 'Database connection failed'
        })
      );
    });
  });
});