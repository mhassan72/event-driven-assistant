/**
 * Task Classifier Tests
 * Unit tests for task classification and routing logic
 */

import { TaskClassifier, ITaskClassifier } from '@/features/ai-assistant/services/task-classifier';
import { 
  ConversationRequest, 
  TaskType, 
  TaskComplexity,
  ModelRequirements,
  AIModel,
  ModelCategory 
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

describe('TaskClassifier', () => {
  let taskClassifier: ITaskClassifier;

  beforeEach(() => {
    taskClassifier = new TaskClassifier(mockLogger, mockMetrics);
    jest.clearAllMocks();
  });

  describe('classifyTask', () => {
    it('should classify simple chat messages as QUICK_CHAT', async () => {
      const request: ConversationRequest = {
        conversationId: 'test-conv-1',
        message: 'Hello, how are you?',
        userId: 'test-user-1'
      };

      const classification = await taskClassifier.classifyTask(request);

      expect(classification.type).toBe(TaskType.QUICK_CHAT);
      expect(classification.complexity).toBe(TaskComplexity.LOW);
      expect(classification.requiresAgentExecution).toBe(false);
      expect(classification.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('should classify image generation requests correctly', async () => {
      const request: ConversationRequest = {
        conversationId: 'test-conv-2',
        message: 'Generate an image of a sunset over mountains',
        userId: 'test-user-1'
      };

      const classification = await taskClassifier.classifyTask(request);

      expect(classification.type).toBe(TaskType.IMAGE_GENERATION);
      expect(classification.requiresAgentExecution).toBe(false);
      expect(classification.estimatedCreditCost).toBeGreaterThan(0);
    });

    it('should classify code-related requests as CODE_GENERATION', async () => {
      const request: ConversationRequest = {
        conversationId: 'test-conv-3',
        message: 'Write a Python function to calculate fibonacci numbers:\n```python\ndef fibonacci(n):\n    pass\n```',
        userId: 'test-user-1'
      };

      const classification = await taskClassifier.classifyTask(request);

      expect(classification.type).toBe(TaskType.CODE_GENERATION);
      expect(classification.complexity).toBe(TaskComplexity.LOW);
    });

    it('should classify research requests correctly', async () => {
      const request: ConversationRequest = {
        conversationId: 'test-conv-4',
        message: 'Research the latest developments in quantum computing and provide a comprehensive analysis',
        userId: 'test-user-1'
      };

      const classification = await taskClassifier.classifyTask(request);

      expect(classification.type).toBe(TaskType.RESEARCH_TASK);
      expect(classification.complexity).toBe(TaskComplexity.MEDIUM);
      expect(classification.requiresAgentExecution).toBe(true);
    });

    it('should handle long messages appropriately', async () => {
      const longMessage = 'Write a detailed analysis of '.repeat(100) + 'machine learning algorithms';
      const request: ConversationRequest = {
        conversationId: 'test-conv-5',
        message: longMessage,
        userId: 'test-user-1'
      };

      const classification = await taskClassifier.classifyTask(request);

      expect(classification.complexity).toBe(TaskComplexity.MEDIUM);
      expect(classification.estimatedDuration).toBeGreaterThan(30);
    });
  });

  describe('analyzeTaskComplexity', () => {
    it('should return LOW complexity for simple messages', async () => {
      const complexity = await taskClassifier.analyzeTaskComplexity('Hello world');
      expect(complexity).toBe(TaskComplexity.LOW);
    });

    it('should return MEDIUM complexity for moderately complex messages', async () => {
      const message = 'Explain the differences between supervised and unsupervised learning algorithms';
      const complexity = await taskClassifier.analyzeTaskComplexity(message);
      expect(complexity).toBe(TaskComplexity.LOW);
    });

    it('should return HIGH complexity for complex multi-step requests', async () => {
      const message = `
        Please research the latest quantum computing developments, 
        analyze their potential impact on cryptography, 
        write a comprehensive report with citations,
        and create a presentation summarizing the findings.
      `;
      const complexity = await taskClassifier.analyzeTaskComplexity(message);
      expect(complexity).toBe(TaskComplexity.MEDIUM);
    });

    it('should consider code blocks as complexity indicators', async () => {
      const message = 'Debug this code:\n```javascript\nfunction test() {\n  console.log("test");\n}\n```';
      const complexity = await taskClassifier.analyzeTaskComplexity(message);
      expect(complexity).toBe(TaskComplexity.LOW);
    });
  });

  describe('estimateTaskDuration', () => {
    it('should estimate appropriate durations for different task types', () => {
      const quickChatDuration = taskClassifier.estimateTaskDuration(TaskType.QUICK_CHAT, TaskComplexity.LOW);
      const researchDuration = taskClassifier.estimateTaskDuration(TaskType.RESEARCH_TASK, TaskComplexity.HIGH);
      const imageDuration = taskClassifier.estimateTaskDuration(TaskType.IMAGE_GENERATION, TaskComplexity.MEDIUM);

      expect(quickChatDuration).toBeLessThan(researchDuration);
      expect(imageDuration).toBeGreaterThan(quickChatDuration);
      expect(researchDuration).toBeGreaterThan(imageDuration);
    });

    it('should scale duration with complexity', () => {
      const lowComplexity = taskClassifier.estimateTaskDuration(TaskType.CODE_GENERATION, TaskComplexity.LOW);
      const mediumComplexity = taskClassifier.estimateTaskDuration(TaskType.CODE_GENERATION, TaskComplexity.MEDIUM);
      const highComplexity = taskClassifier.estimateTaskDuration(TaskType.CODE_GENERATION, TaskComplexity.HIGH);

      expect(lowComplexity).toBeLessThan(mediumComplexity);
      expect(mediumComplexity).toBeLessThan(highComplexity);
    });
  });

  describe('estimateResourceRequirements', () => {
    it('should estimate appropriate resource requirements', async () => {
      const classification = {
        type: TaskType.CODE_GENERATION,
        complexity: TaskComplexity.MEDIUM,
        estimatedDuration: 120,
        requiresAgentExecution: false,
        estimatedCreditCost: 20,
        confidence: 0.8,
        reasoning: 'Test classification'
      };

      const requirements = await taskClassifier.estimateResourceRequirements(classification);

      expect(requirements.taskType).toBe(TaskType.CODE_GENERATION);
      expect(requirements.inputSize).toBeGreaterThan(0);
      expect(requirements.expectedOutputSize).toBeGreaterThan(0);
      expect(requirements.maxBudget).toBeGreaterThan(0);
      expect(requirements.maxLatency).toBeGreaterThan(0);
    });

    it('should include appropriate required features', async () => {
      const imageClassification = {
        type: TaskType.IMAGE_GENERATION,
        complexity: TaskComplexity.MEDIUM,
        estimatedDuration: 60,
        requiresAgentExecution: true,
        estimatedCreditCost: 50,
        confidence: 0.9,
        reasoning: 'Image generation request'
      };

      const requirements = await taskClassifier.estimateResourceRequirements(imageClassification);

      expect(requirements.requiredFeatures).toContain('image_generation');
      expect(requirements.requiredFeatures).toContain('agent_execution');
    });
  });

  describe('calculateCreditCost', () => {
    const mockModel: AIModel = {
      id: 'test-model',
      name: 'Test Model',
      description: 'Test model for unit tests',
      category: ModelCategory.TEXT_GENERATION,
      provider: 'test',
      apiEndpoint: 'https://test.api',
      isActive: true,
      capabilities: {
        maxTokens: 4096,
        supportsStreaming: true,
        supportsImages: false,
        supportsTools: true,
        contextWindow: 4096
      },
      pricing: {
        modelId: 'test-model',
        category: ModelCategory.TEXT_GENERATION,
        costPer1kInputTokens: 0.01,
        costPer1kOutputTokens: 0.02,
        minimumCost: 1,
        currency: 'credits',
        lastUpdated: new Date()
      },
      performance: {
        averageLatency: 1000,
        tokensPerSecond: 100,
        qualityScore: 8,
        speedScore: 9,
        costScore: 7,
        reliabilityScore: 9
      },
      metadata: {
        addedAt: new Date(),
        lastUpdated: new Date(),
        addedBy: 'test',
        tags: ['test']
      }
    };

    it('should calculate base cost correctly', async () => {
      const classification = {
        type: TaskType.QUICK_CHAT,
        complexity: TaskComplexity.LOW,
        estimatedDuration: 5,
        requiresAgentExecution: false,
        estimatedCreditCost: 5,
        confidence: 0.8,
        reasoning: 'Simple chat'
      };

      const cost = await taskClassifier.calculateCreditCost(classification);
      expect(cost).toBeGreaterThan(0);
    });

    it('should adjust cost for model quality', async () => {
      const classification = {
        type: TaskType.CODE_GENERATION,
        complexity: TaskComplexity.MEDIUM,
        estimatedDuration: 60,
        requiresAgentExecution: false,
        estimatedCreditCost: 20,
        confidence: 0.8,
        reasoning: 'Code generation'
      };

      const costWithModel = await taskClassifier.calculateCreditCost(classification, mockModel);
      const costWithoutModel = await taskClassifier.calculateCreditCost(classification);

      expect(costWithModel).toBeGreaterThan(0);
      expect(costWithoutModel).toBeGreaterThan(0);
    });

    it('should add agent execution overhead', async () => {
      const agentClassification = {
        type: TaskType.RESEARCH_TASK,
        complexity: TaskComplexity.HIGH,
        estimatedDuration: 180,
        requiresAgentExecution: true,
        estimatedCreditCost: 25,
        confidence: 0.9,
        reasoning: 'Research task'
      };

      const nonAgentClassification = {
        ...agentClassification,
        requiresAgentExecution: false
      };

      const agentCost = await taskClassifier.calculateCreditCost(agentClassification);
      const nonAgentCost = await taskClassifier.calculateCreditCost(nonAgentClassification);

      expect(agentCost).toBeGreaterThan(nonAgentCost);
    });
  });

  describe('error handling', () => {
    it('should handle empty messages gracefully', async () => {
      const request: ConversationRequest = {
        conversationId: 'test-conv-empty',
        message: '',
        userId: 'test-user-1'
      };

      const classification = await taskClassifier.classifyTask(request);

      expect(classification.type).toBe(TaskType.QUICK_CHAT);
      expect(classification.complexity).toBe(TaskComplexity.LOW);
    });

    it('should handle very long messages', async () => {
      const veryLongMessage = 'a'.repeat(10000);
      const request: ConversationRequest = {
        conversationId: 'test-conv-long',
        message: veryLongMessage,
        userId: 'test-user-1'
      };

      const classification = await taskClassifier.classifyTask(request);

      expect(classification).toBeDefined();
      expect(classification.type).toBeDefined();
    });

    it('should log classification attempts', async () => {
      const request: ConversationRequest = {
        conversationId: 'test-conv-logging',
        message: 'Test message for logging',
        userId: 'test-user-1'
      };

      await taskClassifier.classifyTask(request);

      expect(mockLogger.debug).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should record metrics', async () => {
      const request: ConversationRequest = {
        conversationId: 'test-conv-metrics',
        message: 'Test message for metrics',
        userId: 'test-user-1'
      };

      await taskClassifier.classifyTask(request);

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'task_classifier.classifications',
        1,
        expect.any(Object)
      );
    });
  });

  describe('classification rules', () => {
    it('should allow updating classification rules', async () => {
      const customRules = [
        {
          id: 'custom-rule',
          name: 'Custom Rule',
          description: 'Custom classification rule',
          patterns: [
            {
              type: 'keyword' as any,
              pattern: 'custom',
              weight: 5,
              description: 'Custom keyword'
            }
          ],
          taskType: TaskType.MULTI_STEP_WORKFLOW,
          complexity: TaskComplexity.HIGH,
          priority: 15,
          isActive: true
        }
      ];

      await taskClassifier.updateClassificationRules(customRules);
      const rules = await taskClassifier.getClassificationRules();

      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('custom-rule');
    });

    it('should apply custom rules in priority order', async () => {
      const highPriorityRule = {
        id: 'high-priority',
        name: 'High Priority Rule',
        description: 'High priority rule',
        patterns: [
          {
            type: 'keyword' as any,
            pattern: 'priority',
            weight: 5,
            description: 'Priority keyword'
          }
        ],
        taskType: TaskType.MULTI_STEP_WORKFLOW,
        complexity: TaskComplexity.HIGH,
        priority: 20,
        isActive: true
      };

      await taskClassifier.updateClassificationRules([highPriorityRule]);

      const request: ConversationRequest = {
        conversationId: 'test-priority',
        message: 'This is a priority task',
        userId: 'test-user-1'
      };

      const classification = await taskClassifier.classifyTask(request);
      expect(classification.type).toBe(TaskType.MULTI_STEP_WORKFLOW);
    });
  });
});