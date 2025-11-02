/**
 * Real-time Balance Synchronization Service
 * Manages real-time balance updates and credit reservations
 */

import { logger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';
import { 
  CreditBalance,
  CreditReservation,
  ReservationStatus,
  PendingOperation,
  TransactionType,
  BalanceHealthStatus
} from '../../../shared/types/credit-system';
import { v4 as uuidv4 } from 'uuid';

/**
 * Balance synchronization configuration
 */
export interface BalanceSyncConfig {
  syncIntervalMs: number;
  maxRetries: number;
  retryDelayMs: number;
  reservationTimeoutMs: number;
  healthCheckIntervalMs: number;
  conflictResolutionStrategy: ConflictResolutionStrategy;
}

export enum ConflictResolutionStrategy {
  FIRESTORE_WINS = 'firestore_wins',
  REALTIME_WINS = 'realtime_wins',
  LATEST_TIMESTAMP = 'latest_timestamp',
  MANUAL_RESOLUTION = 'manual_resolution'
}

/**
 * Synchronization result
 */
export interface SyncResult {
  success: boolean;
  userId: string;
  syncedAt: Date;
  conflictsResolved: number;
  operationsProcessed: number;
  errors: SyncError[];
}

export interface SyncError {
  type: SyncErrorType;
  message: string;
  operationId?: string;
  timestamp: Date;
}

export enum SyncErrorType {
  FIRESTORE_ERROR = 'firestore_error',
  REALTIME_DB_ERROR = 'realtime_db_error',
  CONFLICT_RESOLUTION = 'conflict_resolution',
  VALIDATION_ERROR = 'validation_error',
  TIMEOUT_ERROR = 'timeout_error'
}

/**
 * Credit reservation request
 */
export interface ReservationRequest {
  userId: string;
  amount: number;
  reason: string;
  correlationId: string;
  expiresAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Balance validation result
 */
export interface BalanceValidationResult {
  isValid: boolean;
  userId: string;
  expectedBalance: number;
  actualBalance: number;
  discrepancy: number;
  validationTimestamp: Date;
  issues: ValidationIssue[];
}

export interface ValidationIssue {
  type: ValidationIssueType;
  severity: ValidationSeverity;
  description: string;
  recommendation: string;
}

export enum ValidationIssueType {
  BALANCE_MISMATCH = 'balance_mismatch',
  RESERVATION_MISMATCH = 'reservation_mismatch',
  PENDING_OPERATION_STUCK = 'pending_operation_stuck',
  SYNC_VERSION_MISMATCH = 'sync_version_mismatch'
}

export enum ValidationSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Real-time balance synchronization service interface
 */
export interface IBalanceSyncService {
  // Real-time synchronization
  syncBalance(userId: string): Promise<SyncResult>;
  syncAllBalances(): Promise<SyncResult[]>;
  
  // Credit reservations
  reserveCredits(request: ReservationRequest): Promise<CreditReservation>;
  releaseReservation(userId: string, reservationId: string): Promise<void>;
  confirmReservation(userId: string, reservationId: string, actualAmount?: number): Promise<void>;
  
  // Balance validation
  validateBalance(userId: string): Promise<BalanceValidationResult>;
  handleInsufficientCredits(userId: string, requiredAmount: number): Promise<InsufficientCreditsResponse>;
  
  // Real-time subscriptions
  subscribeToBalanceChanges(userId: string, callback: BalanceChangeCallback): Promise<() => void>;
  broadcastBalanceUpdate(userId: string, balance: CreditBalance): Promise<void>;
  
  // Health monitoring
  startHealthMonitoring(): Promise<void>;
  stopHealthMonitoring(): Promise<void>;
  getHealthStatus(userId: string): Promise<BalanceHealthStatus>;
}

export type BalanceChangeCallback = (balance: CreditBalance, changeType: BalanceChangeType) => void;

export enum BalanceChangeType {
  CREDIT_ADDED = 'credit_added',
  CREDIT_DEDUCTED = 'credit_deducted',
  RESERVATION_CREATED = 'reservation_created',
  RESERVATION_RELEASED = 'reservation_released',
  SYNC_UPDATE = 'sync_update'
}

export interface InsufficientCreditsResponse {
  hasInsufficientCredits: boolean;
  currentBalance: number;
  requiredAmount: number;
  shortfall: number;
  suggestedTopUpAmount: number;
  paymentOptions: PaymentOption[];
}

export interface PaymentOption {
  id: string;
  name: string;
  description: string;
  creditAmount: number;
  price: number;
  currency: string;
  recommended: boolean;
}

/**
 * Real-time balance synchronization service implementation
 */
export class BalanceSyncService implements IBalanceSyncService {
  private firestore = getFirestore();
  private database = getDatabase();
  private metrics: IMetricsCollector;
  private config: BalanceSyncConfig;
  private healthMonitoringInterval?: NodeJS.Timeout;
  private activeSubscriptions = new Map<string, () => void>();

  constructor(metrics: IMetricsCollector, config?: Partial<BalanceSyncConfig>) {
    this.metrics = metrics;
    this.config = {
      syncIntervalMs: 5000, // 5 seconds
      maxRetries: 3,
      retryDelayMs: 1000,
      reservationTimeoutMs: 30 * 60 * 1000, // 30 minutes
      healthCheckIntervalMs: 60 * 1000, // 1 minute
      conflictResolutionStrategy: ConflictResolutionStrategy.FIRESTORE_WINS,
      ...config
    };
  }

  /**
   * Synchronize balance between Firestore and Realtime Database
   */
  async syncBalance(userId: string): Promise<SyncResult> {
    const syncStartTime = Date.now();
    const errors: SyncError[] = [];
    let conflictsResolved = 0;
    let operationsProcessed = 0;

    try {
      // Get balance from Firestore (authoritative source)
      const firestoreBalance = await this.getFirestoreBalance(userId);
      if (!firestoreBalance) {
        throw new Error(`Balance not found in Firestore for user ${userId}`);
      }

      // Get balance from Realtime Database
      const realtimeBalance = await this.getRealtimeBalance(userId);

      // Check for conflicts
      const hasConflict = this.detectBalanceConflict(firestoreBalance, realtimeBalance);
      
      if (hasConflict) {
        const resolvedBalance = await this.resolveBalanceConflict(firestoreBalance, realtimeBalance);
        conflictsResolved++;
        
        // Update both databases with resolved balance
        await this.updateFirestoreBalance(userId, resolvedBalance);
        await this.updateRealtimeBalance(userId, resolvedBalance);
      } else {
        // Sync Realtime DB with Firestore
        await this.updateRealtimeBalance(userId, firestoreBalance);
      }

      // Process pending operations
      const pendingOps = await this.getPendingOperations(userId);
      for (const operation of pendingOps) {
        try {
          await this.processPendingOperation(userId, operation);
          operationsProcessed++;
        } catch (error) {
          errors.push({
            type: SyncErrorType.VALIDATION_ERROR,
            message: `Failed to process pending operation: ${error instanceof Error ? error.message : 'Unknown error'}`,
            operationId: operation.id,
            timestamp: new Date()
          });
        }
      }

      // Update sync metadata
      await this.updateSyncMetadata(userId, {
        lastSyncTimestamp: new Date(),
        syncVersion: firestoreBalance.syncVersion + 1,
        conflictsResolved,
        operationsProcessed
      });

      const syncDuration = Date.now() - syncStartTime;
      this.metrics.histogram('balance_sync.duration', syncDuration, { user_id: userId });
      this.metrics.increment('balance_sync.completed', 1, { 
        user_id: userId,
        conflicts_resolved: conflictsResolved.toString()
      });

      logger.info('Balance synchronization completed', {
        userId,
        syncDuration,
        conflictsResolved,
        operationsProcessed,
        errorCount: errors.length
      });

      return {
        success: errors.length === 0,
        userId,
        syncedAt: new Date(),
        conflictsResolved,
        operationsProcessed,
        errors
      };

    } catch (error) {
      const syncError: SyncError = {
        type: SyncErrorType.FIRESTORE_ERROR,
        message: error instanceof Error ? error.message : 'Unknown sync error',
        timestamp: new Date()
      };
      errors.push(syncError);

      logger.error('Balance synchronization failed', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      this.metrics.increment('balance_sync.errors', 1, { 
        user_id: userId,
        error_type: syncError.type
      });

      return {
        success: false,
        userId,
        syncedAt: new Date(),
        conflictsResolved,
        operationsProcessed,
        errors
      };
    }
  }

  /**
   * Synchronize all user balances
   */
  async syncAllBalances(): Promise<SyncResult[]> {
    try {
      // Get all users with balances
      const balancesQuery = await this.firestore.collection('credit_balances').get();
      const userIds = balancesQuery.docs.map(doc => doc.id);

      const results: SyncResult[] = [];
      const batchSize = 10; // Process in batches to avoid overwhelming the system

      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        const batchPromises = batch.map(userId => this.syncBalance(userId));
        const batchResults = await Promise.allSettled(batchPromises);

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            results.push({
              success: false,
              userId: batch[index],
              syncedAt: new Date(),
              conflictsResolved: 0,
              operationsProcessed: 0,
              errors: [{
                type: SyncErrorType.FIRESTORE_ERROR,
                message: result.reason?.message || 'Batch sync failed',
                timestamp: new Date()
              }]
            });
          }
        });
      }

      logger.info('Batch balance synchronization completed', {
        totalUsers: userIds.length,
        successfulSyncs: results.filter(r => r.success).length,
        failedSyncs: results.filter(r => !r.success).length
      });

      return results;

    } catch (error) {
      logger.error('Batch balance synchronization failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Reserve credits for future use
   */
  async reserveCredits(request: ReservationRequest): Promise<CreditReservation> {
    const reservationId = uuidv4();
    
    try {
      // Validate sufficient balance
      const balance = await this.getFirestoreBalance(request.userId);
      if (!balance) {
        throw new Error(`User balance not found: ${request.userId}`);
      }

      if (balance.availableBalance < request.amount) {
        throw new Error(`Insufficient credits for reservation. Available: ${balance.availableBalance}, Required: ${request.amount}`);
      }

      // Create reservation
      const reservation: CreditReservation = {
        id: reservationId,
        userId: request.userId,
        amount: request.amount,
        correlationId: request.correlationId,
        status: ReservationStatus.ACTIVE,
        createdAt: new Date(),
        expiresAt: request.expiresAt,
        metadata: request.metadata || {}
      };

      // Update balance and create reservation atomically
      await this.firestore.runTransaction(async (transaction) => {
        const balanceRef = this.firestore.collection('credit_balances').doc(request.userId);
        const reservationRef = this.firestore.collection('credit_reservations').doc(reservationId);

        // Update balance with reserved credits
        transaction.update(balanceRef, {
          reservedCredits: balance.reservedCredits + request.amount,
          lastUpdated: new Date(),
          version: balance.version + 1
        });

        // Create reservation
        transaction.set(reservationRef, reservation);
      });

      // Update real-time balance
      const updatedBalance = {
        ...balance,
        reservedCredits: balance.reservedCredits + request.amount,
        availableBalance: balance.availableBalance - request.amount
      };
      await this.updateRealtimeBalance(request.userId, updatedBalance);

      // Schedule reservation expiry
      await this.scheduleReservationExpiry(reservationId, request.expiresAt);

      this.metrics.increment('credit_reservations.created', 1, {
        user_id: request.userId,
        amount_range: this.getAmountRange(request.amount)
      });

      logger.info('Credit reservation created', {
        userId: request.userId,
        reservationId,
        amount: request.amount,
        correlationId: request.correlationId,
        expiresAt: request.expiresAt
      });

      return reservation;

    } catch (error) {
      logger.error('Failed to reserve credits', {
        userId: request.userId,
        reservationId,
        amount: request.amount,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      this.metrics.increment('credit_reservations.errors', 1, {
        user_id: request.userId,
        error_type: this.categorizeError(error)
      });

      throw error;
    }
  }

  /**
   * Release credit reservation
   */
  async releaseReservation(userId: string, reservationId: string): Promise<void> {
    try {
      // Get reservation
      const reservationDoc = await this.firestore.collection('credit_reservations').doc(reservationId).get();
      if (!reservationDoc.exists) {
        throw new Error(`Reservation not found: ${reservationId}`);
      }

      const reservation = reservationDoc.data() as CreditReservation;
      if (reservation.userId !== userId) {
        throw new Error(`Reservation ${reservationId} does not belong to user ${userId}`);
      }

      if (reservation.status !== ReservationStatus.ACTIVE) {
        logger.warn('Attempting to release non-active reservation', {
          userId,
          reservationId,
          status: reservation.status
        });
        return;
      }

      // Get current balance
      const balance = await this.getFirestoreBalance(userId);
      if (!balance) {
        throw new Error(`User balance not found: ${userId}`);
      }

      // Release reservation atomically
      await this.firestore.runTransaction(async (transaction) => {
        const balanceRef = this.firestore.collection('credit_balances').doc(userId);
        const reservationRef = this.firestore.collection('credit_reservations').doc(reservationId);

        // Update balance by reducing reserved credits
        transaction.update(balanceRef, {
          reservedCredits: Math.max(0, balance.reservedCredits - reservation.amount),
          lastUpdated: new Date(),
          version: balance.version + 1
        });

        // Update reservation status
        transaction.update(reservationRef, {
          status: ReservationStatus.RELEASED,
          releasedAt: new Date()
        });
      });

      // Update real-time balance
      const updatedBalance = {
        ...balance,
        reservedCredits: Math.max(0, balance.reservedCredits - reservation.amount),
        availableBalance: balance.availableBalance + reservation.amount
      };
      await this.updateRealtimeBalance(userId, updatedBalance);

      this.metrics.increment('credit_reservations.released', 1, {
        user_id: userId,
        amount_range: this.getAmountRange(reservation.amount)
      });

      logger.info('Credit reservation released', {
        userId,
        reservationId,
        amount: reservation.amount
      });

    } catch (error) {
      logger.error('Failed to release reservation', {
        userId,
        reservationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      this.metrics.increment('credit_reservations.release_errors', 1, {
        user_id: userId,
        error_type: this.categorizeError(error)
      });

      throw error;
    }
  }

  /**
   * Confirm credit reservation (convert to actual deduction)
   */
  async confirmReservation(userId: string, reservationId: string, actualAmount?: number): Promise<void> {
    try {
      // Get reservation
      const reservationDoc = await this.firestore.collection('credit_reservations').doc(reservationId).get();
      if (!reservationDoc.exists) {
        throw new Error(`Reservation not found: ${reservationId}`);
      }

      const reservation = reservationDoc.data() as CreditReservation;
      if (reservation.userId !== userId) {
        throw new Error(`Reservation ${reservationId} does not belong to user ${userId}`);
      }

      if (reservation.status !== ReservationStatus.ACTIVE) {
        throw new Error(`Cannot confirm non-active reservation: ${reservation.status}`);
      }

      const deductionAmount = actualAmount || reservation.amount;
      if (deductionAmount > reservation.amount) {
        throw new Error(`Actual amount ${deductionAmount} exceeds reserved amount ${reservation.amount}`);
      }

      // Get current balance
      const balance = await this.getFirestoreBalance(userId);
      if (!balance) {
        throw new Error(`User balance not found: ${userId}`);
      }

      // Confirm reservation atomically
      await this.firestore.runTransaction(async (transaction) => {
        const balanceRef = this.firestore.collection('credit_balances').doc(userId);
        const reservationRef = this.firestore.collection('credit_reservations').doc(reservationId);

        // Calculate new balances
        const newCurrentBalance = balance.currentBalance - deductionAmount;
        const newReservedCredits = balance.reservedCredits - reservation.amount;
        const refundAmount = reservation.amount - deductionAmount;

        // Update balance
        transaction.update(balanceRef, {
          currentBalance: newCurrentBalance,
          reservedCredits: newReservedCredits,
          lifetimeCreditsSpent: balance.lifetimeCreditsSpent + deductionAmount,
          lastUpdated: new Date(),
          version: balance.version + 1
        });

        // Update reservation status
        transaction.update(reservationRef, {
          status: ReservationStatus.CONFIRMED,
          confirmedAt: new Date(),
          actualAmount: deductionAmount,
          refundAmount
        });
      });

      // Update real-time balance
      const updatedBalance = {
        ...balance,
        currentBalance: balance.currentBalance - deductionAmount,
        reservedCredits: balance.reservedCredits - reservation.amount,
        availableBalance: balance.currentBalance - deductionAmount - (balance.reservedCredits - reservation.amount)
      };
      await this.updateRealtimeBalance(userId, updatedBalance);

      this.metrics.increment('credit_reservations.confirmed', 1, {
        user_id: userId,
        amount_range: this.getAmountRange(deductionAmount)
      });

      logger.info('Credit reservation confirmed', {
        userId,
        reservationId,
        reservedAmount: reservation.amount,
        actualAmount: deductionAmount,
        refundAmount: reservation.amount - deductionAmount
      });

    } catch (error) {
      logger.error('Failed to confirm reservation', {
        userId,
        reservationId,
        actualAmount,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      this.metrics.increment('credit_reservations.confirm_errors', 1, {
        user_id: userId,
        error_type: this.categorizeError(error)
      });

      throw error;
    }
  }

  /**
   * Validate balance consistency
   */
  async validateBalance(userId: string): Promise<BalanceValidationResult> {
    try {
      const firestoreBalance = await this.getFirestoreBalance(userId);
      const realtimeBalance = await this.getRealtimeBalance(userId);
      const issues: ValidationIssue[] = [];

      if (!firestoreBalance) {
        issues.push({
          type: ValidationIssueType.BALANCE_MISMATCH,
          severity: ValidationSeverity.CRITICAL,
          description: 'Balance not found in Firestore',
          recommendation: 'Initialize user balance in Firestore'
        });

        return {
          isValid: false,
          userId,
          expectedBalance: 0,
          actualBalance: realtimeBalance?.balance || 0,
          discrepancy: realtimeBalance?.balance || 0,
          validationTimestamp: new Date(),
          issues
        };
      }

      // Check balance consistency
      if (realtimeBalance && Math.abs(firestoreBalance.currentBalance - realtimeBalance.balance) > 0.01) {
        issues.push({
          type: ValidationIssueType.BALANCE_MISMATCH,
          severity: ValidationSeverity.HIGH,
          description: `Balance mismatch: Firestore=${firestoreBalance.currentBalance}, Realtime=${realtimeBalance.balance}`,
          recommendation: 'Synchronize balances using conflict resolution strategy'
        });
      }

      // Check for stuck pending operations
      const pendingOps = await this.getPendingOperations(userId);
      const stuckOps = pendingOps.filter(op => 
        Date.now() - op.createdAt.getTime() > this.config.reservationTimeoutMs
      );

      if (stuckOps.length > 0) {
        issues.push({
          type: ValidationIssueType.PENDING_OPERATION_STUCK,
          severity: ValidationSeverity.MEDIUM,
          description: `${stuckOps.length} pending operations are stuck`,
          recommendation: 'Process or expire stuck pending operations'
        });
      }

      return {
        isValid: issues.length === 0,
        userId,
        expectedBalance: firestoreBalance.currentBalance,
        actualBalance: realtimeBalance?.balance || firestoreBalance.currentBalance,
        discrepancy: Math.abs(firestoreBalance.currentBalance - (realtimeBalance?.balance || firestoreBalance.currentBalance)),
        validationTimestamp: new Date(),
        issues
      };

    } catch (error) {
      logger.error('Failed to validate balance', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        isValid: false,
        userId,
        expectedBalance: 0,
        actualBalance: 0,
        discrepancy: 0,
        validationTimestamp: new Date(),
        issues: [{
          type: ValidationIssueType.BALANCE_MISMATCH,
          severity: ValidationSeverity.CRITICAL,
          description: 'Validation failed due to system error',
          recommendation: 'Retry validation or investigate system issues'
        }]
      };
    }
  }

  /**
   * Handle insufficient credits scenario
   */
  async handleInsufficientCredits(userId: string, requiredAmount: number): Promise<InsufficientCreditsResponse> {
    try {
      const balance = await this.getFirestoreBalance(userId);
      const currentBalance = balance?.currentBalance || 0;
      const shortfall = Math.max(0, requiredAmount - currentBalance);

      // Generate payment options
      const paymentOptions: PaymentOption[] = [
        {
          id: 'small_topup',
          name: 'Small Top-up',
          description: '500 credits',
          creditAmount: 500,
          price: 12.00,
          currency: 'USD',
          recommended: shortfall <= 500
        },
        {
          id: 'medium_topup',
          name: 'Medium Top-up',
          description: '1000 credits',
          creditAmount: 1000,
          price: 24.00,
          currency: 'USD',
          recommended: shortfall > 500 && shortfall <= 1000
        },
        {
          id: 'large_topup',
          name: 'Large Top-up',
          description: '2500 credits',
          creditAmount: 2500,
          price: 50.00,
          currency: 'USD',
          recommended: shortfall > 1000
        }
      ];

      // Calculate suggested top-up amount
      const suggestedTopUpAmount = Math.max(shortfall, 500); // Minimum 500 credits

      return {
        hasInsufficientCredits: shortfall > 0,
        currentBalance,
        requiredAmount,
        shortfall,
        suggestedTopUpAmount,
        paymentOptions
      };

    } catch (error) {
      logger.error('Failed to handle insufficient credits', {
        userId,
        requiredAmount,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        hasInsufficientCredits: true,
        currentBalance: 0,
        requiredAmount,
        shortfall: requiredAmount,
        suggestedTopUpAmount: Math.max(requiredAmount, 500),
        paymentOptions: []
      };
    }
  }

  /**
   * Subscribe to balance changes
   */
  async subscribeToBalanceChanges(
    userId: string, 
    callback: BalanceChangeCallback
  ): Promise<() => void> {
    try {
      const balanceRef = this.database.ref(`user_balances/${userId}`);
      
      const listener = balanceRef.on('value', async (snapshot) => {
        if (snapshot.exists()) {
          // Get full balance data from Firestore
          const fullBalance = await this.getFirestoreBalance(userId);
          if (fullBalance) {
            callback(fullBalance, BalanceChangeType.SYNC_UPDATE);
          }
        }
      });

      // Store unsubscribe function
      const unsubscribe = () => {
        balanceRef.off('value', listener);
        this.activeSubscriptions.delete(userId);
      };

      this.activeSubscriptions.set(userId, unsubscribe);
      return unsubscribe;

    } catch (error) {
      logger.error('Failed to subscribe to balance changes', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Broadcast balance update
   */
  async broadcastBalanceUpdate(userId: string, balance: CreditBalance): Promise<void> {
    try {
      await this.database.ref(`user_balances/${userId}`).set({
        balance: balance.currentBalance,
        availableBalance: balance.availableBalance,
        reservedCredits: balance.reservedCredits,
        lastUpdated: Date.now(),
        version: balance.version,
        healthStatus: balance.healthStatus
      });

      this.metrics.increment('balance_sync.broadcasts', 1, { user_id: userId });

    } catch (error) {
      logger.error('Failed to broadcast balance update', {
        userId,
        balance: balance.currentBalance,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw - this is not critical
    }
  }

  /**
   * Start health monitoring
   */
  async startHealthMonitoring(): Promise<void> {
    if (this.healthMonitoringInterval) {
      return; // Already running
    }

    this.healthMonitoringInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('Health monitoring check failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, this.config.healthCheckIntervalMs);

    logger.info('Balance sync health monitoring started', {
      intervalMs: this.config.healthCheckIntervalMs
    });
  }

  /**
   * Stop health monitoring
   */
  async stopHealthMonitoring(): Promise<void> {
    if (this.healthMonitoringInterval) {
      clearInterval(this.healthMonitoringInterval);
      this.healthMonitoringInterval = undefined;
      logger.info('Balance sync health monitoring stopped');
    }
  }

  /**
   * Get health status for user
   */
  async getHealthStatus(userId: string): Promise<BalanceHealthStatus> {
    try {
      const validation = await this.validateBalance(userId);
      
      if (!validation.isValid) {
        const criticalIssues = validation.issues.filter(i => i.severity === ValidationSeverity.CRITICAL);
        if (criticalIssues.length > 0) {
          return BalanceHealthStatus.CORRUPTED;
        }
        
        const highIssues = validation.issues.filter(i => i.severity === ValidationSeverity.HIGH);
        if (highIssues.length > 0) {
          return BalanceHealthStatus.CRITICAL;
        }
        
        return BalanceHealthStatus.WARNING;
      }

      return BalanceHealthStatus.HEALTHY;

    } catch (error) {
      logger.error('Failed to get health status', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return BalanceHealthStatus.CORRUPTED;
    }
  }

  // Private helper methods

  private async getFirestoreBalance(userId: string): Promise<CreditBalance | null> {
    try {
      const doc = await this.firestore.collection('credit_balances').doc(userId).get();
      return doc.exists ? doc.data() as CreditBalance : null;
    } catch (error) {
      logger.error('Failed to get Firestore balance', { userId, error });
      return null;
    }
  }

  private async getRealtimeBalance(userId: string): Promise<{ balance: number; lastUpdated: number } | null> {
    try {
      const snapshot = await this.database.ref(`user_balances/${userId}`).once('value');
      return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
      logger.error('Failed to get Realtime balance', { userId, error });
      return null;
    }
  }

  private detectBalanceConflict(
    firestoreBalance: CreditBalance, 
    realtimeBalance: { balance: number; lastUpdated: number } | null
  ): boolean {
    if (!realtimeBalance) return false;
    return Math.abs(firestoreBalance.currentBalance - realtimeBalance.balance) > 0.01;
  }

  private async resolveBalanceConflict(
    firestoreBalance: CreditBalance,
    realtimeBalance: { balance: number; lastUpdated: number } | null
  ): Promise<CreditBalance> {
    switch (this.config.conflictResolutionStrategy) {
      case ConflictResolutionStrategy.FIRESTORE_WINS:
        return firestoreBalance;
      
      case ConflictResolutionStrategy.REALTIME_WINS:
        if (realtimeBalance) {
          return {
            ...firestoreBalance,
            currentBalance: realtimeBalance.balance,
            availableBalance: realtimeBalance.balance - firestoreBalance.reservedCredits
          };
        }
        return firestoreBalance;
      
      case ConflictResolutionStrategy.LATEST_TIMESTAMP:
        if (realtimeBalance && realtimeBalance.lastUpdated > firestoreBalance.lastUpdated.getTime()) {
          return {
            ...firestoreBalance,
            currentBalance: realtimeBalance.balance,
            availableBalance: realtimeBalance.balance - firestoreBalance.reservedCredits
          };
        }
        return firestoreBalance;
      
      default:
        return firestoreBalance;
    }
  }

  private async updateFirestoreBalance(userId: string, balance: CreditBalance): Promise<void> {
    try {
      await this.firestore.collection('credit_balances').doc(userId).update({
        currentBalance: balance.currentBalance,
        availableBalance: balance.availableBalance,
        reservedCredits: balance.reservedCredits,
        lastUpdated: new Date(),
        version: balance.version + 1
      });
    } catch (error) {
      logger.error('Failed to update Firestore balance', { userId, error });
      throw error;
    }
  }

  private async updateRealtimeBalance(userId: string, balance: CreditBalance): Promise<void> {
    try {
      await this.database.ref(`user_balances/${userId}`).set({
        balance: balance.currentBalance,
        availableBalance: balance.availableBalance,
        reservedCredits: balance.reservedCredits,
        lastUpdated: Date.now(),
        version: balance.version
      });
    } catch (error) {
      logger.error('Failed to update Realtime balance', { userId, error });
      // Don't throw - this is not critical for the main operation
    }
  }

  private async getPendingOperations(userId: string): Promise<PendingOperation[]> {
    try {
      const balance = await this.getFirestoreBalance(userId);
      return balance?.pendingOperations || [];
    } catch (error) {
      logger.error('Failed to get pending operations', { userId, error });
      return [];
    }
  }

  private async processPendingOperation(userId: string, operation: PendingOperation): Promise<void> {
    // Process pending operation based on type
    switch (operation.type) {
      case TransactionType.CREDIT_DEDUCTION:
        // Handle pending deduction
        break;
      case TransactionType.CREDIT_ADDITION:
        // Handle pending addition
        break;
      default:
        logger.warn('Unknown pending operation type', { userId, operationType: operation.type });
    }
  }

  private async updateSyncMetadata(userId: string, metadata: {
    lastSyncTimestamp: Date;
    syncVersion: number;
    conflictsResolved: number;
    operationsProcessed: number;
  }): Promise<void> {
    try {
      await this.firestore.collection('credit_balances').doc(userId).update({
        lastSyncTimestamp: metadata.lastSyncTimestamp,
        syncVersion: metadata.syncVersion
      });
    } catch (error) {
      logger.error('Failed to update sync metadata', { userId, error });
      // Don't throw - this is not critical
    }
  }

  private async scheduleReservationExpiry(reservationId: string, expiresAt: Date): Promise<void> {
    // In production, this would use a job scheduler or cloud function trigger
    const timeoutMs = expiresAt.getTime() - Date.now();
    
    if (timeoutMs > 0) {
      setTimeout(async () => {
        try {
          const reservationDoc = await this.firestore.collection('credit_reservations').doc(reservationId).get();
          if (reservationDoc.exists) {
            const reservation = reservationDoc.data() as CreditReservation;
            if (reservation.status === ReservationStatus.ACTIVE) {
              await this.releaseReservation(reservation.userId, reservationId);
              logger.info('Reservation expired and released', { reservationId, userId: reservation.userId });
            }
          }
        } catch (error) {
          logger.error('Failed to expire reservation', { reservationId, error });
        }
      }, timeoutMs);
    }
  }

  private async performHealthCheck(): Promise<void> {
    // Get sample of users for health check
    const balancesQuery = await this.firestore.collection('credit_balances').limit(10).get();
    
    let healthyUsers = 0;
    let totalUsers = 0;

    for (const doc of balancesQuery.docs) {
      totalUsers++;
      const userId = doc.id;
      const healthStatus = await this.getHealthStatus(userId);
      
      if (healthStatus === BalanceHealthStatus.HEALTHY) {
        healthyUsers++;
      }
    }

    const healthPercentage = totalUsers > 0 ? (healthyUsers / totalUsers) * 100 : 100;
    
    this.metrics.gauge('balance_sync.health_percentage', healthPercentage);
    this.metrics.gauge('balance_sync.active_subscriptions', this.activeSubscriptions.size);

    logger.info('Balance sync health check completed', {
      totalUsers,
      healthyUsers,
      healthPercentage,
      activeSubscriptions: this.activeSubscriptions.size
    });
  }

  private getAmountRange(amount: number): string {
    if (amount <= 10) return '1-10';
    if (amount <= 50) return '11-50';
    if (amount <= 100) return '51-100';
    if (amount <= 500) return '101-500';
    return '500+';
  }

  private categorizeError(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('insufficient')) return 'insufficient_credits';
      if (error.message.includes('not found')) return 'not_found';
      if (error.message.includes('expired')) return 'expired';
      if (error.message.includes('timeout')) return 'timeout';
    }
    return 'unknown_error';
  }
}