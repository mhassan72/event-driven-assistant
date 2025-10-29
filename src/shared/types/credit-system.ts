/**
 * Credit System Types
 * Core interfaces for credit management, transactions, and blockchain ledger
 */

// ============================================================================
// Credit Balance and Management
// ============================================================================

/**
 * User's credit balance with comprehensive tracking
 */
export interface CreditBalance {
  userId: string;
  currentBalance: number;
  reservedCredits: number;
  availableBalance: number;
  lastUpdated: Date;
  accountStatus: AccountStatus;
  lifetimeCreditsEarned: number;
  lifetimeCreditsSpent: number;
  
  // Event sourcing
  version: number;
  lastEventId: string;
  
  // Real-time sync
  syncVersion: number;
  lastSyncTimestamp: Date;
  pendingOperations: PendingOperation[];
  
  // Blockchain verification
  lastVerifiedBalance: number;
  lastVerificationTimestamp: Date;
  verificationHash: string;
  
  // Monitoring
  healthStatus: BalanceHealthStatus;
  lastHealthCheck: Date;
}

/**
 * Credit transaction record with blockchain security
 */
export interface CreditTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  source: CreditSource;
  reason: string;
  metadata: TransactionMetadata;
  timestamp: Date;
  status: TransactionStatus;
  
  // Event sourcing
  eventId: string;
  version: number;
  
  // Blockchain security
  transactionHash: string;
  previousTransactionHash: string;
  signature: string;
  blockIndex: number;
  
  // Saga coordination
  sagaId?: string;
  correlationId: string;
  idempotencyKey: string;
  
  // Monitoring
  processingDuration: number;
  retryCount: number;
  lastRetryAt?: Date;
}

/**
 * Blockchain-style ledger entry for immutable transaction recording
 */
export interface LedgerEntry {
  id: string;
  userId: string;
  transactionId: string;
  transactionHash: string;
  previousHash: string;
  signature: string;
  timestamp: Date;
  blockIndex: number;
  correlationId: string;
  isValid: boolean;
  
  // Chain validation
  chainValidated: boolean;
  lastValidationTimestamp?: Date;
  validationSignature?: string;
  
  // Metadata
  metadata?: Record<string, any>;
}

// ============================================================================
// Enums and Status Types
// ============================================================================

export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  FROZEN = 'frozen',
  CLOSED = 'closed'
}

export enum TransactionType {
  CREDIT_ADDITION = 'credit_addition',
  CREDIT_DEDUCTION = 'credit_deduction',
  AI_INTERACTION = 'ai_interaction',
  IMAGE_GENERATION = 'image_generation',
  WELCOME_BONUS = 'welcome_bonus',
  PAYMENT_CREDIT = 'payment_credit',
  REFUND = 'refund',
  ADJUSTMENT = 'adjustment',
  RESERVATION = 'reservation',
  RELEASE = 'release'
}

export enum CreditSource {
  WELCOME_BONUS = 'welcome_bonus',
  PAYMENT = 'payment',
  REFUND = 'refund',
  ADMIN_ADJUSTMENT = 'admin_adjustment',
  PROMOTIONAL = 'promotional',
  AI_USAGE = 'ai_usage',
  IMAGE_GENERATION = 'image_generation',
  API_USAGE = 'api_usage'
}

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REVERSED = 'reversed'
}

export enum BalanceHealthStatus {
  HEALTHY = 'healthy',
  WARNING = 'warning',
  CRITICAL = 'critical',
  CORRUPTED = 'corrupted'
}

// ============================================================================
// Transaction Metadata and Context
// ============================================================================

/**
 * Transaction metadata for audit and tracking
 */
export interface TransactionMetadata {
  // AI Assistant specific
  conversationId?: string;
  messageLength?: number;
  aiModel?: string;
  taskType?: string;
  
  // Image generation specific
  imageCount?: number;
  imageSize?: string;
  imageQuality?: string;
  
  // Payment specific
  paymentId?: string;
  paymentMethod?: string;
  
  // System tracking
  userAgent?: string;
  ipAddress?: string;
  sessionId?: string;
  
  // Additional context
  featureId?: string;
  campaignId?: string;
  referenceId?: string;
  notes?: string;
  
  // Custom fields
  [key: string]: any;
}

/**
 * Pending operation for real-time sync
 */
export interface PendingOperation {
  id: string;
  type: TransactionType;
  amount: number;
  status: OperationStatus;
  createdAt: Date;
  expiresAt: Date;
  retryCount: number;
  lastError?: string;
}

export enum OperationStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired'
}

// ============================================================================
// Credit Request and Response Types
// ============================================================================

/**
 * Request to add credits to user account
 */
export interface CreditAdditionRequest {
  userId: string;
  amount: number;
  source: CreditSource;
  reason: string;
  paymentId?: string;
  metadata?: TransactionMetadata;
  idempotencyKey: string;
}

/**
 * Request to deduct credits from user account
 */
export interface CreditDeductionRequest {
  userId: string;
  amount: number;
  reason: string;
  featureId: string;
  metadata?: TransactionMetadata;
  idempotencyKey: string;
  reservationId?: string;
}

/**
 * Request to reserve credits for future use
 */
export interface CreditReservationRequest {
  userId: string;
  amount: number;
  reason: string;
  featureId: string;
  expiresAt: Date;
  metadata?: TransactionMetadata;
  idempotencyKey: string;
}

/**
 * Credit operation result
 */
export interface CreditOperationResult {
  transactionId: string;
  userId: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  status: TransactionStatus;
  timestamp: Date;
  correlationId: string;
}

// ============================================================================
// Validation and Integrity Types
// ============================================================================

/**
 * Validation result for credit operations
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  value?: any;
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  value?: any;
}

/**
 * Chain validation result for blockchain integrity
 */
export interface ChainValidationResult {
  isValid: boolean;
  userId: string;
  totalTransactions: number;
  validatedTransactions: number;
  brokenAt?: number;
  lastValidHash?: string;
  errors: ChainValidationError[];
}

/**
 * Chain validation error
 */
export interface ChainValidationError {
  blockIndex: number;
  transactionId: string;
  errorType: ChainErrorType;
  message: string;
  expectedHash?: string;
  actualHash?: string;
}

export enum ChainErrorType {
  HASH_MISMATCH = 'hash_mismatch',
  MISSING_TRANSACTION = 'missing_transaction',
  INVALID_SIGNATURE = 'invalid_signature',
  BROKEN_CHAIN = 'broken_chain',
  CORRUPTED_DATA = 'corrupted_data'
}

// ============================================================================
// Analytics and Reporting Types
// ============================================================================

/**
 * Credit usage analytics
 */
export interface CreditUsageAnalytics {
  userId: string;
  timeRange: TimeRange;
  totalCreditsUsed: number;
  totalCreditsAdded: number;
  netCreditsChange: number;
  
  // Usage breakdown
  usageByFeature: FeatureUsage[];
  usageByDay: DailyUsage[];
  usageByModel: ModelUsage[];
  
  // Patterns
  averageDailyUsage: number;
  peakUsageDay: Date;
  mostUsedFeature: string;
  
  // Projections
  projectedMonthlyUsage: number;
  recommendedTopUpAmount: number;
}

/**
 * Time range for analytics
 */
export interface TimeRange {
  startDate: Date;
  endDate: Date;
  granularity: TimeGranularity;
}

export enum TimeGranularity {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month'
}

/**
 * Feature usage breakdown
 */
export interface FeatureUsage {
  featureId: string;
  featureName: string;
  creditsUsed: number;
  transactionCount: number;
  averagePerTransaction: number;
  percentage: number;
}

/**
 * Daily usage statistics
 */
export interface DailyUsage {
  date: Date;
  creditsUsed: number;
  creditsAdded: number;
  transactionCount: number;
  uniqueFeatures: number;
}

/**
 * Model usage statistics
 */
export interface ModelUsage {
  modelId: string;
  modelName: string;
  creditsUsed: number;
  requestCount: number;
  averagePerRequest: number;
  totalTokens: number;
}

// ============================================================================
// Notification and Alert Types
// ============================================================================

/**
 * Low balance alert configuration
 */
export interface LowBalanceAlert {
  userId: string;
  currentBalance: number;
  threshold: number;
  alertLevel: AlertLevel;
  message: string;
  recommendedAction: string;
  estimatedDaysRemaining: number;
}

export enum AlertLevel {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
  URGENT = 'urgent'
}

/**
 * Credit notification preferences
 */
export interface NotificationPreferences {
  userId: string;
  lowBalanceAlerts: boolean;
  lowBalanceThreshold: number;
  dailyUsageSummary: boolean;
  weeklyUsageSummary: boolean;
  paymentConfirmations: boolean;
  unusualActivityAlerts: boolean;
  
  // Delivery channels
  emailNotifications: boolean;
  pushNotifications: boolean;
  webhookUrl?: string;
  
  // Timing preferences
  quietHoursStart?: string; // HH:MM format
  quietHoursEnd?: string;   // HH:MM format
  timezone: string;
}

// ============================================================================
// Cost Calculation Types
// ============================================================================

/**
 * Cost estimate for operations
 */
export interface CostEstimate {
  estimatedCredits: number;
  breakdown: CostBreakdown[];
  confidence: number; // 0-1
  factors: CostFactor[];
  lastUpdated: Date;
}

/**
 * Cost breakdown by component
 */
export interface CostBreakdown {
  component: string;
  description: string;
  credits: number;
  percentage: number;
}

/**
 * Factors affecting cost calculation
 */
export interface CostFactor {
  name: string;
  value: any;
  impact: CostImpact;
  description: string;
}

export enum CostImpact {
  INCREASE = 'increase',
  DECREASE = 'decrease',
  NEUTRAL = 'neutral'
}

// ============================================================================
// Audit and Compliance Types
// ============================================================================

/**
 * Audit report for compliance
 */
export interface AuditReport {
  userId: string;
  reportId: string;
  timeRange: TimeRange;
  generatedAt: Date;
  generatedBy: string;
  
  // Summary
  totalTransactions: number;
  totalCreditsProcessed: number;
  integrityScore: number;
  
  // Detailed findings
  transactions: AuditTransaction[];
  anomalies: AuditAnomaly[];
  recommendations: AuditRecommendation[];
  
  // Compliance status
  complianceStatus: ComplianceStatus;
  complianceChecks: ComplianceCheck[];
}

/**
 * Transaction in audit report
 */
export interface AuditTransaction {
  transactionId: string;
  timestamp: Date;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  verificationStatus: VerificationStatus;
  flags: AuditFlag[];
}

export enum VerificationStatus {
  VERIFIED = 'verified',
  PENDING = 'pending',
  FAILED = 'failed',
  SUSPICIOUS = 'suspicious'
}

/**
 * Audit anomaly detection
 */
export interface AuditAnomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  transactionIds: string[];
  detectedAt: Date;
  resolved: boolean;
  resolution?: string;
}

export enum AnomalyType {
  UNUSUAL_AMOUNT = 'unusual_amount',
  FREQUENCY_SPIKE = 'frequency_spike',
  PATTERN_DEVIATION = 'pattern_deviation',
  DUPLICATE_TRANSACTION = 'duplicate_transaction',
  INTEGRITY_VIOLATION = 'integrity_violation'
}

export enum AnomalySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Audit recommendation
 */
export interface AuditRecommendation {
  id: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  title: string;
  description: string;
  actionRequired: boolean;
  estimatedImpact: string;
}

export enum RecommendationCategory {
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  COMPLIANCE = 'compliance',
  COST_OPTIMIZATION = 'cost_optimization'
}

export enum RecommendationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

/**
 * Compliance status and checks
 */
export interface ComplianceStatus {
  overall: ComplianceLevel;
  lastAssessment: Date;
  nextAssessment: Date;
  certifications: ComplianceCertification[];
}

export enum ComplianceLevel {
  COMPLIANT = 'compliant',
  MINOR_ISSUES = 'minor_issues',
  MAJOR_ISSUES = 'major_issues',
  NON_COMPLIANT = 'non_compliant'
}

/**
 * Compliance check result
 */
export interface ComplianceCheck {
  checkId: string;
  name: string;
  status: CheckStatus;
  lastRun: Date;
  result: CheckResult;
  details?: string;
}

export enum CheckStatus {
  PASSED = 'passed',
  FAILED = 'failed',
  WARNING = 'warning',
  SKIPPED = 'skipped'
}

/**
 * Compliance certification
 */
export interface ComplianceCertification {
  name: string;
  issuer: string;
  issuedDate: Date;
  expiryDate: Date;
  status: CertificationStatus;
  certificateId: string;
}

export enum CertificationStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  SUSPENDED = 'suspended',
  REVOKED = 'revoked'
}

/**
 * Audit flag for transactions
 */
export interface AuditFlag {
  type: FlagType;
  severity: FlagSeverity;
  message: string;
  autoGenerated: boolean;
  flaggedAt: Date;
  flaggedBy?: string;
}

export enum FlagType {
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  POLICY_VIOLATION = 'policy_violation',
  TECHNICAL_ISSUE = 'technical_issue',
  MANUAL_REVIEW = 'manual_review'
}

export enum FlagSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * Check result details
 */
export interface CheckResult {
  passed: boolean;
  score?: number;
  maxScore?: number;
  findings: CheckFinding[];
  recommendations: string[];
}

/**
 * Individual check finding
 */
export interface CheckFinding {
  type: FindingType;
  severity: FindingSeverity;
  message: string;
  evidence?: any;
  remediation?: string;
}

export enum FindingType {
  CONFIGURATION = 'configuration',
  DATA_INTEGRITY = 'data_integrity',
  ACCESS_CONTROL = 'access_control',
  ENCRYPTION = 'encryption',
  LOGGING = 'logging'
}

export enum FindingSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Credit service interface for managing user credits
 */
export interface ICreditService {
  // Balance operations
  getBalance(userId: string): Promise<CreditBalance>;
  validateBalance(userId: string, amount: number): Promise<boolean>;
  
  // Credit operations
  addCredits(userId: string, amount: number, source: CreditSource, reason: string, metadata?: TransactionMetadata): Promise<CreditTransaction>;
  deductCredits(userId: string, amount: number, correlationId: string, metadata?: TransactionMetadata): Promise<CreditTransaction>;
  
  // Reservation operations
  reserveCredits(userId: string, amount: number, correlationId: string): Promise<CreditReservation>;
  releaseReservedCredits(userId: string, amount: number, correlationId: string): Promise<void>;
  confirmReservedCredits(userId: string, reservationId: string, actualAmount?: number): Promise<CreditTransaction>;
  
  // Transaction history
  getTransactionHistory(userId: string, options?: TransactionHistoryOptions): Promise<CreditTransaction[]>;
  getTransaction(transactionId: string): Promise<CreditTransaction | null>;
  
  // Analytics and reporting
  getUserUsageAnalytics(userId: string, timeRange: TimeRange): Promise<CreditUsageAnalytics>;
  generateAuditReport(userId: string, timeRange: TimeRange): Promise<AuditReport>;
  
  // Health and monitoring
  healthCheck(): Promise<HealthCheckResult>;
  getSystemMetrics(): Promise<SystemMetrics>;
}

/**
 * Credit reservation details
 */
export interface CreditReservation {
  id: string;
  userId: string;
  amount: number;
  correlationId: string;
  status: ReservationStatus;
  createdAt: Date;
  expiresAt: Date;
  metadata?: Record<string, any>;
}

export enum ReservationStatus {
  ACTIVE = 'active',
  CONFIRMED = 'confirmed',
  RELEASED = 'released',
  EXPIRED = 'expired'
}

/**
 * Transaction history query options
 */
export interface TransactionHistoryOptions {
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
  types?: TransactionType[];
  status?: TransactionStatus[];
  sortBy?: 'timestamp' | 'amount';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  checks: HealthCheck[];
  overallScore: number;
}

/**
 * Individual health check
 */
export interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  responseTime?: number;
  message?: string;
  details?: Record<string, any>;
}

/**
 * System metrics for monitoring
 */
export interface SystemMetrics {
  timestamp: Date;
  activeUsers: number;
  totalTransactions: number;
  totalCreditsInCirculation: number;
  averageTransactionValue: number;
  systemLoad: number;
  errorRate: number;
  responseTime: number;
}