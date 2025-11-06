/**
 * Common Shared Types
 * Utility types and interfaces used across multiple features
 */

// ============================================================================
// Common Utility Types
// ============================================================================

/**
 * Generic API response wrapper
 */
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: APIError;
  metadata?: ResponseMetadata;
}

/**
 * API error structure
 */
export interface APIError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
  requestId?: string;
}

/**
 * Response metadata
 */
export interface ResponseMetadata {
  requestId: string;
  timestamp: Date;
  version: string;
  processingTime?: number;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
  cursor?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationInfo;
}

/**
 * Pagination information
 */
export interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasNext: boolean;
  hasPrevious: boolean;
  nextCursor?: string;
  previousCursor?: string;
}

/**
 * Time range for queries and analytics
 */
export interface TimeRange {
  startDate: Date;
  endDate: Date;
  timezone?: string;
}

/**
 * Generic filter interface
 */
export interface Filter {
  field: string;
  operator: FilterOperator;
  value: any;
}

export enum FilterOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  GREATER_THAN_OR_EQUAL = 'greater_than_or_equal',
  LESS_THAN = 'less_than',
  LESS_THAN_OR_EQUAL = 'less_than_or_equal',
  IN = 'in',
  NOT_IN = 'not_in',
  CONTAINS = 'contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  IS_NULL = 'is_null',
  IS_NOT_NULL = 'is_not_null'
}

/**
 * Generic sort configuration
 */
export interface SortConfig {
  field: string;
  direction: SortDirection;
}

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc'
}

/**
 * Audit trail information
 */
export interface AuditInfo {
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  version: number;
}

/**
 * Soft delete information
 */
export interface SoftDeleteInfo {
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  deleteReason?: string;
}

/**
 * Generic entity with common fields
 */
export interface BaseEntity {
  id: string;
  audit: AuditInfo;
  softDelete?: SoftDeleteInfo;
}

/**
 * Configuration interface
 */
export interface Configuration {
  [key: string]: any;
}

/**
 * Environment configuration
 */
export interface EnvironmentConfig {
  environment: Environment;
  debug: boolean;
  logLevel: LogLevel;
  features: FeatureFlags;
}

export enum Environment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
  TEST = 'test'
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * Feature flags
 */
export interface FeatureFlags {
  [featureName: string]: boolean;
}

/**
 * Health check result
 */
export interface HealthCheck {
  status: HealthStatus;
  timestamp: Date;
  checks: ComponentHealthCheck[];
  uptime: number;
  version: string;
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy'
}

/**
 * Component health check
 */
export interface ComponentHealthCheck {
  name: string;
  status: HealthStatus;
  responseTime?: number;
  error?: string;
  details?: Record<string, any>;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  ttl: number; // Time to live in seconds
  maxSize?: number;
  strategy: CacheStrategy;
}

export enum CacheStrategy {
  LRU = 'lru',
  FIFO = 'fifo',
  TTL = 'ttl'
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  code: string;
  message: string;
  value?: any;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  value?: any;
}

/**
 * Metrics collection interface
 */
export interface Metrics {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, number[]>;
  timers: Record<string, number>;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  responseTime: number;
  throughput: number;
  errorRate: number;
  cpuUsage: number;
  memoryUsage: number;
}

/**
 * Geographic location
 */
export interface GeoLocation {
  country: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

/**
 * Device information
 */
export interface DeviceInfo {
  type: DeviceType;
  os?: string;
  browser?: string;
  version?: string;
  userAgent?: string;
}

export enum DeviceType {
  DESKTOP = 'desktop',
  MOBILE = 'mobile',
  TABLET = 'tablet',
  OTHER = 'other'
}

/**
 * File information
 */
export interface FileInfo {
  name: string;
  size: number;
  type: string;
  lastModified: Date;
  checksum?: string;
}

/**
 * Upload result
 */
export interface UploadResult {
  success: boolean;
  fileId?: string;
  url?: string;
  error?: string;
}

/**
 * Search parameters
 */
export interface SearchParams {
  query: string;
  filters?: Filter[];
  sort?: SortConfig[];
  pagination?: PaginationParams;
}

/**
 * Search result
 */
export interface SearchResult<T> {
  items: T[];
  total: number;
  facets?: SearchFacet[];
  suggestions?: string[];
  pagination: PaginationInfo;
}

/**
 * Search facet
 */
export interface SearchFacet {
  field: string;
  values: FacetValue[];
}

/**
 * Facet value
 */
export interface FacetValue {
  value: string;
  count: number;
  selected: boolean;
}

/**
 * Webhook payload
 */
export interface WebhookPayload {
  id: string;
  type: string;
  data: any;
  timestamp: Date;
  signature?: string;
}

/**
 * Webhook delivery result
 */
export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  responseTime: number;
  error?: string;
  retryCount: number;
}

/**
 * Batch operation result
 */
export interface BatchOperationResult<T> {
  totalItems: number;
  successfulItems: number;
  failedItems: number;
  results: BatchItemResult<T>[];
}

/**
 * Batch item result
 */
export interface BatchItemResult<T> {
  item: T;
  success: boolean;
  error?: string;
}

/**
 * Configuration validation
 */
export interface ConfigValidation {
  isValid: boolean;
  errors: ConfigError[];
  warnings: ConfigWarning[];
}

/**
 * Configuration error
 */
export interface ConfigError {
  key: string;
  message: string;
  severity: ErrorSeverity;
}

/**
 * Configuration warning
 */
export interface ConfigWarning {
  key: string;
  message: string;
  recommendation?: string;
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Generic key-value pair
 */
export interface KeyValuePair<T = any> {
  key: string;
  value: T;
}

/**
 * Named value
 */
export interface NamedValue<T = any> {
  name: string;
  value: T;
  description?: string;
}

/**
 * Labeled item
 */
export interface LabeledItem<T = any> {
  label: string;
  value: T;
  disabled?: boolean;
}

/**
 * Option item for selections
 */
export interface OptionItem<T = any> {
  id: string;
  label: string;
  value: T;
  description?: string;
  disabled?: boolean;
  group?: string;
}

/**
 * Progress information
 */
export interface Progress {
  current: number;
  total: number;
  percentage: number;
  status: ProgressStatus;
  message?: string;
  estimatedTimeRemaining?: number;
}

export enum ProgressStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Task result
 */
export interface TaskResult<T = any> {
  success: boolean;
  result?: T;
  error?: TaskError;
  duration: number;
  metadata?: Record<string, any>;
}

/**
 * Task error
 */
export interface TaskError {
  code: string;
  message: string;
  details?: Record<string, any>;
  retryable: boolean;
}

/**
 * Generic service interface
 */
export interface IService {
  initialize?(): Promise<void>;
  destroy?(): Promise<void>;
  healthCheck?(): Promise<HealthCheck>;
}

/**
 * Generic repository interface
 */
export interface IRepository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  findAll(options?: QueryOptions): Promise<T[]>;
  create(entity: Omit<T, 'id'>): Promise<T>;
  update(id: ID, updates: Partial<T>): Promise<T>;
  delete(id: ID): Promise<void>;
}

/**
 * Query options for repositories
 */
export interface QueryOptions {
  filters?: Filter[];
  sort?: SortConfig[];
  pagination?: PaginationParams;
  include?: string[];
}

/**
 * Generic event
 */
export interface Event<T = any> {
  id: string;
  type: string;
  data: T;
  timestamp: Date;
  source: string;
  correlationId?: string;
}

/**
 * Event handler
 */
export type EventHandler<T = any> = (event: Event<T>) => Promise<void>;

/**
 * Generic command
 */
export interface Command<T = any> {
  id: string;
  type: string;
  payload: T;
  timestamp: Date;
  userId?: string;
  correlationId?: string;
}

/**
 * Command handler
 */
export type CommandHandler<T = any> = (command: Command<T>) => Promise<void>;

/**
 * Generic query
 */
export interface Query<T = any> {
  id: string;
  type: string;
  parameters: T;
  timestamp: Date;
  userId?: string;
}

/**
 * Query handler
 */
export type QueryHandler<T = any, R = any> = (query: Query<T>) => Promise<R>;