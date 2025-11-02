/**
 * Saga Manager Implementation
 * Manages distributed transactions with compensation patterns for credit and payment operations
 */

import { Database } from 'firebase-admin/database';
import { Firestore } from 'firebase-admin/firestore';
import {
  ISagaManager,
  SagaDefinition,
  SagaInstance,
  SagaEvent,
  SagaResult,
  SagaState,
  SagaMetrics,
  CompensationResult,
  SagaStatus,
  SagaEventType,
  CompensationStatus,
  CompensationStrategy,
  SagaStep
} from '../types/orchestration';
import { IStructuredLogger } from '../observability/logger';
import { IMetricsCollector } from '../observability/metrics';
import { IEventBus } from '../types/orchestration';

/**
 * Dependencies for saga manager
 */
export interface SagaManagerDependencies {
  realtimeDB: Database;
  firestore: Firestore;
  eventBus: IEventBus;
  logger: IStructuredLogger;
  metrics: IMetricsCollector;
}

/**
 * Saga manager implementation with compensation patterns
 */
export class SagaManager implements ISagaManager {
  private realtimeDB: Database;
  private firestore: Firestore;
  // private eventBus: IEventBus; // TODO: Use for publishing saga events
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  
  // Internal state
  private activeSagas: Map<string, SagaExecution> = new Map();
  private sagaDefinitions: Map<string, SagaDefinition> = new Map();
  private compensationHandlers: Map<string, CompensationHandler> = new Map();
  
  constructor(dependencies: SagaManagerDependencies) {
    this.realtimeDB = dependencies.realtimeDB;
    this.firestore = dependencies.firestore;
    // this.eventBus = dependencies.eventBus; // TODO: Use for publishing saga events
    this.logger = dependencies.logger;
    this.metrics = dependencies.metrics;
    
    this.initializeSagaManager();
  }
  
  // ============================================================================
  // Saga Lifecycle Management
  // ============================================================================
  
  async startSaga(definition: SagaDefinition): Promise<SagaInstance> {
    const sagaId = `saga_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting saga', {
        sagaId,
        definitionId: definition.id,
        sagaName: definition.name
      });
      
      // Create saga instance
      const sagaInstance: SagaInstance = {
        id: sagaId,
        definitionId: definition.id,
        status: SagaStatus.STARTED,
        currentStep: 0,
        context: {
          correlationId: this.generateCorrelationId(),
          variables: {},
          stepResults: {},
          compensationData: {}
        },
        startedAt: new Date(),
        correlationId: this.generateCorrelationId()
      };
      
      // Create saga execution context
      const sagaExecution: SagaExecution = {
        instance: sagaInstance,
        definition,
        stepExecutions: [],
        compensationPlan: null,
        lastHeartbeat: new Date()
      };
      
      // Store in active sagas
      this.activeSagas.set(sagaId, sagaExecution);
      
      // Persist saga state
      await this.persistSagaState(sagaInstance);
      
      // Start saga execution
      await this.executeSaga(sagaExecution);
      
      // Update metrics
      this.metrics.histogram('saga.start_time', Date.now() - startTime, {
        definition_id: definition.id
      });
      
      this.metrics.counter('saga.started', 1, {
        definition_id: definition.id
      });
      
      return sagaInstance;
      
    } catch (error) {
      this.logger.error('Failed to start saga', {
        sagaId,
        definitionId: definition.id,
        error: error instanceof Error ? error.message : String(error)
      });
      
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      this.metrics.counter('saga.start_errors', 1, {
        definition_id: definition.id,
        error_type: this.categorizeError(errorInstance)
      });
      
      throw errorInstance;
    }
  }
  
  async continueSaga(sagaId: string, event: SagaEvent): Promise<SagaResult> {
    try {
      this.logger.info('Continuing saga', {
        sagaId,
        eventType: event.type
      });
      
      const sagaExecution = this.activeSagas.get(sagaId);
      if (!sagaExecution) {
        // Try to load from persistence
        const sagaState = await this.loadSagaState(sagaId);
        if (!sagaState) {
          throw new Error(`Saga not found: ${sagaId}`);
        }
        
        // Reconstruct saga execution
        const definition = this.sagaDefinitions.get(sagaState.definitionId);
        if (!definition) {
          throw new Error(`Saga definition not found: ${sagaState.definitionId}`);
        }
        
        const reconstructedExecution = await this.reconstructSagaExecution(sagaState, definition);
        this.activeSagas.set(sagaId, reconstructedExecution);
      }
      
      const execution = this.activeSagas.get(sagaId)!;
      
      // Process the event
      await this.processSagaEvent(execution, event);
      
      // Continue execution if needed
      if (execution.instance.status === SagaStatus.IN_PROGRESS) {
        await this.executeSaga(execution);
      }
      
      return {
        sagaId,
        status: execution.instance.status,
        result: execution.instance.context.stepResults,
        completedAt: execution.instance.completedAt
      };
      
    } catch (error) {
      this.logger.error('Failed to continue saga', {
        sagaId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }
  
  async compensateSaga(sagaId: string): Promise<CompensationResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting saga compensation', { sagaId });
      
      const sagaExecution = this.activeSagas.get(sagaId);
      if (!sagaExecution) {
        throw new Error(`Saga not found: ${sagaId}`);
      }
      
      sagaExecution.instance.status = SagaStatus.COMPENSATING;
      await this.persistSagaState(sagaExecution.instance);
      
      // Create compensation plan
      const compensationPlan = await this.createCompensationPlan(sagaExecution);
      sagaExecution.compensationPlan = compensationPlan;
      
      // Execute compensation steps
      const compensationResult = await this.executeCompensation(sagaExecution);
      
      // Update saga status based on compensation result
      if (compensationResult.status === CompensationStatus.SUCCESS) {
        sagaExecution.instance.status = SagaStatus.COMPENSATED;
      } else {
        sagaExecution.instance.status = SagaStatus.FAILED;
      }
      
      sagaExecution.instance.completedAt = new Date();
      await this.persistSagaState(sagaExecution.instance);
      
      // Clean up
      this.activeSagas.delete(sagaId);
      
      // Update metrics
      this.metrics.histogram('saga.compensation_time', Date.now() - startTime, {
        definition_id: sagaExecution.definition.id,
        status: compensationResult.status
      });
      
      this.metrics.counter('saga.compensated', 1, {
        definition_id: sagaExecution.definition.id,
        status: compensationResult.status
      });
      
      return compensationResult;
      
    } catch (error) {
      this.logger.error('Saga compensation failed', {
        sagaId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      this.metrics.counter('saga.compensation_errors', 1, {
        error_type: this.categorizeError(errorInstance)
      });
      
      throw errorInstance;
    }
  }
  
  // ============================================================================
  // Saga State Management
  // ============================================================================
  
  async getSagaState(sagaId: string): Promise<SagaState> {
    try {
      // First check active sagas
      const activeExecution = this.activeSagas.get(sagaId);
      if (activeExecution) {
        return this.convertToSagaState(activeExecution.instance);
      }
      
      // Load from persistence
      const sagaState = await this.loadSagaState(sagaId);
      if (!sagaState) {
        throw new Error(`Saga state not found: ${sagaId}`);
      }
      
      return sagaState;
      
    } catch (error) {
      this.logger.error('Failed to get saga state', {
        sagaId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }
  
  async updateSagaState(sagaId: string, state: SagaState): Promise<void> {
    try {
      this.logger.debug('Updating saga state', {
        sagaId,
        status: state.status,
        currentStep: state.currentStep
      });
      
      // Update active saga if exists
      const activeExecution = this.activeSagas.get(sagaId);
      if (activeExecution) {
        this.updateExecutionFromState(activeExecution, state);
      }
      
      // Persist to storage
      await this.persistSagaStateFromState(state);
      
    } catch (error) {
      this.logger.error('Failed to update saga state', {
        sagaId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }
  
  // ============================================================================
  // Saga Monitoring
  // ============================================================================
  
  async getSagaMetrics(): Promise<SagaMetrics> {
    try {
      const activeSagas = this.activeSagas.size;
      
      // Get metrics from Firestore
      const metricsSnapshot = await this.firestore.collection('saga_metrics').doc('current').get();
      const storedMetrics = metricsSnapshot.data() || {};
      
      const metrics: SagaMetrics = {
        totalSagas: storedMetrics.totalSagas || 0,
        activeSagas,
        completedSagas: storedMetrics.completedSagas || 0,
        failedSagas: storedMetrics.failedSagas || 0,
        compensatedSagas: storedMetrics.compensatedSagas || 0,
        averageExecutionTime: storedMetrics.averageExecutionTime || 0,
        successRate: this.calculateSuccessRate(storedMetrics)
      };
      
      return metrics;
      
    } catch (error) {
      this.logger.error('Failed to get saga metrics', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      
      return {
        totalSagas: 0,
        activeSagas: 0,
        completedSagas: 0,
        failedSagas: 0,
        compensatedSagas: 0,
        averageExecutionTime: 0,
        successRate: 0
      };
    }
  }
  
  async getActiveSagas(): Promise<SagaInstance[]> {
    return Array.from(this.activeSagas.values()).map(execution => execution.instance);
  }
  
  // ============================================================================
  // Private Implementation Methods
  // ============================================================================
  
  private async initializeSagaManager(): Promise<void> {
    this.logger.info('Initializing saga manager');
    
    // Load saga definitions
    await this.loadSagaDefinitions();
    
    // Register compensation handlers
    this.registerCompensationHandlers();
    
    // Recover active sagas
    await this.recoverActiveSagas();
    
    // Start heartbeat monitoring
    this.startHeartbeatMonitoring();
    
    // Initialize metrics
    this.initializeMetrics();
  }
  
  private async loadSagaDefinitions(): Promise<void> {
    try {
      // Load predefined saga definitions for credit and payment operations
      const creditDeductionSaga: SagaDefinition = {
        id: 'credit_deduction_saga',
        name: 'Credit Deduction Saga',
        steps: [
          {
            id: 'validate_balance',
            name: 'Validate Balance',
            action: {
              type: 'validate_balance',
              handler: 'validateBalance',
              parameters: {}
            },
            compensationAction: {
              type: 'no_compensation',
              handler: 'noCompensation',
              parameters: {}
            }
          },
          {
            id: 'deduct_credits',
            name: 'Deduct Credits',
            action: {
              type: 'deduct_credits',
              handler: 'deductCredits',
              parameters: {}
            },
            compensationAction: {
              type: 'refund_credits',
              handler: 'refundCredits',
              parameters: {}
            }
          },
          {
            id: 'record_ledger',
            name: 'Record in Ledger',
            action: {
              type: 'record_ledger',
              handler: 'recordLedger',
              parameters: {}
            },
            compensationAction: {
              type: 'remove_ledger_entry',
              handler: 'removeLedgerEntry',
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
          retryableErrors: ['NETWORK_ERROR', 'TIMEOUT_ERROR']
        }
      };
      
      const paymentProcessingSaga: SagaDefinition = {
        id: 'payment_processing_saga',
        name: 'Payment Processing Saga',
        steps: [
          {
            id: 'validate_payment',
            name: 'Validate Payment',
            action: {
              type: 'validate_payment',
              handler: 'validatePayment',
              parameters: {}
            }
          },
          {
            id: 'process_payment',
            name: 'Process Payment',
            action: {
              type: 'process_payment',
              handler: 'processPayment',
              parameters: {}
            },
            compensationAction: {
              type: 'refund_payment',
              handler: 'refundPayment',
              parameters: {}
            }
          },
          {
            id: 'add_credits',
            name: 'Add Credits',
            action: {
              type: 'add_credits',
              handler: 'addCredits',
              parameters: {}
            },
            compensationAction: {
              type: 'remove_credits',
              handler: 'removeCredits',
              parameters: {}
            }
          }
        ],
        compensationSteps: [],
        timeoutMs: 60000,
        retryPolicy: {
          maxRetries: 5,
          initialDelayMs: 2000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
          retryableErrors: ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'PAYMENT_GATEWAY_ERROR']
        }
      };
      
      this.sagaDefinitions.set(creditDeductionSaga.id, creditDeductionSaga);
      this.sagaDefinitions.set(paymentProcessingSaga.id, paymentProcessingSaga);
      
      this.logger.info('Loaded saga definitions', {
        count: this.sagaDefinitions.size
      });
      
    } catch (error) {
      this.logger.error('Failed to load saga definitions', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
  
  private registerCompensationHandlers(): void {
    // Register compensation handlers for different operation types
    this.compensationHandlers.set('refund_credits', new CreditRefundHandler());
    this.compensationHandlers.set('remove_ledger_entry', new LedgerRemovalHandler());
    this.compensationHandlers.set('refund_payment', new PaymentRefundHandler());
    this.compensationHandlers.set('remove_credits', new CreditRemovalHandler());
  }
  
  private async recoverActiveSagas(): Promise<void> {
    try {
      this.logger.info('Recovering active sagas');
      
      // Query Firestore for active sagas
      const activeSagasSnapshot = await this.firestore
        .collection('saga_states')
        .where('status', 'in', [SagaStatus.STARTED, SagaStatus.IN_PROGRESS, SagaStatus.COMPENSATING])
        .get();
      
      for (const doc of activeSagasSnapshot.docs) {
        const sagaState = doc.data() as SagaState;
        
        try {
          const definition = this.sagaDefinitions.get(sagaState.definitionId);
          if (definition) {
            const execution = await this.reconstructSagaExecution(sagaState, definition);
            this.activeSagas.set(sagaState.id, execution);
            
            this.logger.info('Recovered saga', {
              sagaId: sagaState.id,
              status: sagaState.status,
              currentStep: sagaState.currentStep
            });
          }
        } catch (error) {
          this.logger.error('Failed to recover saga', {
            sagaId: sagaState.id,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      this.logger.info('Saga recovery completed', {
        recoveredCount: this.activeSagas.size
      });
      
    } catch (error) {
      this.logger.error('Saga recovery failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
  
  private async executeSaga(sagaExecution: SagaExecution): Promise<void> {
    try {
      sagaExecution.instance.status = SagaStatus.IN_PROGRESS;
      await this.persistSagaState(sagaExecution.instance);
      
      // Execute steps sequentially
      for (let i = sagaExecution.instance.currentStep; i < sagaExecution.definition.steps.length; i++) {
        const step = sagaExecution.definition.steps[i];
        sagaExecution.instance.currentStep = i;
        
        this.logger.info('Executing saga step', {
          sagaId: sagaExecution.instance.id,
          stepId: step.id,
          stepName: step.name
        });
        
        try {
          const stepResult = await this.executeSagaStep(step, sagaExecution);
          
          // Store step result
          sagaExecution.instance.context.stepResults[step.id] = stepResult;
          sagaExecution.stepExecutions.push({
            stepId: step.id,
            status: 'completed',
            result: stepResult,
            executedAt: new Date()
          });
          
          // Update saga state
          await this.persistSagaState(sagaExecution.instance);
          
        } catch (error) {
          const errorInstance = error instanceof Error ? error : new Error(String(error));
          this.logger.error('Saga step failed', {
            sagaId: sagaExecution.instance.id,
            stepId: step.id,
            error: errorInstance.message
          });
          
          // Mark step as failed
          sagaExecution.stepExecutions.push({
            stepId: step.id,
            status: 'failed',
            error: errorInstance.message,
            executedAt: new Date()
          });
          
          // Start compensation
          await this.compensateSaga(sagaExecution.instance.id);
          return;
        }
      }
      
      // All steps completed successfully
      sagaExecution.instance.status = SagaStatus.COMPLETED;
      sagaExecution.instance.completedAt = new Date();
      await this.persistSagaState(sagaExecution.instance);
      
      // Clean up
      this.activeSagas.delete(sagaExecution.instance.id);
      
      this.logger.info('Saga completed successfully', {
        sagaId: sagaExecution.instance.id
      });
      
    } catch (error) {
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Saga execution failed', {
        sagaId: sagaExecution.instance.id,
        error: errorInstance.message
      });
      
      sagaExecution.instance.status = SagaStatus.FAILED;
      sagaExecution.instance.error = {
        code: 'SAGA_EXECUTION_FAILED',
        message: errorInstance.message,
        compensationRequired: true
      };
      
      await this.persistSagaState(sagaExecution.instance);
    }
  }
  
  private async executeSagaStep(step: SagaStep, sagaExecution: SagaExecution): Promise<any> {
    // This would execute the actual step logic
    // For now, return a mock result
    return {
      stepId: step.id,
      executed: true,
      timestamp: new Date()
    };
  }
  
  private async createCompensationPlan(sagaExecution: SagaExecution): Promise<CompensationPlan> {
    const completedSteps = sagaExecution.stepExecutions
      .filter(execution => execution.status === 'completed')
      .reverse(); // Compensate in reverse order
    
    const compensationSteps = completedSteps
      .map(stepExecution => {
        const stepDefinition = sagaExecution.definition.steps
          .find(step => step.id === stepExecution.stepId);
        
        if (stepDefinition?.compensationAction) {
          return {
            id: `comp_${stepDefinition.id}`,
            name: `Compensate ${stepDefinition.name}`,
            action: stepDefinition.compensationAction
          };
        }
        
        return null;
      })
      .filter(step => step !== null) as any[];
    
    return {
      sagaId: sagaExecution.instance.id,
      reason: 'Saga step failure',
      steps: compensationSteps,
      strategy: CompensationStrategy.ROLLBACK
    };
  }
  
  private async executeCompensation(sagaExecution: SagaExecution): Promise<CompensationResult> {
    const compensationPlan = sagaExecution.compensationPlan!;
    const compensatedSteps: string[] = [];
    const errors: any[] = [];
    
    for (const step of compensationPlan.steps) {
      try {
        this.logger.info('Executing compensation step', {
          sagaId: sagaExecution.instance.id,
          stepId: step.id
        });
        
        const handler = this.compensationHandlers.get(step.action.type);
        if (handler) {
          await handler.execute(step.action.parameters, sagaExecution.instance.context);
          compensatedSteps.push(step.id);
        } else {
          this.logger.warn('No compensation handler found', {
            actionType: step.action.type,
            stepId: step.id
          });
        }
        
      } catch (error) {
        const errorInstance = error instanceof Error ? error : new Error(String(error));
        this.logger.error('Compensation step failed', {
          sagaId: sagaExecution.instance.id,
          stepId: step.id,
          error: errorInstance.message
        });
        
        errors.push({
          stepId: step.id,
          error: errorInstance.message,
          timestamp: new Date()
        });
      }
    }
    
    const status = errors.length === 0 ? CompensationStatus.SUCCESS :
                  compensatedSteps.length > 0 ? CompensationStatus.PARTIAL :
                  CompensationStatus.FAILED;
    
    return {
      sagaId: sagaExecution.instance.id,
      status,
      compensatedSteps,
      errors,
      completedAt: new Date()
    };
  }
  
  private async processSagaEvent(sagaExecution: SagaExecution, event: SagaEvent): Promise<void> {
    this.logger.info('Processing saga event', {
      sagaId: sagaExecution.instance.id,
      eventType: event.type
    });
    
    switch (event.type) {
      case SagaEventType.STEP_COMPLETED:
        // Handle step completion
        break;
        
      case SagaEventType.STEP_FAILED:
        // Handle step failure
        break;
        
      case SagaEventType.COMPENSATION_REQUIRED:
        // Start compensation
        await this.compensateSaga(sagaExecution.instance.id);
        break;
        
      default:
        this.logger.warn('Unknown saga event type', {
          eventType: event.type,
          sagaId: sagaExecution.instance.id
        });
    }
  }
  
  private async persistSagaState(sagaInstance: SagaInstance): Promise<void> {
    const sagaState: SagaState = this.convertToSagaState(sagaInstance);
    
    // Store in Firestore
    await this.firestore.collection('saga_states').doc(sagaInstance.id).set({
      ...sagaState,
      startedAt: sagaState.startedAt.toISOString(),
      lastUpdated: sagaState.lastUpdated.toISOString(),
      completedAt: sagaState.completedAt?.toISOString()
    });
    
    // Store in Realtime Database for real-time updates
    await this.realtimeDB.ref(`orchestration/sagas/${sagaInstance.id}`).set({
      id: sagaInstance.id,
      status: sagaInstance.status,
      currentStep: sagaInstance.currentStep,
      lastUpdated: new Date().toISOString()
    });
  }
  
  private async persistSagaStateFromState(sagaState: SagaState): Promise<void> {
    await this.firestore.collection('saga_states').doc(sagaState.id).set({
      ...sagaState,
      startedAt: sagaState.startedAt.toISOString(),
      lastUpdated: sagaState.lastUpdated.toISOString(),
      completedAt: sagaState.completedAt?.toISOString()
    });
  }
  
  private async loadSagaState(sagaId: string): Promise<SagaState | null> {
    try {
      const doc = await this.firestore.collection('saga_states').doc(sagaId).get();
      
      if (!doc.exists) {
        return null;
      }
      
      const data = doc.data()!;
      return {
        ...data,
        startedAt: new Date(data.startedAt),
        lastUpdated: new Date(data.lastUpdated),
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined
      } as SagaState;
      
    } catch (error) {
      this.logger.error('Failed to load saga state', {
        sagaId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return null;
    }
  }
  
  private async reconstructSagaExecution(sagaState: SagaState, definition: SagaDefinition): Promise<SagaExecution> {
    const sagaInstance: SagaInstance = {
      id: sagaState.id,
      definitionId: sagaState.definitionId,
      status: sagaState.status,
      currentStep: sagaState.currentStep,
      context: sagaState.context,
      startedAt: sagaState.startedAt,
      completedAt: sagaState.completedAt,
      error: sagaState.error,
      correlationId: sagaState.context.correlationId
    };
    
    return {
      instance: sagaInstance,
      definition,
      stepExecutions: [], // Would be reconstructed from stored data
      compensationPlan: null,
      lastHeartbeat: new Date()
    };
  }
  
  private convertToSagaState(sagaInstance: SagaInstance): SagaState {
    return {
      id: sagaInstance.id,
      definitionId: sagaInstance.definitionId,
      status: sagaInstance.status,
      currentStep: sagaInstance.currentStep,
      context: sagaInstance.context,
      startedAt: sagaInstance.startedAt,
      lastUpdated: new Date(),
      completedAt: sagaInstance.completedAt,
      error: sagaInstance.error
    };
  }
  
  private updateExecutionFromState(execution: SagaExecution, state: SagaState): void {
    execution.instance.status = state.status;
    execution.instance.currentStep = state.currentStep;
    execution.instance.context = state.context;
    execution.instance.completedAt = state.completedAt;
    execution.instance.error = state.error;
  }
  
  private startHeartbeatMonitoring(): void {
    // Monitor saga heartbeats every 30 seconds
    setInterval(async () => {
      const now = new Date();
      const staleThreshold = 5 * 60 * 1000; // 5 minutes
      
      for (const [sagaId, execution] of this.activeSagas.entries()) {
        const timeSinceHeartbeat = now.getTime() - execution.lastHeartbeat.getTime();
        
        if (timeSinceHeartbeat > staleThreshold) {
          this.logger.warn('Stale saga detected', {
            sagaId,
            timeSinceHeartbeat
          });
          
          // Could implement recovery logic here
        }
      }
    }, 30000);
  }
  
  private initializeMetrics(): void {
    this.metrics.gauge('saga.active_count', () => this.activeSagas.size);
    this.metrics.gauge('saga.definitions_count', () => this.sagaDefinitions.size);
  }
  
  private generateCorrelationId(): string {
    return `saga_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private categorizeError(error: Error): string {
    if (error.message.includes('NETWORK')) return 'network';
    if (error.message.includes('TIMEOUT')) return 'timeout';
    if (error.message.includes('VALIDATION')) return 'validation';
    if (error.message.includes('BUSINESS')) return 'business';
    return 'unknown';
  }
  
  private calculateSuccessRate(metrics: any): number {
    const total = (metrics.completedSagas || 0) + (metrics.failedSagas || 0);
    return total > 0 ? (metrics.completedSagas || 0) / total : 0;
  }
}

// ============================================================================
// Supporting Classes and Interfaces
// ============================================================================

interface SagaExecution {
  instance: SagaInstance;
  definition: SagaDefinition;
  stepExecutions: StepExecution[];
  compensationPlan: CompensationPlan | null;
  lastHeartbeat: Date;
}

interface StepExecution {
  stepId: string;
  status: 'completed' | 'failed';
  result?: any;
  error?: string;
  executedAt: Date;
}

interface CompensationPlan {
  sagaId: string;
  reason: string;
  steps: any[];
  strategy: CompensationStrategy;
}

interface CompensationHandler {
  execute(parameters: any, context: any): Promise<void>;
}

class CreditRefundHandler implements CompensationHandler {
  async execute(parameters: any, context: any): Promise<void> {
    // Implement credit refund logic
    console.log('Executing credit refund compensation', { parameters, context });
  }
}

class LedgerRemovalHandler implements CompensationHandler {
  async execute(parameters: any, context: any): Promise<void> {
    // Implement ledger entry removal logic
    console.log('Executing ledger removal compensation', { parameters, context });
  }
}

class PaymentRefundHandler implements CompensationHandler {
  async execute(parameters: any, context: any): Promise<void> {
    // Implement payment refund logic
    console.log('Executing payment refund compensation', { parameters, context });
  }
}

class CreditRemovalHandler implements CompensationHandler {
  async execute(parameters: any, context: any): Promise<void> {
    // Implement credit removal logic
    console.log('Executing credit removal compensation', { parameters, context });
  }
}