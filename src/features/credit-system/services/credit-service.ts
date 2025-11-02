/**
 * Credit Service Implementation
 * Manages user credits, transactions, and reservations
 */

import { logger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';
import { 
  ICreditService,
  CreditBalance,
  CreditTransaction,
  CreditReservation,
  TransactionType,
  TransactionStatus,
  CreditSource,
  TransactionMetadata,
  TransactionHistoryOptions,
  CreditUsageAnalytics,
  AuditReport,
  HealthCheckResult,
  SystemMetrics,
  ReservationStatus,
  TimeRange,
  AccountStatus,
  BalanceHealthStatus
} from '../../../shared/types/credit-system';
import { v4 as uuidv4 } from 'uuid';

/**
 * Credit service configuration
 */
export interface CreditServiceConfig {
  welcomeBonusAmount: number;
  reservationExpiryMinutes: number;
  maxReservationAmount: number;
  minBalanceThreshold: number;
}

/**
 * Credit service implementation
 */
export class CreditService implements ICreditService {
  private firestore = getFirestore();
  private database = getDatabase();
  private metrics: IMetricsCollector;
  private config: CreditServiceConfig;

  constructor(metrics: IMetricsCollector, config?: Partial<CreditServiceConfig>) {
    this.metrics = metrics;
    this.config = {
      welcomeBonusAmount: 1000,
      reservationExpiryMinutes: 30,
      maxReservationAmount: 1000,
      minBalanceThreshold: 10,
      ...config
    };
  }

  /**
   * Get user's current credit balance
   */
  async getBalance(userId: string): Promise<CreditBalance> {
    try {
      const balanceDoc = await this.firestore
        .collection('credit_balances')
        .doc(userId)
        .get();

      if (!balanceDoc.exists) {
        // Create new user with welcome bonus
        return await this.createNewUserBalance(userId);
      }

      const data = balanceDoc.data();
      return {
        userId,
        currentBalance: data?.currentBalance || 0,
        reservedCredits: data?.reservedCredits || 0,
        availableBalance: (data?.currentBalance || 0) - (data?.reservedCredits || 0),
        lastUpdated: data?.lastUpdated?.toDate() || new Date(),
        accountStatus: data?.accountStatus || AccountStatus.ACTIVE,
        lifetimeCreditsEarned: data?.lifetimeCreditsEarned || 0,
        lifetimeCreditsSpent: data?.lifetimeCreditsSpent || 0,
        version: data?.version || 1,
        lastEventId: data?.lastEventId || '',
        syncVersion: data?.syncVersion || 1,
        lastSyncTimestamp: data?.lastSyncTimestamp?.toDate() || new Date(),
        pendingOperations: data?.pendingOperations || [],
        lastVerifiedBalance: data?.lastVerifiedBalance || 0,
        lastVerificationTimestamp: data?.lastVerificationTimestamp?.toDate() || new Date(),
        verificationHash: data?.verificationHash || '',
        healthStatus: data?.healthStatus || BalanceHealthStatus.HEALTHY,
        lastHealthCheck: data?.lastHealthCheck?.toDate() || new Date()
      };

    } catch (error) {
      logger.error('Failed to get credit balance', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Validate if user has sufficient balance
   */
  async validateBalance(userId: string, amount: number): Promise<boolean> {
    try {
      const balance = await this.getBalance(userId);
      return balance.availableBalance >= amount;
    } catch (error) {
      logger.error('Failed to validate balance', {
        userId,
        amount,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Add credits to user account
   */
  async addCredits(
    userId: string, 
    amount: number, 
    source: CreditSource, 
    reason: string, 
    metadata?: TransactionMetadata
  ): Promise<CreditTransaction> {
    const transactionId = uuidv4();
    const timestamp = new Date();

    try {
      // Get current balance
      const currentBalance = await this.getBalance(userId);

      // Create transaction record
      const transaction: CreditTransaction = {
        id: transactionId,
        userId,
        type: TransactionType.CREDIT_ADDITION,
        amount,
        balanceBefore: currentBalance.currentBalance,
        balanceAfter: currentBalance.currentBalance + amount,
        status: TransactionStatus.COMPLETED,
        source,
        reason,
        metadata: metadata || {},
        timestamp,
        eventId: transactionId,
        version: 1,
        transactionHash: '',
        previousTransactionHash: '',
        signature: '',
        blockIndex: 0,
        correlationId: metadata?.correlationId || transactionId,
        idempotencyKey: metadata?.idempotencyKey || transactionId,
        processingDuration: 0,
        retryCount: 0
      };

      // Update balance and save transaction atomically
      await this.firestore.runTransaction(async (firestoreTransaction) => {
        const balanceRef = this.firestore.collection('credit_balances').doc(userId);
        const transactionRef = this.firestore.collection('credit_transactions').doc(transactionId);

        // Update balance
        firestoreTransaction.set(balanceRef, {
          currentBalance: currentBalance.currentBalance + amount,
          lifetimeCreditsEarned: currentBalance.lifetimeCreditsEarned + amount,
          lastUpdated: timestamp,
          version: currentBalance.version + 1,
          lastEventId: transactionId
        }, { merge: true });

        // Save transaction
        firestoreTransaction.set(transactionRef, transaction);
      });

      // Update real-time balance
      await this.updateRealtimeBalance(userId, currentBalance.currentBalance + amount);

      // Record metrics
      this.metrics.increment('credits.added', 1, {
        source: source.toString(),
        amount_range: this.getAmountRange(amount)
      });

      this.metrics.histogram('credits.addition_amount', amount, {
        source: source.toString()
      });

      logger.info('Credits added successfully', {
        userId,
        transactionId,
        amount,
        source,
        reason,
        newBalance: currentBalance.currentBalance + amount
      });

      return transaction;

    } catch (error) {
      logger.error('Failed to add credits', {
        userId,
        transactionId,
        amount,
        source,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      this.metrics.increment('credits.addition_errors', 1, {
        source: source.toString(),
        error_type: this.categorizeError(error)
      });

      throw error;
    }
  }

  /**
   * Deduct credits from user account
   */
  async deductCredits(
    userId: string, 
    amount: number, 
    correlationId: string, 
    metadata?: TransactionMetadata
  ): Promise<CreditTransaction> {
    const transactionId = uuidv4();
    const timestamp = new Date();

    try {
      // Get current balance
      const currentBalance = await this.getBalance(userId);

      // Validate sufficient balance
      if (currentBalance.availableBalance < amount) {
        throw new Error(`Insufficient credits. Available: ${currentBalance.availableBalance}, Required: ${amount}`);
      }

      // Create transaction record
      const transaction: CreditTransaction = {
        id: transactionId,
        userId,
        type: TransactionType.CREDIT_DEDUCTION,
        amount: -amount, // Negative for deduction
        balanceBefore: currentBalance.currentBalance,
        balanceAfter: currentBalance.currentBalance - amount,
        status: TransactionStatus.COMPLETED,
        source: CreditSource.AI_USAGE,
        reason: metadata?.reason || 'AI service usage',
        metadata: metadata || {},
        timestamp,
        eventId: transactionId,
        version: 1,
        transactionHash: '',
        previousTransactionHash: '',
        signature: '',
        blockIndex: 0,
        correlationId,
        idempotencyKey: metadata?.idempotencyKey || transactionId,
        processingDuration: 0,
        retryCount: 0
      };

      // Update balance and save transaction atomically
      await this.firestore.runTransaction(async (firestoreTransaction) => {
        const balanceRef = this.firestore.collection('credit_balances').doc(userId);
        const transactionRef = this.firestore.collection('credit_transactions').doc(transactionId);

        // Update balance
        firestoreTransaction.set(balanceRef, {
          currentBalance: currentBalance.currentBalance - amount,
          lifetimeCreditsSpent: currentBalance.lifetimeCreditsSpent + amount,
          lastUpdated: timestamp,
          version: currentBalance.version + 1,
          lastEventId: transactionId
        }, { merge: true });

        // Save transaction
        firestoreTransaction.set(transactionRef, transaction);
      });

      // Update real-time balance
      await this.updateRealtimeBalance(userId, currentBalance.currentBalance - amount);

      // Record metrics
      this.metrics.increment('credits.deducted', 1, {
        feature: metadata?.featureId || 'unknown',
        amount_range: this.getAmountRange(amount)
      });

      this.metrics.histogram('credits.deduction_amount', amount, {
        feature: metadata?.featureId || 'unknown'
      });

      logger.info('Credits deducted successfully', {
        userId,
        transactionId,
        amount,
        correlationId,
        newBalance: currentBalance.currentBalance - amount
      });

      return transaction;

    } catch (error) {
      logger.error('Failed to deduct credits', {
        userId,
        transactionId,
        amount,
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      this.metrics.increment('credits.deduction_errors', 1, {
        error_type: this.categorizeError(error)
      });

      throw error;
    }
  }

  /**
   * Reserve credits for future use
   */
  async reserveCredits(userId: string, amount: number, correlationId: string): Promise<CreditReservation> {
    const reservationId = uuidv4();
    const timestamp = new Date();
    const expiresAt = new Date(timestamp.getTime() + this.config.reservationExpiryMinutes * 60 * 1000);

    try {
      // Validate reservation amount
      if (amount > this.config.maxReservationAmount) {
        throw new Error(`Reservation amount exceeds maximum allowed: ${this.config.maxReservationAmount}`);
      }

      // Get current balance
      const currentBalance = await this.getBalance(userId);

      // Validate sufficient balance
      if (currentBalance.availableBalance < amount) {
        throw new Error(`Insufficient credits for reservation. Available: ${currentBalance.availableBalance}, Required: ${amount}`);
      }

      const reservation: CreditReservation = {
        id: reservationId,
        userId,
        amount,
        correlationId,
        status: ReservationStatus.ACTIVE,
        createdAt: timestamp,
        expiresAt,
        metadata: { correlationId }
      };

      // Update balance and save reservation atomically
      await this.firestore.runTransaction(async (firestoreTransaction) => {
        const balanceRef = this.firestore.collection('credit_balances').doc(userId);
        const reservationRef = this.firestore.collection('credit_reservations').doc(reservationId);

        // Update balance with reserved credits
        firestoreTransaction.set(balanceRef, {
          reservedCredits: currentBalance.reservedCredits + amount,
          lastUpdated: timestamp,
          version: currentBalance.version + 1
        }, { merge: true });

        // Save reservation
        firestoreTransaction.set(reservationRef, reservation);
      });

      // Record metrics
      this.metrics.increment('credits.reserved', 1, {
        amount_range: this.getAmountRange(amount)
      });

      logger.info('Credits reserved successfully', {
        userId,
        reservationId,
        amount,
        correlationId,
        expiresAt
      });

      return reservation;

    } catch (error) {
      logger.error('Failed to reserve credits', {
        userId,
        reservationId,
        amount,
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      this.metrics.increment('credits.reservation_errors', 1, {
        error_type: this.categorizeError(error)
      });

      throw error;
    }
  }

  /**
   * Release reserved credits
   */
  async releaseReservedCredits(userId: string, amount: number, correlationId: string): Promise<void> {
    try {
      // Find active reservation
      const reservationsQuery = await this.firestore
        .collection('credit_reservations')
        .where('userId', '==', userId)
        .where('correlationId', '==', correlationId)
        .where('status', '==', ReservationStatus.ACTIVE)
        .get();

      if (reservationsQuery.empty) {
        logger.warn('No active reservation found to release', { userId, correlationId, amount });
        return;
      }

      const reservationDoc = reservationsQuery.docs[0];
      const reservation = reservationDoc.data() as CreditReservation;

      // Get current balance
      const currentBalance = await this.getBalance(userId);

      // Update balance and reservation status atomically
      await this.firestore.runTransaction(async (firestoreTransaction) => {
        const balanceRef = this.firestore.collection('credit_balances').doc(userId);
        const reservationRef = this.firestore.collection('credit_reservations').doc(reservation.id);

        // Update balance by reducing reserved credits
        firestoreTransaction.set(balanceRef, {
          reservedCredits: Math.max(0, currentBalance.reservedCredits - amount),
          lastUpdated: new Date(),
          version: currentBalance.version + 1
        }, { merge: true });

        // Update reservation status
        firestoreTransaction.set(reservationRef, {
          status: ReservationStatus.RELEASED,
          releasedAt: new Date()
        }, { merge: true });
      });

      // Record metrics
      this.metrics.increment('credits.released', 1, {
        amount_range: this.getAmountRange(amount)
      });

      logger.info('Reserved credits released successfully', {
        userId,
        reservationId: reservation.id,
        amount,
        correlationId
      });

    } catch (error) {
      logger.error('Failed to release reserved credits', {
        userId,
        amount,
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      this.metrics.increment('credits.release_errors', 1, {
        error_type: this.categorizeError(error)
      });

      throw error;
    }
  }

  /**
   * Confirm reserved credits (convert to actual deduction)
   */
  async confirmReservedCredits(userId: string, reservationId: string, actualAmount?: number): Promise<CreditTransaction> {
    // For now, implement a simple version
    // In production, this would handle the conversion from reservation to actual transaction
    throw new Error('confirmReservedCredits not yet implemented');
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(userId: string, options?: TransactionHistoryOptions): Promise<CreditTransaction[]> {
    try {
      let query = this.firestore
        .collection('credit_transactions')
        .where('userId', '==', userId);

      // Apply filters
      if (options?.types && options.types.length > 0) {
        query = query.where('type', 'in', options.types);
      }

      if (options?.startDate) {
        query = query.where('createdAt', '>=', options.startDate);
      }

      if (options?.endDate) {
        query = query.where('createdAt', '<=', options.endDate);
      }

      // Apply sorting
      const sortBy = options?.sortBy || 'createdAt';
      const sortOrder = options?.sortOrder || 'desc';
      query = query.orderBy(sortBy, sortOrder);

      // Apply pagination
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.offset(options.offset);
      }

      const snapshot = await query.get();
      return snapshot.docs.map(doc => doc.data() as CreditTransaction);

    } catch (error) {
      logger.error('Failed to get transaction history', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get specific transaction
   */
  async getTransaction(transactionId: string): Promise<CreditTransaction | null> {
    try {
      const doc = await this.firestore
        .collection('credit_transactions')
        .doc(transactionId)
        .get();

      return doc.exists ? doc.data() as CreditTransaction : null;

    } catch (error) {
      logger.error('Failed to get transaction', {
        transactionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get user usage analytics (placeholder)
   */
  async getUserUsageAnalytics(userId: string, timeRange: TimeRange): Promise<CreditUsageAnalytics> {
    // Placeholder implementation
    throw new Error('getUserUsageAnalytics not yet implemented');
  }

  /**
   * Generate audit report (placeholder)
   */
  async generateAuditReport(userId: string, timeRange: TimeRange): Promise<AuditReport> {
    // Placeholder implementation
    throw new Error('generateAuditReport not yet implemented');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const timestamp = new Date();
    const checks = [];

    try {
      // Test Firestore connection
      const firestoreStart = Date.now();
      await this.firestore.collection('_health').doc('test').get();
      checks.push({
        name: 'firestore',
        status: 'pass' as const,
        responseTime: Date.now() - firestoreStart
      });

      // Test Realtime Database connection
      const rtdbStart = Date.now();
      await this.database.ref('_health').once('value');
      checks.push({
        name: 'realtime_database',
        status: 'pass' as const,
        responseTime: Date.now() - rtdbStart
      });

    } catch (error) {
      checks.push({
        name: 'database_connectivity',
        status: 'fail' as const,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    const overallScore = checks.filter(c => c.status === 'pass').length / checks.length * 100;
    const status = overallScore >= 80 ? 'healthy' : overallScore >= 50 ? 'degraded' : 'unhealthy';

    return {
      status,
      timestamp,
      checks,
      overallScore
    };
  }

  /**
   * Get system metrics (placeholder)
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    // Placeholder implementation
    throw new Error('getSystemMetrics not yet implemented');
  }

  /**
   * Create new user balance with welcome bonus
   */
  private async createNewUserBalance(userId: string): Promise<CreditBalance> {
    const timestamp = new Date();
    const welcomeTransactionId = uuidv4();

    const balance: CreditBalance = {
      userId,
      currentBalance: this.config.welcomeBonusAmount,
      reservedCredits: 0,
      availableBalance: this.config.welcomeBonusAmount,
      lastUpdated: timestamp,
      accountStatus: AccountStatus.ACTIVE,
      lifetimeCreditsEarned: this.config.welcomeBonusAmount,
      lifetimeCreditsSpent: 0,
      version: 1,
      lastEventId: welcomeTransactionId,
      syncVersion: 1,
      lastSyncTimestamp: timestamp,
      pendingOperations: [],
      lastVerifiedBalance: this.config.welcomeBonusAmount,
      lastVerificationTimestamp: timestamp,
      verificationHash: '',
      healthStatus: BalanceHealthStatus.HEALTHY,
      lastHealthCheck: timestamp
    };

    const welcomeTransaction: CreditTransaction = {
      id: welcomeTransactionId,
      userId,
      type: TransactionType.WELCOME_BONUS,
      amount: this.config.welcomeBonusAmount,
      balanceBefore: 0,
      balanceAfter: this.config.welcomeBonusAmount,
      status: TransactionStatus.COMPLETED,
      source: CreditSource.WELCOME_BONUS,
      reason: 'Welcome bonus for new user',
      metadata: {},
      timestamp,
      eventId: welcomeTransactionId,
      version: 1,
      transactionHash: '',
      previousTransactionHash: '',
      signature: '',
      blockIndex: 0,
      correlationId: welcomeTransactionId,
      idempotencyKey: welcomeTransactionId,
      processingDuration: 0,
      retryCount: 0
    };

    // Save balance and transaction atomically
    await this.firestore.runTransaction(async (transaction) => {
      const balanceRef = this.firestore.collection('credit_balances').doc(userId);
      const transactionRef = this.firestore.collection('credit_transactions').doc(welcomeTransactionId);

      transaction.set(balanceRef, balance);
      transaction.set(transactionRef, welcomeTransaction);
    });

    // Update real-time balance
    await this.updateRealtimeBalance(userId, this.config.welcomeBonusAmount);

    // Record metrics
    this.metrics.increment('credits.welcome_bonus_granted', 1);

    logger.info('New user created with welcome bonus', {
      userId,
      welcomeBonusAmount: this.config.welcomeBonusAmount,
      transactionId: welcomeTransactionId
    });

    return balance;
  }

  /**
   * Update real-time balance in Realtime Database
   */
  private async updateRealtimeBalance(userId: string, balance: number): Promise<void> {
    try {
      await this.database.ref(`user_balances/${userId}`).set({
        balance,
        lastUpdated: Date.now()
      });
    } catch (error) {
      logger.error('Failed to update real-time balance', {
        userId,
        balance,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw - this is not critical for the main operation
    }
  }

  /**
   * Categorize error for metrics
   */
  private categorizeError(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('insufficient')) return 'insufficient_credits';
      if (error.message.includes('not found')) return 'not_found';
      if (error.message.includes('validation')) return 'validation_error';
      if (error.message.includes('timeout')) return 'timeout';
    }
    return 'unknown_error';
  }

  /**
   * Get amount range for metrics
   */
  private getAmountRange(amount: number): string {
    if (amount <= 10) return '1-10';
    if (amount <= 50) return '11-50';
    if (amount <= 100) return '51-100';
    if (amount <= 500) return '101-500';
    return '500+';
  }
}