/**
 * Orchestration System Types
 * Core interfaces for Firebase Realtime Database orchestration, workflows, and event-driven architecture
 */

// ============================================================================
// Core Orchestration Interfaces
// ============================================================================

/**
 * Main orchestrator interface for Firebase Realtime Database coordination
 */
export interface IRTDBOrchestrator {
  // Workflow orchestration
  orchestrateWorkflow<T>(workflow: WorkflowDefinition<T>): Promise<WorkflowResult<T>>;
  handleEvent(event: SystemEvent): Promise<EventResult>;
  
  // Security-based routing with event sourcing
  routeSecureOperation(operation: SecureOperation): Promise<CloudFunctionResult>;
  routePublicOperation(operation: PublicOperation): Promise<APIResult>;
  
  // Real-time synchronization with guaranteed delivery
  syncStateChange(stateChange: StateChange): Promise<SyncResult>;
  broadcastEvent(event: BroadcastEvent): Promise<BroadcastResult>;
  
  // Saga pattern implementation
  startSaga(sagaDefinition: SagaDefinition): Promise<SagaInstance>;
  compensateSaga(sagaId: string, compensationPlan: CompensationPlan): Promise<CompensationResult>;
  
  // Health and monitoring
  getSystemHealth(): Promise<SystemHealthStatus>;
  getWorkflowMetrics(): Promise<WorkflowMetrics>;
}

/**
 * Event bus interface for guaranteed message delivery
 */
export interface IEventBus {
  // Event publishing with guaranteed delivery
  publish<T>(event: Event<T>): Promise<PublishResult>;
  publishBatch<T>(events: Event<T>[]): Promise<BatchPublishResult>;
  
  // Event subscription with error handling
  subscribe<T>(eventType: string, handler: EventHandler<T>): Promise<Subscription>;
  subscribeWithRetry<T>(eventType: string, handler: EventHandler<T>, retryPolicy: RetryPolicy): Promise<Subscription>;
  
  // Dead letter queue management
  handleFailedEvent(event: Event<any>, error: Error): Promise<DLQResult>;
  reprocessDLQEvents(filter?: DLQFilter): Promise<ReprocessResult>;
}

/**
 * Saga manager interface for distributed transactions
 */
export interface ISagaManager {
  // Saga lifecycle management
  startSaga(definition: SagaDefinition): Promise<SagaInstance>;
  continueSaga(sagaId: string, event: SagaEvent): Promise<SagaResult>;
  compensateSaga(sagaId: string): Promise<CompensationResult>;
  
  // Saga state management
  getSagaState(sagaId: string): Promise<SagaState>;
  updateSagaState(sagaId: string, state: SagaState): Promise<void>;
  
  // Saga monitoring
  getSagaMetrics(): Promise<SagaMetrics>;
  getActiveSagas(): Promise<SagaInstance[]>;
}

// ============================================================================
// Workflow and Operation Types
// ============================================================================

/**
 * Workflow definition for orchestrated operations
 */
export interface WorkflowDefinition<T = any> {
  id: string;
  name: string;
  type: WorkflowType;
  steps: WorkflowStep[];
  context: T;
  timeout: number;
  retryPolicy: RetryPolicy;
  compensationPolicy: CompensationPolicy;
}

/**
 * Individual workflow step
 */
export interface WorkflowStep {
  id: string;
  name: string;
  type: StepType;
  action: StepAction;
  conditions?: StepCondition[];
  timeout?: number;
  retryPolicy?: RetryPolicy;
  compensationAction?: CompensationAction;
}

/**
 * Workflow execution result
 */
export interface WorkflowResult<T = any> {
  workflowId: string;
  status: WorkflowStatus;
  result?: T;
  error?: WorkflowError;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  stepsExecuted: StepResult[];
}

/**
 * System event for orchestration
 */
export interface SystemEvent {
  id: string;
  type: string;
  aggregateId: string;
  aggregateType: string;
  eventData: any;
  metadata: EventMetadata;
  timestamp: Date;
  version: number;
  correlationId: string;
  causationId?: string;
}

/**
 * Event metadata for tracking
 */
export interface EventMetadata {
  userId?: string;
  sessionId?: string;
  source: string;
  environment: string;
  traceId: string;
  spanId: string;
  priority: EventPriority;
}

// ============================================================================
// Security and Routing Types
// ============================================================================

/**
 * Secure operation requiring cloud function execution
 */
export interface SecureOperation {
  id: string;
  type: SecureOperationType;
  userId: string;
  data: any;
  securityLevel: SecurityLevel;
  requiresElevatedPermissions: boolean;
  auditRequired: boolean;
  correlationId: string;
}

/**
 * Public operation for API endpoint handling
 */
export interface PublicOperation {
  id: string;
  type: PublicOperationType;
  userId?: string;
  data: any;
  requiresAuth: boolean;
  rateLimited: boolean;
  correlationId: string;
}

/**
 * Cloud function execution result
 */
export interface CloudFunctionResult {
  operationId: string;
  functionName: string;
  status: ExecutionStatus;
  result?: any;
  error?: ExecutionError;
  executionTime: number;
  resourcesUsed: ResourceUsage;
}

/**
 * API endpoint execution result
 */
export interface APIResult {
  operationId: string;
  endpoint: string;
  status: ExecutionStatus;
  result?: any;
  error?: ExecutionError;
  responseTime: number;
}

// ============================================================================
// Real-time Synchronization Types
// ============================================================================

/**
 * State change for real-time sync
 */
export interface StateChange {
  id: string;
  entityType: string;
  entityId: string;
  changeType: ChangeType;
  oldValue?: any;
  newValue: any;
  timestamp: Date;
  userId?: string;
  correlationId: string;
}

/**
 * Broadcast event for real-time updates
 */
export interface BroadcastEvent {
  id: string;
  type: string;
  target: BroadcastTarget;
  data: any;
  timestamp: Date;
  expiresAt?: Date;
  priority: EventPriority;
}

/**
 * Synchronization result
 */
export interface SyncResult {
  changeId: string;
  status: SyncStatus;
  syncedAt: Date;
  clientsNotified: number;
  errors: SyncError[];
}

/**
 * Broadcast result
 */
export interface BroadcastResult {
  eventId: string;
  status: BroadcastStatus;
  broadcastAt: Date;
  recipientsReached: number;
  errors: BroadcastError[];
}

// ============================================================================
// Saga Pattern Types
// ============================================================================

/**
 * Saga definition for distributed transactions
 */
export interface SagaDefinition {
  id: string;
  name: string;
  steps: SagaStep[];
  compensationSteps: CompensationStep[];
  timeoutMs: number;
  retryPolicy: RetryPolicy;
}

/**
 * Saga step definition
 */
export interface SagaStep {
  id: string;
  name: string;
  action: SagaAction;
  compensationAction?: CompensationAction;
  conditions?: StepCondition[];
  timeoutMs?: number;
}

/**
 * Saga instance for execution tracking
 */
export interface SagaInstance {
  id: string;
  definitionId: string;
  status: SagaStatus;
  currentStep: number;
  context: SagaContext;
  startedAt: Date;
  completedAt?: Date;
  error?: SagaError;
  correlationId: string;
}

/**
 * Saga compensation plan
 */
export interface CompensationPlan {
  sagaId: string;
  reason: string;
  steps: CompensationStep[];
  strategy: CompensationStrategy;
}

// ============================================================================
// Enums and Status Types
// ============================================================================

export enum WorkflowType {
  AI_CREDIT_DEDUCTION = 'ai_credit_deduction',
  CREDIT_ADDITION = 'credit_addition',
  PAYMENT_PROCESSING = 'payment_processing',
  USER_REGISTRATION = 'user_registration',
  IMAGE_GENERATION = 'image_generation',
  AGENT_TASK_EXECUTION = 'agent_task_execution'
}

export enum StepType {
  VALIDATION = 'validation',
  COMPUTATION = 'computation',
  PERSISTENCE = 'persistence',
  NOTIFICATION = 'notification',
  EXTERNAL_CALL = 'external_call',
  COMPENSATION = 'compensation'
}

export enum WorkflowStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  COMPENSATING = 'compensating',
  COMPENSATED = 'compensated',
  CANCELLED = 'cancelled'
}

export enum ExecutionStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled'
}

export enum SecurityLevel {
  PUBLIC = 'public',
  AUTHENTICATED = 'authenticated',
  ELEVATED = 'elevated',
  ADMIN = 'admin'
}

export enum SecureOperationType {
  CREDIT_TRANSACTION = 'credit_transaction',
  PAYMENT_PROCESSING = 'payment_processing',
  BLOCKCHAIN_LEDGER = 'blockchain_ledger',
  USER_DATA_MODIFICATION = 'user_data_modification',
  ADMIN_OPERATION = 'admin_operation'
}

export enum PublicOperationType {
  BALANCE_QUERY = 'balance_query',
  TRANSACTION_HISTORY = 'transaction_history',
  MODEL_SELECTION = 'model_selection',
  CONVERSATION_RETRIEVAL = 'conversation_retrieval',
  HEALTH_CHECK = 'health_check'
}

export enum ChangeType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  RESTORE = 'restore'
}

export enum SyncStatus {
  SUCCESS = 'success',
  PARTIAL = 'partial',
  FAILED = 'failed'
}

export enum BroadcastStatus {
  SUCCESS = 'success',
  PARTIAL = 'partial',
  FAILED = 'failed'
}

export enum SagaStatus {
  STARTED = 'started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  COMPENSATING = 'compensating',
  COMPENSATED = 'compensated',
  FAILED = 'failed'
}

export enum EventPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum CompensationStrategy {
  ROLLBACK = 'rollback',
  FORWARD_RECOVERY = 'forward_recovery',
  MANUAL_INTERVENTION = 'manual_intervention'
}

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Retry policy for operations
 */
export interface RetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

/**
 * Compensation policy for workflows
 */
export interface CompensationPolicy {
  strategy: CompensationStrategy;
  timeoutMs: number;
  maxCompensationRetries: number;
}

/**
 * Step action definition
 */
export interface StepAction {
  type: string;
  handler: string;
  parameters: Record<string, any>;
}

/**
 * Step condition for conditional execution
 */
export interface StepCondition {
  expression: string;
  variables: string[];
}

/**
 * Compensation action for rollback
 */
export interface CompensationAction {
  type: string;
  handler: string;
  parameters: Record<string, any>;
}

/**
 * Step execution result
 */
export interface StepResult {
  stepId: string;
  status: ExecutionStatus;
  result?: any;
  error?: StepError;
  startedAt: Date;
  completedAt: Date;
  duration: number;
}

/**
 * Event handling result
 */
export interface EventResult {
  eventId: string;
  status: ExecutionStatus;
  processedAt: Date;
  result?: any;
  error?: EventError;
}

/**
 * Broadcast target specification
 */
export interface BroadcastTarget {
  type: TargetType;
  userIds?: string[];
  sessionIds?: string[];
  channels?: string[];
  filters?: Record<string, any>;
}

export enum TargetType {
  ALL_USERS = 'all_users',
  SPECIFIC_USERS = 'specific_users',
  ACTIVE_SESSIONS = 'active_sessions',
  CHANNEL_SUBSCRIBERS = 'channel_subscribers'
}

/**
 * Resource usage tracking
 */
export interface ResourceUsage {
  cpuTimeMs: number;
  memoryMB: number;
  networkBytes: number;
  storageOperations: number;
}

/**
 * System health status
 */
export interface SystemHealthStatus {
  overall: HealthStatus;
  components: ComponentHealth[];
  lastChecked: Date;
  uptime: number;
  activeWorkflows: number;
  queueDepth: number;
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  CRITICAL = 'critical'
}

/**
 * Component health details
 */
export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  lastChecked: Date;
  responseTime?: number;
  errorRate?: number;
  details?: Record<string, any>;
}

/**
 * Workflow metrics
 */
export interface WorkflowMetrics {
  totalWorkflows: number;
  activeWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
  averageExecutionTime: number;
  throughput: number;
  errorRate: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Workflow execution error
 */
export interface WorkflowError {
  code: string;
  message: string;
  stepId?: string;
  cause?: Error;
  retryable: boolean;
}

/**
 * Step execution error
 */
export interface StepError {
  code: string;
  message: string;
  cause?: Error;
  retryable: boolean;
}

/**
 * Event processing error
 */
export interface EventError {
  code: string;
  message: string;
  cause?: Error;
  retryable: boolean;
}

/**
 * Execution error for operations
 */
export interface ExecutionError {
  code: string;
  message: string;
  cause?: Error;
  retryable: boolean;
  severity: ErrorSeverity;
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Synchronization error
 */
export interface SyncError {
  clientId: string;
  error: string;
  timestamp: Date;
}

/**
 * Broadcast error
 */
export interface BroadcastError {
  recipientId: string;
  error: string;
  timestamp: Date;
}

/**
 * Saga execution error
 */
export interface SagaError {
  code: string;
  message: string;
  stepId?: string;
  cause?: Error;
  compensationRequired: boolean;
}

// ============================================================================
// Event and Subscription Types
// ============================================================================

/**
 * Generic event wrapper
 */
export interface Event<T = any> {
  id: string;
  type: string;
  data: T;
  timestamp: Date;
  correlationId: string;
  metadata: EventMetadata;
}

/**
 * Event handler function
 */
export type EventHandler<T = any> = (event: Event<T>) => Promise<void>;

/**
 * Event subscription
 */
export interface Subscription {
  id: string;
  eventType: string;
  handler: EventHandler;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Publish result
 */
export interface PublishResult {
  eventId: string;
  status: PublishStatus;
  publishedAt: Date;
  subscribersNotified: number;
}

export enum PublishStatus {
  SUCCESS = 'success',
  PARTIAL = 'partial',
  FAILED = 'failed'
}

/**
 * Batch publish result
 */
export interface BatchPublishResult {
  batchId: string;
  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  results: PublishResult[];
}

/**
 * Dead letter queue result
 */
export interface DLQResult {
  messageId: string;
  status: DLQStatus;
  processedAt: Date;
  retryCount: number;
}

export enum DLQStatus {
  QUEUED = 'queued',
  REPROCESSED = 'reprocessed',
  DISCARDED = 'discarded'
}

/**
 * DLQ filter for message retrieval
 */
export interface DLQFilter {
  eventType?: string;
  minRetryCount?: number;
  maxRetryCount?: number;
  fromDate?: Date;
  toDate?: Date;
  severity?: ErrorSeverity;
}

/**
 * Reprocess result
 */
export interface ReprocessResult {
  totalMessages: number;
  successfulMessages: number;
  failedMessages: number;
  results: DLQResult[];
}

// ============================================================================
// Saga Context and State Types
// ============================================================================

/**
 * Saga execution context
 */
export interface SagaContext {
  userId?: string;
  correlationId: string;
  variables: Record<string, any>;
  stepResults: Record<string, any>;
  compensationData: Record<string, any>;
}

/**
 * Saga state for persistence
 */
export interface SagaState {
  id: string;
  definitionId: string;
  status: SagaStatus;
  currentStep: number;
  context: SagaContext;
  startedAt: Date;
  lastUpdated: Date;
  completedAt?: Date;
  error?: SagaError;
}

/**
 * Saga event for state transitions
 */
export interface SagaEvent {
  sagaId: string;
  type: SagaEventType;
  data: any;
  timestamp: Date;
}

export enum SagaEventType {
  STEP_COMPLETED = 'step_completed',
  STEP_FAILED = 'step_failed',
  COMPENSATION_REQUIRED = 'compensation_required',
  SAGA_COMPLETED = 'saga_completed',
  SAGA_FAILED = 'saga_failed'
}

/**
 * Saga execution result
 */
export interface SagaResult {
  sagaId: string;
  status: SagaStatus;
  result?: any;
  error?: SagaError;
  completedAt?: Date;
}

/**
 * Compensation step definition
 */
export interface CompensationStep {
  id: string;
  name: string;
  action: CompensationAction;
  conditions?: StepCondition[];
  timeoutMs?: number;
}

/**
 * Compensation result
 */
export interface CompensationResult {
  sagaId: string;
  status: CompensationStatus;
  compensatedSteps: string[];
  errors: CompensationError[];
  completedAt: Date;
}

export enum CompensationStatus {
  SUCCESS = 'success',
  PARTIAL = 'partial',
  FAILED = 'failed'
}

/**
 * Compensation error
 */
export interface CompensationError {
  stepId: string;
  error: string;
  timestamp: Date;
}

/**
 * Saga metrics
 */
export interface SagaMetrics {
  totalSagas: number;
  activeSagas: number;
  completedSagas: number;
  failedSagas: number;
  compensatedSagas: number;
  averageExecutionTime: number;
  successRate: number;
}