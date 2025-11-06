/**
 * Credit System Core Interfaces
 * Core interfaces for credit balance management, validation, and analytics
 */

import { TransactionStatus } from './transaction-interfaces';

import { TransactionType } from './transaction-interfaces';

import { AuditReport } from './transaction-interfaces';

import { TimeRange } from './transaction-interfaces';

import { CreditUsageAnalytics } from './transaction-interfaces';

import { TimeRange } from './transaction-interfaces';

import { CreditTransaction } from './transaction-interfaces';

import { CreditTransaction } from './transaction-interfaces';

import { CreditTransaction } from './transaction-interfaces';

import { CreditTransaction } from './transaction-interfaces';

import { TransactionMetadata } from './transaction-interfaces';

import { CreditTransaction } from './transaction-interfaces';

import { TransactionMetadata } from './transaction-interfaces';

import { CreditSource } from './transaction-interfaces';

import { TransactionStatus } from './transaction-interfaces';

import { TransactionMetadata } from './transaction-interfaces';

import { TransactionMetadata } from './transaction-interfaces';

import { TransactionMetadata } from './transaction-interfaces';

import { CreditSource } from './transaction-interfaces';

import { TransactionType } from './transaction-interfaces';

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

// ============================================================================
// Enums and Status Types
// ============================================================================

export enum AccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  FROZEN = 'frozen',
  CLOSED = 'closed'
}

export enum BalanceHealthStatus {
  HEALTHY = 'healthy',
  WARNING = 'warning',
  CRITICAL = 'critical',
  CORRUPTED = 'corrupted'
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

// Re-export types from transaction-interfaces to avoid duplication
export { 
  CreditTransaction, 
  TransactionType, 
  CreditSource, 
  TransactionStatus, 
  TransactionMetadata,
  CreditUsageAnalytics,
  TimeRange,
  AuditReport
} from './transaction-interfaces';