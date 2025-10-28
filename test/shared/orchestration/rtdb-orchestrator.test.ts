/**
 * Unit Tests for RTDB Orchestrator
 * Tests workflow coordination, security routing, and real-time synchronization
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { RTDBOrchestrator } from '../../../src/shared/orchestration/rtdb-orchestrator';
import {
  WorkflowDefinition,
  WorkflowType,
  StepType,
  ExecutionStatus,
  SecurityLevel,
  SecureOperationType,
  PublicOperationType,
  SagaDefinition,
  SagaStatus
} from '../../../src/shared/types/orchestration';
import { TaskType, TaskComplexity } from '../../../src/shared/types/ai-assistant';

// Mock dependencies
const mockRealtimeDB = {
  ref: jest.fn(() => ({
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    once: jest.fn().mockResolvedValue({ val: () => ({}) }),
    on: jest.fn()
  }))
};

const mockFirestore = {
  collection: jest.fn(() => ({
    doc: jest.fn(() => ({
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue({ exists: false }),
      update: jest.fn().mockResolvedValue(undefined)
    })),
    where: jest.fn(() => ({
      get: jest.fn().mockResolvedValue({ docs: [] })
    }))
  })),
  runTransaction: jest.fn()
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

const mockMetrics = {
  counter: jest.fn(),
  histogram: jest.fn(),
  gauge: jest.fn()
};

const mockTaskClassifier = {
  classifyTask: jest.fn()
};

const mockCreditService = {
  validateBalance: jest.fn(),
  deductCredits: jest.fn()
};

describe('RTDBOrchestrator', () => {
  let orchestrator: RTDBOrchestrator;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    orchestrator = new RTDBOrchestrator(
      {
        realtimeDB: mockRealtimeDB as any,
        firestore: mockFirestore as any,
        logger: mockLogger as any,
        metrics: mockMetrics as any
      },
      mockTaskClassifier as any,
      mockCreditService as any
    );
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('AI Conversation Orchestration', () => {
    it('should orchestrate AI conversation workflow successfully', async () => {
      // Arrange
      const conversationRequest = {
        userId: 'user123',
        conversationId: 'conv123',
        message: 'Hello, AI!',
        context: {}
      };
      
      const mockClassification = {
        type: TaskType.QUICK_CHAT,
        estimatedDuration: 5,
        complexity: TaskComplexity.LOW,
        requiresAgentExecution: false,
        estimatedCreditCost: 10,
        confidence: 0.95,
        reasoning: 'Simple chat message'
      };
      
      mockTaskClassifier.classifyTask.mockResolvedValue(mockClassification);
      
      // Act
      const result = await orchestrator.orchestrateAIConversation(conversationRequest);
      
      // Assert
      expect(result).toBeDefined();
      expect(result.conversationId).toBe('conv123');
      expect(result.classification).toEqual(mockClassification);
      expect(result.workflowId).toBeDefined();
      
      expect(mockTaskClassifier.classifyTask).toHaveBeenCalledWith({
        conversationId: 'conv123',
        message: 'Hello, AI!',
        userId: 'user123',
        context: {}
      });
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Orchestrating AI conversation',
        expect.objectContaining({
          userId: 'user123',
          conversationId: 'conv123'
        })
      );
    });
    
    it('should handle AI conversation orchestration failure', async () => {
      // Arrange
      const conversationRequest = {
        userId: 'user123',
        conversationId: 'conv123',
        message: 'Hello, AI!',
        context: {}
      };
      
      const error = new Error('Classification failed');
      mockTaskClassifier.classifyTask.mockRejectedValue(error);
      
      // Act & Assert
      await expect(orchestrator.orchestrateAIConversation(conversationRequest))
        .rejects.toThrow('Classification failed');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'AI conversation orchestration failed',
        expect.objectContaining({
          userId: 'user123',
          error: 'Classification failed'
        })
      );
    });
  });
  
  describe('Credit Deduction Orchestration', () => {
    it('should orchestrate credit deduction workflow successfully', async () => {
      // Arrange
      const deductionRequest = {
        userId: 'user123',
        amount: 50,
        reason: 'AI assistant usage',
        metadata: { conversationId: 'conv123' }
      };
      
      // Act
      const result = await orchestrator.orchestrateCreditDeduction(deductionRequest);
      
      // Assert
      expect(result).toBeDefined();
      expect(result.userId).toBe('user123');
      expect(result.amount).toBe(50);
      expect(result.correlationId).toBeDefined();
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Orchestrating credit deduction',
        expect.objectContaining({
          userId: 'user123',
          amount: 50
        })
      );
      
      // Verify workflow was stored in Realtime DB
      expect(mockRealtimeDB.ref).toHaveBeenCalledWith(
        expect.stringMatching(/orchestration\/workflows\/credit_deduction_\d+/)
      );
    });
    
    it('should create proper workflow definition for credit deduction', async () => {
      // Arrange
      const deductionRequest = {
        userId: 'user123',
        amount: 100,
        reason: 'Image generation',
        metadata: { imageCount: 2 }
      };
      
      // Act
      await orchestrator.orchestrateCreditDeduction(deductionRequest);
      
      // Assert - verify workflow structure
      expect(mockRealtimeDB.ref().set).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringMatching(/credit_deduction_\d+/),
          status: 'pending',
          correlationId: expect.any(String)
        })
      );
    });
  });
  
  describe('Task Classification and Routing', () => {
    it('should route agent task to cloud function for long-running operations', async () => {
      // Arrange
      const classification = {
        type: TaskType.RESEARCH_TASK,
        estimatedDuration: 300,
        complexity: TaskComplexity.HIGH,
        requiresAgentExecution: true,
        estimatedCreditCost: 200,
        confidence: 0.85,
        reasoning: 'Complex research task requiring agent execution'
      };
      
      const request = {
        userId: 'user123',
        message: 'Research the latest AI developments'
      };
      
      // Act
      const result = await orchestrator.routeAITask(classification, request);
      
      // Assert
      expect(result.routingType).toBe('cloud_function');
      expect(result.taskId).toBeDefined();
      expect(result.estimatedCompletion).toBeDefined();
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Routing secure operation'),
        expect.objectContaining({
          operationType: SecureOperationType.CREDIT_TRANSACTION,
          securityLevel: SecurityLevel.AUTHENTICATED
        })
      );
    });
    
    it('should route quick task to API endpoint for immediate responses', async () => {
      // Arrange
      const classification = {
        type: TaskType.QUICK_CHAT,
        estimatedDuration: 5,
        complexity: TaskComplexity.LOW,
        requiresAgentExecution: false,
        estimatedCreditCost: 5,
        confidence: 0.95,
        reasoning: 'Simple chat response'
      };
      
      const request = {
        userId: 'user123',
        message: 'What time is it?'
      };
      
      // Act
      const result = await orchestrator.routeAITask(classification, request);
      
      // Assert
      expect(result.routingType).toBe('api_endpoint');
      expect(result.taskId).toBeDefined();
      expect(result.result).toBeDefined();
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Routing public operation'),
        expect.objectContaining({
          operationType: PublicOperationType.CONVERSATION_RETRIEVAL,
          requiresAuth: true
        })
      );
    });
  });
  
  describe('Saga Management', () => {
    it('should start saga successfully', async () => {
      // Arrange
      const sagaDefinition: SagaDefinition = {
        id: 'test_saga',
        name: 'Test Saga',
        steps: [
          {
            id: 'step1',
            name: 'Test Step',
            action: {
              type: 'test_action',
              handler: 'testHandler',
              parameters: {}
            }
          }
        ],
        compensationSteps: [],
        timeoutMs: 30000,
        retryPolicy: {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          retryableErrors: ['NETWORK_ERROR']
        }
      };
      
      // Act
      const sagaInstance = await orchestrator.startSaga(sagaDefinition);
      
      // Assert
      expect(sagaInstance).toBeDefined();
      expect(sagaInstance.id).toMatch(/saga_\d+_[a-z0-9]+/);
      expect(sagaInstance.definitionId).toBe('test_saga');
      expect(sagaInstance.status).toBe(SagaStatus.STARTED);
      expect(sagaInstance.correlationId).toBeDefined();
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting saga',
        expect.objectContaining({
          sagaId: sagaInstance.id,
          sagaName: 'Test Saga'
        })
      );
      
      // Verify saga was stored in Realtime DB
      expect(mockRealtimeDB.ref).toHaveBeenCalledWith(
        `orchestration/sagas/${sagaInstance.id}`
      );
    });
    
    it('should handle saga start failure', async () => {
      // Arrange
      const sagaDefinition: SagaDefinition = {
        id: 'failing_saga',
        name: 'Failing Saga',
        steps: [],
        compensationSteps: [],
        timeoutMs: 30000,
        retryPolicy: {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          retryableErrors: []
        }
      };
      
      // Mock Realtime DB failure
      mockRealtimeDB.ref.mockImplementation(() => ({
        set: jest.fn().mockRejectedValue(new Error('Database error'))
      }));
      
      // Act & Assert
      await expect(orchestrator.startSaga(sagaDefinition))
        .rejects.toThrow('Database error');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start saga',
        expect.objectContaining({
          error: 'Database error'
        })
      );
    });
  });
  
  describe('Operation Validation', () => {
    it('should validate secure operation successfully', async () => {
      // Arrange
      const secureOperation = {
        id: 'op123',
        type: SecureOperationType.CREDIT_TRANSACTION,
        userId: 'user123',
        data: { amount: 50 },
        securityLevel: SecurityLevel.AUTHENTICATED,
        requiresElevatedPermissions: false,
        auditRequired: true,
        correlationId: 'corr123'
      };
      
      // Act
      const result = await (orchestrator as any).validateOperation(secureOperation);
      
      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should reject operation with missing required fields', async () => {
      // Arrange
      const invalidOperation = {
        id: '',
        type: SecureOperationType.CREDIT_TRANSACTION,
        userId: 'user123',
        data: {},
        securityLevel: SecurityLevel.AUTHENTICATED,
        requiresElevatedPermissions: false,
        auditRequired: true,
        correlationId: ''
      };
      
      // Act
      const result = await (orchestrator as any).validateOperation(invalidOperation);
      
      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Operation ID is required');
      expect(result.errors).toContain('Correlation ID is required');
    });
    
    it('should reject admin operation for non-admin user', async () => {
      // Arrange
      const adminOperation = {
        id: 'op123',
        type: SecureOperationType.ADMIN_OPERATION,
        userId: 'user123',
        data: {},
        securityLevel: SecurityLevel.ADMIN,
        requiresElevatedPermissions: true,
        auditRequired: true,
        correlationId: 'corr123'
      };
      
      // Act
      const result = await (orchestrator as any).validateOperation(adminOperation);
      
      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Admin privileges required');
    });
  });
  
  describe('Execution Path Determination', () => {
    it('should route secure operations to cloud functions', () => {
      // Arrange
      const secureOperation = {
        id: 'op123',
        type: SecureOperationType.PAYMENT_PROCESSING,
        userId: 'user123',
        data: {},
        securityLevel: SecurityLevel.ELEVATED,
        requiresElevatedPermissions: true,
        auditRequired: true,
        correlationId: 'corr123'
      };
      
      // Act
      const executionPath = (orchestrator as any).determineExecutionPath(secureOperation);
      
      // Assert
      expect(executionPath.type).toBe('cloud_function');
      expect(executionPath.target).toBe('paymentProcessingFunction');
    });
    
    it('should route public operations to API endpoints', () => {
      // Arrange
      const publicOperation = {
        id: 'op123',
        type: PublicOperationType.BALANCE_QUERY,
        userId: 'user123',
        data: {},
        requiresAuth: true,
        rateLimited: true,
        correlationId: 'corr123'
      };
      
      // Act
      const executionPath = (orchestrator as any).determineExecutionPath(publicOperation);
      
      // Assert
      expect(executionPath.type).toBe('api_endpoint');
      expect(executionPath.target).toBe('/api/v1/credits/balance');
    });
  });
  
  describe('Workflow Step Execution', () => {
    it('should execute validation step successfully', async () => {
      // Arrange
      const step = {
        id: 'validate_step',
        name: 'Validation Step',
        type: StepType.VALIDATION,
        action: {
          type: 'validate_balance',
          handler: 'validateBalance',
          parameters: { userId: 'user123', amount: 50 }
        }
      };
      
      const execution = {
        id: 'workflow123',
        definition: { context: {} },
        stepResults: []
      };
      
      // Act
      const result = await (orchestrator as any).executeWorkflowStep(step, execution);
      
      // Assert
      expect(result.stepId).toBe('validate_step');
      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.result).toBeDefined();
      expect(result.duration).toBeGreaterThan(0);
    });
    
    it('should handle step execution failure', async () => {
      // Arrange
      const step = {
        id: 'failing_step',
        name: 'Failing Step',
        type: 'UNSUPPORTED_TYPE', // This will cause failure
        action: {
          type: 'unknown_action',
          handler: 'unknownHandler',
          parameters: {}
        }
      };
      
      const execution = {
        id: 'workflow123',
        definition: { context: {} },
        stepResults: []
      };
      
      // Act
      const result = await (orchestrator as any).executeWorkflowStep(step, execution);
      
      // Assert
      expect(result.stepId).toBe('failing_step');
      expect(result.status).toBe(ExecutionStatus.FAILURE);
      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('Unsupported step type');
    });
  });
  
  describe('Error Handling', () => {
    it('should determine compensation requirement correctly', () => {
      // Arrange
      const compensationRequiredError = new Error('CREDIT_DEDUCTION_FAILED: Transaction failed');
      const normalError = new Error('VALIDATION_ERROR: Invalid input');
      
      // Act
      const requiresCompensation1 = (orchestrator as any).isCompensationRequired(compensationRequiredError);
      const requiresCompensation2 = (orchestrator as any).isCompensationRequired(normalError);
      
      // Assert
      expect(requiresCompensation1).toBe(true);
      expect(requiresCompensation2).toBe(false);
    });
    
    it('should identify retryable errors correctly', () => {
      // Arrange
      const retryableError = new Error('NETWORK_ERROR: Connection timeout');
      const nonRetryableError = new Error('VALIDATION_ERROR: Invalid data');
      
      // Act
      const isRetryable1 = (orchestrator as any).isRetryableError(retryableError);
      const isRetryable2 = (orchestrator as any).isRetryableError(nonRetryableError);
      
      // Assert
      expect(isRetryable1).toBe(true);
      expect(isRetryable2).toBe(false);
    });
  });
  
  describe('Metrics and Monitoring', () => {
    it('should record workflow execution metrics', async () => {
      // Arrange
      const conversationRequest = {
        userId: 'user123',
        conversationId: 'conv123',
        message: 'Test message',
        context: {}
      };
      
      mockTaskClassifier.classifyTask.mockResolvedValue({
        type: TaskType.QUICK_CHAT,
        estimatedDuration: 5,
        complexity: TaskComplexity.LOW,
        requiresAgentExecution: false,
        estimatedCreditCost: 10,
        confidence: 0.95,
        reasoning: 'Simple chat'
      });
      
      // Act
      await orchestrator.orchestrateAIConversation(conversationRequest);
      
      // Assert
      expect(mockMetrics.histogram).toHaveBeenCalledWith(
        'workflow.execution_time',
        expect.any(Number),
        expect.objectContaining({
          workflow_type: WorkflowType.AI_CREDIT_DEDUCTION
        })
      );
    });
    
    it('should record saga metrics', async () => {
      // Arrange
      const sagaDefinition: SagaDefinition = {
        id: 'test_saga',
        name: 'Test Saga',
        steps: [],
        compensationSteps: [],
        timeoutMs: 30000,
        retryPolicy: {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          retryableErrors: []
        }
      };
      
      // Act
      await orchestrator.startSaga(sagaDefinition);
      
      // Assert
      expect(mockMetrics.histogram).toHaveBeenCalledWith(
        'saga.start_time',
        expect.any(Number),
        expect.objectContaining({
          definition_id: 'test_saga'
        })
      );
      
      expect(mockMetrics.counter).toHaveBeenCalledWith(
        'saga.started',
        1,
        expect.objectContaining({
          definition_id: 'test_saga'
        })
      );
    });
  });
});