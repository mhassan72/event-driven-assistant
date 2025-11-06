/**
 * AI Agent Interfaces
 * Core interfaces for AI agent functionality, model management, and conversation handling
 */

import { TaskType } from './task-interfaces';

// ============================================================================
// Core AI Agent Interfaces
// ============================================================================

/**
 * Base conversation request for AI interactions
 */
export interface ConversationRequest {
  conversationId: string;
  message: string;
  context?: ConversationContext;
  modelPreferences?: ModelPreferences;
  langChainConfig?: LangChainConfig;
  userId: string;
  estimatedCost?: number;
  metadata?: Record<string, any>;
}

/**
 * Response from AI conversation processing
 */
export interface ConversationResponse {
  id: string;
  conversationId: string;
  message: ConversationMessage;
  metadata: ResponseMetadata;
  creditsUsed: number;
  processingTime: number;
  modelUsed: string;
  qualityScore?: number;
}

/**
 * Conversation context for maintaining state
 */
export interface ConversationContext {
  conversationId: string;
  userId: string;
  sessionId?: string;
  messageHistory: ConversationMessage[];
  systemPrompt?: string;
  variables?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Individual conversation message
 */
export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: string | MessageContent[];
  timestamp: Date;
  creditsUsed?: number;
  model?: string;
  metadata?: Record<string, any>;
}

export enum MessageRole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
  TOOL = 'tool'
}

/**
 * Message content for multimodal messages
 */
export interface MessageContent {
  type: ContentType;
  text?: string;
  image_url?: {
    url: string;
    detail?: ImageDetail;
  };
  tool_call?: ToolCall;
  tool_result?: ToolResult;
}

export enum ContentType {
  TEXT = 'text',
  IMAGE_URL = 'image_url',
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result'
}

export enum ImageDetail {
  LOW = 'low',
  HIGH = 'high',
  AUTO = 'auto'
}

/**
 * Response metadata
 */
export interface ResponseMetadata {
  processingTime: number;
  modelUsed: string;
  tokensUsed: number;
  qualityScore?: number;
  confidence: number;
}

// ============================================================================
// AI Model Management Interfaces
// ============================================================================

/**
 * AI Model definition with capabilities and pricing
 */
export interface AIModel {
  id: string;
  name: string;
  description: string;
  category: ModelCategory;
  provider: string;
  apiEndpoint: string;
  isActive: boolean;
  capabilities: ModelCapabilities;
  pricing: ModelPricing;
  performance: ModelPerformance;
  metadata: ModelMetadata;
}

/**
 * User's model preferences for different task types
 */
export interface UserModelPreferences {
  textGeneration: TaskModelPreference;
  visionTasks: TaskModelPreference;
  imageGeneration: TaskModelPreference;
  embeddings: TaskModelPreference;
  budgetLimits: BudgetLimits;
  globalSettings: GlobalModelSettings;
  lastUpdated: Date;
}

/**
 * Model selection result with reasoning
 */
export interface ModelSelection {
  selectedModel: AIModel;
  reason: string;
  estimatedCost: number;
  estimatedLatency: number;
  fallbackModels: AIModel[];
  confidence: number; // 0-1
  selectionCriteria: ModelSelectionCriteria;
}

export enum ModelCategory {
  TEXT_GENERATION = 'text_generation',
  VISION_MODEL = 'vision_model',
  IMAGE_GENERATION = 'image_generation',
  EMBEDDINGS = 'embeddings'
}

/**
 * Model capabilities and features
 */
export interface ModelCapabilities {
  maxTokens: number;
  supportsStreaming: boolean;
  supportsImages: boolean;
  supportsTools: boolean;
  contextWindow: number;
  supportedLanguages?: string[];
  specialFeatures?: string[];
}

/**
 * Model performance metrics
 */
export interface ModelPerformance {
  averageLatency: number; // milliseconds
  tokensPerSecond: number;
  qualityScore: number; // 1-10
  speedScore: number; // 1-10
  costScore: number; // 1-10
  reliabilityScore: number; // 1-10
}

/**
 * Model pricing information
 */
export interface ModelPricing {
  modelId: string;
  category: ModelCategory;
  costPer1kInputTokens?: number;
  costPer1kOutputTokens?: number;
  costPerImage?: number;
  costPerRequest?: number;
  minimumCost?: number;
  currency: string;
  lastUpdated: Date;
}

/**
 * Model metadata
 */
export interface ModelMetadata {
  addedAt: Date;
  lastUpdated: Date;
  addedBy: string;
  tags: string[];
  version?: string;
  deprecated?: boolean;
  replacedBy?: string;
}

/**
 * User preferences for specific task types
 */
export interface TaskModelPreference {
  primaryModel: string;
  fallbackModel?: string;
  autoSelectBest: boolean;
  selectionCriteria: ModelSelectionCriteria;
  customSettings?: Record<string, any>;
}

/**
 * Criteria for model selection
 */
export interface ModelSelectionCriteria {
  prioritizeSpeed: boolean;
  prioritizeCost: boolean;
  prioritizeQuality: boolean;
  maxCostPerRequest: number;
  maxLatency?: number;
  minQualityScore?: number;
  requiredFeatures?: string[];
}

/**
 * Budget limits for model usage
 */
export interface BudgetLimits {
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  perRequestLimit: number;
  alertThresholds: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

/**
 * Global model settings
 */
export interface GlobalModelSettings {
  autoSelectModel: boolean;
  fallbackEnabled: boolean;
  costOptimizationEnabled: boolean;
  qualityThreshold: number;
  maxRetries: number;
}

/**
 * Model preferences for requests
 */
export interface ModelPreferences {
  preferredModels?: string[];
  excludedModels?: string[];
  maxCost?: number;
  maxLatency?: number;
  minQuality?: number;
  requiredFeatures?: string[];
}

/**
 * Model requirements for selection
 */
export interface ModelRequirements {
  taskType: TaskType;
  inputSize: number;
  expectedOutputSize?: number;
  maxBudget?: number;
  maxLatency?: number;
  requiredFeatures?: string[];
  qualityThreshold?: number;
}

// ============================================================================
// LangChain and Tool Integration Types
// ============================================================================

/**
 * LangChain configuration
 */
export interface LangChainConfig {
  modelProvider: ModelProvider;
  modelId: string;
  temperature: number;
  maxTokens: number;
  tools?: Tool[];
  memory?: MemoryConfig;
  streaming?: boolean;
}

export enum ModelProvider {
  NEBIUS = 'nebius',
  OPENAI = 'openai',
  CUSTOM = 'custom',
  LOCAL = 'local'
}

/**
 * Tool definition for LangChain agents
 */
export interface Tool {
  id: string;
  name: string;
  description: string;
  parameters: ToolParameters;
  function: string; // Function name or endpoint
  category: ToolCategory;
  isEnabled: boolean;
}

export enum ToolCategory {
  SEARCH = 'search',
  CALCULATION = 'calculation',
  CODE_EXECUTION = 'code_execution',
  FILE_OPERATION = 'file_operation',
  API_CALL = 'api_call',
  DATA_PROCESSING = 'data_processing'
}

/**
 * Tool parameters schema
 */
export interface ToolParameters {
  type: string;
  properties: Record<string, ToolProperty>;
  required: string[];
}

export interface ToolProperty {
  type: string;
  description: string;
  enum?: string[];
  default?: any;
}

/**
 * Tool call and result
 */
export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  output: string;
  error?: string;
}

/**
 * Memory configuration for conversations
 */
export interface MemoryConfig {
  type: MemoryType;
  maxTokens?: number;
  summaryThreshold?: number;
  persistenceEnabled?: boolean;
}

export enum MemoryType {
  BUFFER = 'buffer',
  SUMMARY = 'summary',
  TOKEN_BUFFER = 'token_buffer',
  CONVERSATION_SUMMARY_BUFFER = 'conversation_summary_buffer'
}

// ============================================================================
// Nebius AI Integration Types
// ============================================================================

export interface NebiusChatRequest {
  model: string;
  messages: NebiusMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  userId?: string;
  conversationId?: string;
}

export interface NebiusMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | NebiusMessageContent[];
}

export interface NebiusMessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
}

export interface NebiusChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: NebiusChoice[];
  usage: NebiusUsage;
}

export interface NebiusChoice {
  index: number;
  message: NebiusMessage;
  finish_reason: string;
}

export interface NebiusUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface NebiusConfig {
  apiKey: string;
  baseURL: string;
  timeout?: number;
  retries?: number;
}

export interface NebiusModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  capabilities: {
    chat: boolean;
    completion: boolean;
    embedding: boolean;
    vision: boolean;
    function_calling: boolean;
    streaming: boolean;
  };
  pricing: {
    input_cost_per_1k_tokens: number;
    output_cost_per_1k_tokens: number;
    currency: string;
  };
  limits: {
    max_tokens: number;
    context_window: number;
    rate_limit_rpm: number;
    rate_limit_tpm: number;
  };
}

export interface ConnectionResult {
  success: boolean;
  latency: number;
  timestamp: Date;
  version?: string;
  features?: string[];
  error?: string;
}

export enum ServiceStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  MAINTENANCE = 'maintenance'
}

export enum ModelStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  MAINTENANCE = 'maintenance',
  DEPRECATED = 'deprecated'
}

// Re-export TaskType from task-interfaces to avoid duplication
export { TaskType } from './task-interfaces';