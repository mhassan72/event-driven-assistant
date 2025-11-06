/**
 * Credit Transaction Interfaces
 * Core interfaces for transaction management, analytics, and audit reporting
 */

// ============================================================================
// Transaction Types
// ============================================================================

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

// ============================================================================
// Enums
// ============================================================================

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