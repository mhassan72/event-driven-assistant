/**
 * AI Task Interfaces
 * Core interfaces for task management, routing, and workflow execution
 */

import { Tool } from './agent-interfaces';

// ============================================================================
// Task Management Types
// ============================================================================

/**
 * Extended request for long-running agent tasks
 */
export interface AgentTaskRequest {
  conversationId: string;
  message: string;
  userId: string;
  taskType: TaskType;
  maxExecutionTime: number;
  tools: Tool[];
  workflow?: LangGraphWorkflow;
  progressCallback?: string; // webhook URL for progress updates
  priority?: TaskPriority;
  estimatedCost?: number;
  metadata?: Record<string, any>;
  
  // Execution state properties (optional for runtime use)
  taskId?: string;
  status?: TaskStatus;
}

/**
 * Task classification result from AI analysis
 */
export interface TaskClassification {
  type: TaskType;
  estimatedDuration: number; // in seconds
  complexity: TaskComplexity;
  requiresAgentExecution: boolean;
  estimatedCreditCost: number;
  confidence: number; // 0-1
  reasoning: string;
}

/**
 * Task routing result from intelligent routing system
 */
export interface TaskRoutingResult {
  strategy: RoutingStrategy;
  executionPath: ExecutionPath;
  estimatedWaitTime: number;
  queuePosition?: number;
  routingReason: string;
  fallbackOptions: RoutingOption[];
  metadata: RoutingMetadata;
}

/**
 * Agent task initiation result
 */
export interface AgentTaskInitiation {
  taskId: string;
  status: TaskStatus;
  estimatedCompletion: Date;
  progressUrl: string;
  creditsReserved: number;
  metadata: TaskMetadata;
}

/**
 * Task metadata
 */
export interface TaskMetadata {
  createdAt: Date;
  estimatedCompletion: Date;
  priority: TaskPriority;
  resourceRequirements: ResourceRequirements;
}

// ============================================================================
// Task Types and Enums
// ============================================================================

export enum TaskType {
  QUICK_CHAT = 'quick_chat',
  IMAGE_GENERATION = 'image_generation',
  RESEARCH_TASK = 'research_task',
  CODE_GENERATION = 'code_generation',
  DATA_ANALYSIS = 'data_analysis',
  LONG_FORM_WRITING = 'long_form_writing',
  MULTI_STEP_WORKFLOW = 'multi_step_workflow',
  VISION_ANALYSIS = 'vision_analysis'
}

export enum TaskComplexity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export enum TaskPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

// ============================================================================
// Task Routing Types
// ============================================================================

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

export interface ResourceRequirements {
  estimatedCpu: number;
  estimatedMemory: number;
  estimatedDuration: number;
  requiresGpu: boolean;
  requiresNetwork: boolean;
  priority: TaskPriority;
}

// ============================================================================
// LangGraph Workflow Types
// ============================================================================

/**
 * LangGraph workflow definition
 */
export interface LangGraphWorkflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  estimatedCost: number;
  maxExecutionTime: number;
  version: string;
  isActive: boolean;
}

/**
 * Workflow node definition
 */
export interface WorkflowNode {
  id: string;
  type: NodeType;
  name: string;
  description: string;
  config: NodeConfig;
  position?: NodePosition;
}

export enum NodeType {
  START = 'start',
  END = 'end',
  AGENT = 'agent',
  TOOL = 'tool',
  CONDITION = 'condition',
  PARALLEL = 'parallel',
  HUMAN_INPUT = 'human_input'
}

/**
 * Node configuration
 */
export interface NodeConfig {
  agent?: AgentConfig;
  tool?: ToolConfig;
  condition?: ConditionConfig;
  timeout?: number;
  retries?: number;
}

/**
 * Agent configuration for nodes
 */
export interface AgentConfig {
  modelId: string;
  systemPrompt: string;
  tools: string[];
  temperature: number;
  maxTokens: number;
  name?: string;
  description?: string;
  memory?: any;
}

/**
 * Tool configuration for nodes
 */
export interface ToolConfig {
  toolId: string;
  parameters: Record<string, any>;
  timeout: number;
}

/**
 * Condition configuration for decision nodes
 */
export interface ConditionConfig {
  expression: string;
  variables: string[];
}

/**
 * Workflow edge definition
 */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;
  label?: string;
}

/**
 * Node position for visual representation
 */
export interface NodePosition {
  x: number;
  y: number;
}

// ============================================================================
// Workflow Definition Types (for agent-execution.ts compatibility)
// ============================================================================

/**
 * Complete workflow definition for agent execution
 */
export interface AgentWorkflowDefinition {
  name: string;
  description: string;
  nodes: WorkflowNodeDefinition[];
  edges: WorkflowEdgeDefinition[];
  timeout?: number;
}

/**
 * Workflow node definition for agent execution
 */
export interface WorkflowNodeDefinition {
  id: string;
  type: NodeType;
  name: string;
  description: string;
  config: NodeConfig;
}

/**
 * Workflow edge definition for agent execution
 */
export interface WorkflowEdgeDefinition {
  id: string;
  source: string;
  target: string;
}

// Re-export Tool interface from agent-interfaces to avoid duplication
export { Tool } from './agent-interfaces';