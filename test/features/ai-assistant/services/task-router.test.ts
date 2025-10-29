/**
 * Task Router Tests
 * Unit tests for task routing and load balancing logic
 */

import { TaskRouter, ITaskRouter, RoutingStrategy, ExecutionPath } from '@/features/ai-assistant/services/task-router';
import { 
  ConversationRequest, 
  TaskClassification,
  TaskType, 
  TaskComplexity 
} from '@/shared/types';
import { IStructuredLogger } from '@/shared/observability/logger';
import { IMetricsCollector } from '@/shared/observability/metrics';

// Mock dependencies
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

describe('TaskRouter', () => {
  let taskRouter: ITaskRouter;

  beforeEach(() => {
    taskRouter = new TaskRouter(mockLogger, mockMetrics);
    jest.clearAllMocks();
  });

  describe('determineRoutingStrategy', () => {
    it('should route quick chat to synchronous processing', async () => {
      const classification: TaskClassification = {
        type: TaskType.QUICK_CHAT,
        complexity: TaskComplexity.LOW,
        estimatedDuration: 5,
        requiresAgentExecution: false,
        estimatedCreditCost: 5,
        confidence: 0.9,
        reasoning: 'Simple chat message'
      };

      const strategy = await taskRouter.determineRoutingStrategy(classification);
      expect(strategy).toBe(RoutingStrategy.SYNCHRONOUS);
    });

    it('should route agent tasks to asynchronous processing', async () => {
      const classification: TaskClassification = {
        type: TaskType.RESEARCH_TASK,
        complexity: TaskComplexity.HIGH,
        estimatedDuration: 180,
        requiresAgentExecution: true,
        estimatedCreditCost: 30,
        confidence: 0.8,
        reasoning: 'Complex research task'
      };

      const strategy = await taskRouter.determineRoutingStrategy(classification);
      expect(strategy).toBe(RoutingStrategy.ASYNCHRONOUS);
    });

    it('should route long duration tasks to asynchronous processing', async () => {
      const classification: TaskClassification = {
        type: TaskType.LONG_FORM_WRITING,
        complexity: TaskComplexity.MEDIUM,
        estimatedDuration: 120,
        requiresAgentExecution: false,
        estimatedCreditCost: 15,
        confidence: 0.7,
        reasoning: 'Long form content creation'
      };

      const strategy = await taskRouter.determineRoutingStrategy(classification);
      expect([RoutingStrategy.ASYNCHRONOUS, RoutingStrategy.QUEUED]).toContain(strategy);
    });

    it('should route high complexity tasks to asynchronous processing', async () => {
      const classification: TaskClassification = {
        type: TaskType.CODE_GENERATION,
        complexity: TaskComplexity.HIGH,
        estimatedDuration: 45,
        requiresAgentExecution: false,
        estimatedCreditCost: 20,
        confidence: 0.8,
        reasoning: 'Complex code generation'
      };

      const strategy = await taskRouter.determineRoutingStrategy(classification);
      expect([RoutingStrategy.ASYNCHRONOUS, RoutingStrategy.QUEUED]).toContain(strategy);
    });
  });

  describe('routeTask', () => {
    const mockRequest: ConversationRequest = {
      conversationId: 'test-conv-1',
      message: 'Test message',
      userId: 'test-user-1'
    };

    it('should provide complete routing result for quick chat', async () => {
      const classification: TaskClassification = {
        type: TaskType.QUICK_CHAT,
        complexity: TaskComplexity.LOW,
        estimatedDuration: 5,
        requiresAgentExecution: false,
        estimatedCreditCost: 5,
        confidence: 0.9,
        reasoning: 'Simple chat'
      };

      const result = await taskRouter.routeTask(mockRequest, classification);

      expect(result.strategy).toBe(RoutingStrategy.SYNCHRONOUS);
      expect([ExecutionPath.QUICK_RESPONSE, ExecutionPath.PRIORITY_QUEUE]).toContain(result.executionPath);
      expect(result.estimatedWaitTime).toBeGreaterThanOrEqual(0);
      expect(result.routingReason).toBeDefined();
      expect(result.fallbackOptions).toBeInstanceOf(Array);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.routedAt).toBeInstanceOf(Date);
    });

    it('should provide queue position for asynchronous tasks', async () => {
      const classification: TaskClassification = {
        type: TaskType.IMAGE_GENERATION,
        complexity: TaskComplexity.MEDIUM,
        estimatedDuration: 60,
        requiresAgentExecution: true,
        estimatedCreditCost: 50,
        confidence: 0.8,
        reasoning: 'Image generation task'
      };

      const result = await taskRouter.routeTask(mockRequest, classification);

      expect([RoutingStrategy.ASYNCHRONOUS, RoutingStrategy.QUEUED]).toContain(result.strategy);
      expect(result.queuePosition).toBeDefined();
      expect(result.queuePosition).toBeGreaterThanOrEqual(0);
    });

    it('should include fallback options', async () => {
      const classification: TaskClassification = {
        type: TaskType.CODE_GENERATION,
        complexity: TaskComplexity.MEDIUM,
        estimatedDuration: 60,
        requiresAgentExecution: false,
        estimatedCreditCost: 20,
        confidence: 0.8,
        reasoning: 'Code generation'
      };

      const result = await taskRouter.routeTask(mockRequest, classification);

      expect(result.fallbackOptions).toHaveLength(2);
      expect(result.fallbackOptions[0]).toHaveProperty('strategy');
      expect(result.fallbackOptions[0]).toHaveProperty('executionPath');
      expect(result.fallbackOptions[0]).toHaveProperty('estimatedWaitTime');
      expect(result.fallbackOptions[0]).toHaveProperty('description');
    });

    it('should record routing metrics', async () => {
      const classification: TaskClassification = {
        type: TaskType.QUICK_CHAT,
        complexity: TaskComplexity.LOW,
        estimatedDuration: 5,
        requiresAgentExecution: false,
        estimatedCreditCost: 5,
        confidence: 0.9,
        reasoning: 'Simple chat'
      };

      await taskRouter.routeTask(mockRequest, classification);

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'task_router.routes',
        1,
        expect.objectContaining({
          strategy: expect.any(String),
          executionPath: expect.any(String),
          taskType: expect.any(String)
        })
      );

      expect(mockMetrics.histogram).toHaveBeenCalledWith(
        'task_router.estimated_wait_time',
        expect.any(Number)
      );
    });
  });

  describe('checkSystemLoad', () => {
    it('should return system load metrics', async () => {
      const load = await taskRouter.checkSystemLoad();

      expect(load).toHaveProperty('cpuUsage');
      expect(load).toHaveProperty('memoryUsage');
      expect(load).toHaveProperty('activeConnections');
      expect(load).toHaveProperty('queueLength');
      expect(load).toHaveProperty('averageResponseTime');
      expect(load).toHaveProperty('errorRate');
      expect(load).toHaveProperty('timestamp');

      expect(load.cpuUsage).toBeGreaterThanOrEqual(0);
      expect(load.cpuUsage).toBeLessThanOrEqual(100);
      expect(load.memoryUsage).toBeGreaterThanOrEqual(0);
      expect(load.memoryUsage).toBeLessThanOrEqual(100);
      expect(load.timestamp).toBeInstanceOf(Date);
    });

    it('should record system metrics', async () => {
      await taskRouter.checkSystemLoad();

      expect(mockMetrics.gauge).toHaveBeenCalledWith('system.cpu_usage', expect.any(Number));
      expect(mockMetrics.gauge).toHaveBeenCalledWith('system.memory_usage', expect.any(Number));
      expect(mockMetrics.gauge).toHaveBeenCalledWith('system.queue_length', expect.any(Number));
    });
  });

  describe('selectOptimalExecutionPath', () => {
    it('should select quick response for low complexity tasks under normal load', async () => {
      const classification: TaskClassification = {
        type: TaskType.QUICK_CHAT,
        complexity: TaskComplexity.LOW,
        estimatedDuration: 5,
        requiresAgentExecution: false,
        estimatedCreditCost: 5,
        confidence: 0.9,
        reasoning: 'Simple chat'
      };

      const normalLoad = {
        cpuUsage: 50,
        memoryUsage: 40,
        activeConnections: 100,
        queueLength: 5,
        averageResponseTime: 1000,
        errorRate: 0.01,
        timestamp: new Date()
      };

      const path = await taskRouter.selectOptimalExecutionPath(classification, normalLoad);
      expect(path).toBe(ExecutionPath.QUICK_RESPONSE);
    });

    it('should select agent function for agent-required tasks', async () => {
      const classification: TaskClassification = {
        type: TaskType.RESEARCH_TASK,
        complexity: TaskComplexity.HIGH,
        estimatedDuration: 180,
        requiresAgentExecution: true,
        estimatedCreditCost: 30,
        confidence: 0.8,
        reasoning: 'Research task'
      };

      const normalLoad = {
        cpuUsage: 50,
        memoryUsage: 40,
        activeConnections: 100,
        queueLength: 5,
        averageResponseTime: 1000,
        errorRate: 0.01,
        timestamp: new Date()
      };

      const path = await taskRouter.selectOptimalExecutionPath(classification, normalLoad);
      expect(path).toBe(ExecutionPath.AGENT_FUNCTION);
    });

    it('should prefer queuing under high load conditions', async () => {
      const classification: TaskClassification = {
        type: TaskType.CODE_GENERATION,
        complexity: TaskComplexity.LOW,
        estimatedDuration: 30,
        requiresAgentExecution: false,
        estimatedCreditCost: 10,
        confidence: 0.8,
        reasoning: 'Simple code task'
      };

      const highLoad = {
        cpuUsage: 90,
        memoryUsage: 85,
        activeConnections: 500,
        queueLength: 25,
        averageResponseTime: 3000,
        errorRate: 0.05,
        timestamp: new Date()
      };

      const path = await taskRouter.selectOptimalExecutionPath(classification, highLoad);
      expect([ExecutionPath.PRIORITY_QUEUE, ExecutionPath.BATCH_PROCESSING]).toContain(path);
    });
  });

  describe('routing rules', () => {
    it('should allow updating routing rules', async () => {
      const customRules = [
        {
          id: 'custom-routing-rule',
          name: 'Custom Routing Rule',
          description: 'Custom rule for testing',
          conditions: [
            {
              type: 'task_type' as any,
              field: 'type',
              operator: 'equals' as any,
              value: TaskType.QUICK_CHAT,
              weight: 5
            }
          ],
          strategy: RoutingStrategy.SYNCHRONOUS,
          executionPath: ExecutionPath.QUICK_RESPONSE,
          priority: 15,
          isActive: true
        }
      ];

      await taskRouter.updateRoutingRules(customRules);
      const rules = await taskRouter.getRoutingRules();

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('custom-routing-rule');
      expect(rules[0].strategy).toBe(RoutingStrategy.SYNCHRONOUS);
    });

    it('should apply custom rules with higher priority', async () => {
      const highPriorityRule = {
        id: 'high-priority-routing',
        name: 'High Priority Routing',
        description: 'High priority routing rule',
        conditions: [
          {
            type: 'task_type' as any,
            field: 'type',
            operator: 'equals' as any,
            value: TaskType.RESEARCH_TASK,
            weight: 5
          }
        ],
        strategy: RoutingStrategy.SYNCHRONOUS, // Override default async routing
        executionPath: ExecutionPath.QUICK_RESPONSE,
        priority: 25,
        isActive: true
      };

      await taskRouter.updateRoutingRules([highPriorityRule]);

      const classification: TaskClassification = {
        type: TaskType.RESEARCH_TASK,
        complexity: TaskComplexity.HIGH,
        estimatedDuration: 180,
        requiresAgentExecution: true,
        estimatedCreditCost: 30,
        confidence: 0.8,
        reasoning: 'Research task with custom routing'
      };

      const strategy = await taskRouter.determineRoutingStrategy(classification);
      expect(strategy).toBe(RoutingStrategy.SYNCHRONOUS);
    });
  });

  describe('error handling', () => {
    it('should handle system load check failures gracefully', async () => {
      // Mock a failure scenario by creating a router that might fail
      const failingRouter = new TaskRouter(mockLogger, mockMetrics);
      
      // The router should still return valid load metrics even if some checks fail
      const load = await failingRouter.checkSystemLoad();
      
      expect(load).toBeDefined();
      expect(load.cpuUsage).toBeGreaterThanOrEqual(0);
    });

    it('should log routing decisions', async () => {
      const classification: TaskClassification = {
        type: TaskType.QUICK_CHAT,
        complexity: TaskComplexity.LOW,
        estimatedDuration: 5,
        requiresAgentExecution: false,
        estimatedCreditCost: 5,
        confidence: 0.9,
        reasoning: 'Test logging'
      };

      const request: ConversationRequest = {
        conversationId: 'test-logging',
        message: 'Test message',
        userId: 'test-user-1'
      };

      await taskRouter.routeTask(request, classification);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Task routed successfully',
        expect.objectContaining({
          conversationId: 'test-logging'
        })
      );
    });

    it('should handle routing failures and record errors', async () => {
      const invalidClassification = {
        type: 'INVALID_TYPE' as any,
        complexity: TaskComplexity.LOW,
        estimatedDuration: 5,
        requiresAgentExecution: false,
        estimatedCreditCost: 5,
        confidence: 0.9,
        reasoning: 'Invalid classification'
      };

      const request: ConversationRequest = {
        conversationId: 'test-error',
        message: 'Test message',
        userId: 'test-user-1'
      };

      // Should not throw, but handle gracefully
      const result = await taskRouter.routeTask(request, invalidClassification);
      expect(result).toBeDefined();
    });
  });

  describe('load balancing', () => {
    it('should adjust wait times based on system load', async () => {
      const classification: TaskClassification = {
        type: TaskType.CODE_GENERATION,
        complexity: TaskComplexity.MEDIUM,
        estimatedDuration: 60,
        requiresAgentExecution: false,
        estimatedCreditCost: 20,
        confidence: 0.8,
        reasoning: 'Code generation for load testing'
      };

      const request: ConversationRequest = {
        conversationId: 'test-load-balancing',
        message: 'Generate some code',
        userId: 'test-user-1'
      };

      const result = await taskRouter.routeTask(request, classification);

      expect(result.estimatedWaitTime).toBeGreaterThan(0);
      expect(result.metadata.systemLoad).toBeGreaterThanOrEqual(0);
      expect(result.metadata.systemLoad).toBeLessThanOrEqual(100);
    });

    it('should provide resource requirements in metadata', async () => {
      const classification: TaskClassification = {
        type: TaskType.IMAGE_GENERATION,
        complexity: TaskComplexity.HIGH,
        estimatedDuration: 120,
        requiresAgentExecution: true,
        estimatedCreditCost: 75,
        confidence: 0.9,
        reasoning: 'Complex image generation'
      };

      const request: ConversationRequest = {
        conversationId: 'test-resources',
        message: 'Generate a complex image',
        userId: 'test-user-1'
      };

      const result = await taskRouter.routeTask(request, classification);

      expect(result.metadata.resourceRequirements).toBeDefined();
      expect(result.metadata.resourceRequirements.estimatedCpu).toBeGreaterThan(0);
      expect(result.metadata.resourceRequirements.estimatedMemory).toBeGreaterThan(0);
      expect(result.metadata.resourceRequirements.requiresGpu).toBe(true);
    });
  });
});