/**
 * Blockchain-Style Ledger Service
 * Implements cryptographic transaction recording with hash chain validation
 */

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';
import { 
  CreditTransaction,
  LedgerEntry,
  ChainValidationResult,
  ChainValidationError,
  ChainErrorType,
  AuditReport,
  TimeRange,
  AuditTransaction,
  AuditAnomaly,
  AuditRecommendation,
  ComplianceStatus,
  ComplianceCheck,
  VerificationStatus,
  AnomalyType,
  AnomalySeverity,
  RecommendationCategory,
  RecommendationPriority,
  CheckStatus,
  ComplianceLevel
} from '../../../shared/types/credit-system';
import { createHash, createHmac, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

/**
 * Cryptographic utilities for ledger operations
 */
export interface ICryptoUtils {
  generateTransactionHash(transaction: CreditTransaction, previousHash: string): string;
  signTransaction(transaction: CreditTransaction, signingKey: string): Promise<string>;
  verifyTransactionSignature(transaction: CreditTransaction, signature: string, publicKey: string): Promise<boolean>;
  generateKeyPair(): Promise<{ privateKey: string; publicKey: string }>;
}

/**
 * Integrity monitoring for continuous validation
 */
export interface IIntegrityMonitor {
  startMonitoring(userId: string): Promise<MonitoringSession>;
  stopMonitoring(sessionId: string): Promise<void>;
  getMonitoringStatus(userId: string): Promise<MonitoringStatus>;
}

export interface MonitoringSession {
  id: string;
  userId: string;
  startedAt: Date;
  lastCheck: Date;
  checksPerformed: number;
  issuesFound: number;
  status: MonitoringStatus;
}

export enum MonitoringStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error'
}

/**
 * Ledger service interface
 */
export interface ILedgerService {
  // Transaction recording with cryptographic security
  recordTransaction(transaction: CreditTransaction): Promise<LedgerEntry>;
  recordBatch(transactions: CreditTransaction[]): Promise<LedgerEntry[]>;
  
  // Hash chain validation and integrity
  validateHashChain(userId: string): Promise<ChainValidationResult>;
  validateTransactionIntegrity(transactionId: string): Promise<IntegrityResult>;
  
  // Continuous monitoring and repair
  startIntegrityMonitoring(userId: string): Promise<MonitoringSession>;
  repairHashChain(userId: string, fromTransaction?: string): Promise<RepairResult>;
  
  // Audit and compliance
  generateAuditReport(userId: string, timeRange: TimeRange): Promise<AuditReport>;
  verifyCompliance(userId: string, complianceRules: ComplianceRule[]): Promise<ComplianceResult>;
  
  // Event sourcing integration
  getTransactionEvents(userId: string): Promise<TransactionEvent[]>;
  replayTransactionHistory(userId: string): Promise<ReplayResult>;
}

export interface IntegrityResult {
  isValid: boolean;
  transactionId: string;
  issues: IntegrityIssue[];
  verificationTimestamp: Date;
}

export interface IntegrityIssue {
  type: IntegrityIssueType;
  severity: IssueSeverity;
  description: string;
  recommendation: string;
}

export enum IntegrityIssueType {
  HASH_MISMATCH = 'hash_mismatch',
  SIGNATURE_INVALID = 'signature_invalid',
  CHAIN_BROKEN = 'chain_broken',
  DATA_CORRUPTION = 'data_corruption',
  TIMESTAMP_INVALID = 'timestamp_invalid'
}

export enum IssueSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface RepairResult {
  success: boolean;
  userId: string;
  transactionsRepaired: number;
  newHashChain: string[];
  repairTimestamp: Date;
  backupCreated: boolean;
}

export interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  type: ComplianceRuleType;
  parameters: Record<string, any>;
  severity: ComplianceSeverity;
}

export enum ComplianceRuleType {
  HASH_INTEGRITY = 'hash_integrity',
  SIGNATURE_VALIDATION = 'signature_validation',
  CHAIN_CONTINUITY = 'chain_continuity',
  TIMESTAMP_VALIDATION = 'timestamp_validation',
  DATA_RETENTION = 'data_retention'
}

export enum ComplianceSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface ComplianceResult {
  overall: ComplianceLevel;
  userId: string;
  checkedAt: Date;
  ruleResults: ComplianceRuleResult[];
  recommendations: ComplianceRecommendation[];
}

export interface ComplianceRuleResult {
  ruleId: string;
  status: ComplianceStatus;
  score: number;
  issues: ComplianceIssue[];
  evidence: any[];
}

export interface ComplianceIssue {
  type: string;
  severity: ComplianceSeverity;
  description: string;
  affectedTransactions: string[];
  remediation: string;
}

export interface ComplianceRecommendation {
  priority: RecommendationPriority;
  category: RecommendationCategory;
  title: string;
  description: string;
  actionRequired: boolean;
  estimatedEffort: string;
}

export interface TransactionEvent {
  id: string;
  userId: string;
  transactionId: string;
  eventType: TransactionEventType;
  timestamp: Date;
  data: any;
  metadata: Record<string, any>;
}

export enum TransactionEventType {
  CREATED = 'created',
  VALIDATED = 'validated',
  RECORDED = 'recorded',
  VERIFIED = 'verified',
  FLAGGED = 'flagged',
  REPAIRED = 'repaired'
}

export interface ReplayResult {
  success: boolean;
  userId: string;
  eventsReplayed: number;
  finalState: any;
  replayTimestamp: Date;
  inconsistenciesFound: number;
}

/**
 * Cryptographic utilities implementation
 */
export class CryptoUtils implements ICryptoUtils {
  private readonly algorithm = 'sha256';
  private readonly signatureAlgorithm = 'sha256';

  generateTransactionHash(transaction: CreditTransaction, previousHash: string): string {
    const data = {
      id: transaction.id,
      userId: transaction.userId,
      type: transaction.type,
      amount: transaction.amount,
      timestamp: transaction.timestamp.toISOString(),
      previousHash
    };

    const dataString = JSON.stringify(data, Object.keys(data).sort());
    return createHash(this.algorithm).update(dataString).digest('hex');
  }

  async signTransaction(transaction: CreditTransaction, signingKey: string): Promise<string> {
    const data = {
      id: transaction.id,
      userId: transaction.userId,
      type: transaction.type,
      amount: transaction.amount,
      timestamp: transaction.timestamp.toISOString()
    };

    const dataString = JSON.stringify(data, Object.keys(data).sort());
    return createHmac(this.signatureAlgorithm, signingKey).update(dataString).digest('hex');
  }

  async verifyTransactionSignature(
    transaction: CreditTransaction, 
    signature: string, 
    publicKey: string
  ): Promise<boolean> {
    try {
      const expectedSignature = await this.signTransaction(transaction, publicKey);
      return signature === expectedSignature;
    } catch (error) {
      logger.error('Failed to verify transaction signature', {
        transactionId: transaction.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async generateKeyPair(): Promise<{ privateKey: string; publicKey: string }> {
    // In production, use proper cryptographic key generation
    const privateKey = randomBytes(32).toString('hex');
    const publicKey = createHash('sha256').update(privateKey).digest('hex');
    
    return { privateKey, publicKey };
  }
}

/**
 * Integrity monitor implementation
 */
export class IntegrityMonitor implements IIntegrityMonitor {
  private activeSessions = new Map<string, MonitoringSession>();
  private firestore: any;

  constructor(firestore?: any) {
    this.firestore = firestore !== undefined ? firestore : getFirestore();
  }

  async startMonitoring(userId: string): Promise<MonitoringSession> {
    const sessionId = uuidv4();
    const session: MonitoringSession = {
      id: sessionId,
      userId,
      startedAt: new Date(),
      lastCheck: new Date(),
      checksPerformed: 0,
      issuesFound: 0,
      status: MonitoringStatus.ACTIVE
    };

    this.activeSessions.set(userId, session);

    // Store session in Firestore
    await this.firestore.collection('integrity_monitoring').doc(sessionId).set(session);

    logger.info('Integrity monitoring started', { userId, sessionId });
    return session;
  }

  async stopMonitoring(sessionId: string): Promise<void> {
    const session = Array.from(this.activeSessions.values()).find(s => s.id === sessionId);
    if (session) {
      session.status = MonitoringStatus.STOPPED;
      this.activeSessions.delete(session.userId);

      // Update session in Firestore
      await this.firestore.collection('integrity_monitoring').doc(sessionId).update({
        status: MonitoringStatus.STOPPED,
        stoppedAt: new Date()
      });

      logger.info('Integrity monitoring stopped', { sessionId, userId: session.userId });
    }
  }

  async getMonitoringStatus(userId: string): Promise<MonitoringStatus> {
    const session = this.activeSessions.get(userId);
    return session?.status || MonitoringStatus.STOPPED;
  }
}

/**
 * Blockchain-style ledger service implementation
 */
export class LedgerService implements ILedgerService {
  private firestore: any;
  private cryptoUtils: ICryptoUtils;
  private integrityMonitor: IIntegrityMonitor;
  private metrics: IMetricsCollector;
  private signingKey: string;

  constructor(
    metrics: IMetricsCollector,
    cryptoUtils?: ICryptoUtils,
    integrityMonitor?: IIntegrityMonitor,
    firestore?: any
  ) {
    this.firestore = firestore !== undefined ? firestore : getFirestore();
    this.metrics = metrics;
    this.cryptoUtils = cryptoUtils || new CryptoUtils();
    this.integrityMonitor = integrityMonitor || new IntegrityMonitor(this.firestore);
    
    // In production, this would be securely managed
    this.signingKey = process.env.LEDGER_SIGNING_KEY || 'default-signing-key';
  }

  /**
   * Record transaction in blockchain-style ledger
   */
  async recordTransaction(transaction: CreditTransaction): Promise<LedgerEntry> {
    const correlationId = uuidv4();
    
    try {
      // Get previous transaction hash
      const previousEntry = await this.getLastLedgerEntry(transaction.userId);
      const previousHash = previousEntry?.transactionHash || '0';

      // Generate cryptographic hash
      const transactionHash = this.cryptoUtils.generateTransactionHash(
        transaction,
        previousHash
      );

      // Create digital signature
      const signature = await this.cryptoUtils.signTransaction(
        transaction,
        this.signingKey
      );

      // Create ledger entry
      const ledgerEntry: LedgerEntry = {
        id: uuidv4(),
        userId: transaction.userId,
        transactionId: transaction.id,
        transactionHash,
        previousHash,
        signature,
        timestamp: new Date(),
        blockIndex: (previousEntry?.blockIndex || 0) + 1,
        correlationId,
        isValid: true,
        chainValidated: false,
        metadata: {
          transactionType: transaction.type,
          amount: transaction.amount,
          source: transaction.source
        }
      };

      // Validate chain integrity before writing
      const chainValid = await this.validateHashChain(transaction.userId);
      if (!chainValid.isValid && previousEntry) {
        throw new Error(`Hash chain broken for user ${transaction.userId} at block ${chainValid.brokenAt}`);
      }

      // Store ledger entry atomically
      await this.firestore.runTransaction(async (firestoreTransaction) => {
        const ledgerRef = this.firestore.collection('blockchain_ledger').doc(ledgerEntry.id);
        const userLedgerRef = this.firestore.collection('user_ledgers').doc(transaction.userId);

        // Write ledger entry
        firestoreTransaction.set(ledgerRef, ledgerEntry);

        // Update user's latest entry reference
        firestoreTransaction.set(userLedgerRef, {
          userId: transaction.userId,
          latestEntryId: ledgerEntry.id,
          latestBlockIndex: ledgerEntry.blockIndex,
          latestTransactionHash: ledgerEntry.transactionHash,
          lastUpdated: new Date(),
          totalEntries: (previousEntry?.blockIndex || 0) + 1
        }, { merge: true });
      });

      // Record transaction event
      await this.recordTransactionEvent(transaction.userId, transaction.id, TransactionEventType.RECORDED, {
        ledgerEntryId: ledgerEntry.id,
        blockIndex: ledgerEntry.blockIndex,
        transactionHash: ledgerEntry.transactionHash
      });

      // Update metrics
      this.metrics.increment('ledger.transactions.recorded', 1, {
        user_id: transaction.userId,
        transaction_type: transaction.type
      });

      this.metrics.histogram('ledger.block_index', ledgerEntry.blockIndex, {
        user_id: transaction.userId
      });

      logger.info('Transaction recorded in ledger', {
        userId: transaction.userId,
        transactionId: transaction.id,
        ledgerEntryId: ledgerEntry.id,
        blockIndex: ledgerEntry.blockIndex,
        transactionHash: ledgerEntry.transactionHash,
        correlationId
      });

      return ledgerEntry;

    } catch (error) {
      logger.error('Failed to record transaction in ledger', {
        userId: transaction.userId,
        transactionId: transaction.id,
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      this.metrics.increment('ledger.transactions.errors', 1, {
        user_id: transaction.userId,
        error_type: this.categorizeError(error)
      });

      throw error;
    }
  }

  /**
   * Record batch of transactions
   */
  async recordBatch(transactions: CreditTransaction[]): Promise<LedgerEntry[]> {
    const results: LedgerEntry[] = [];
    
    for (const transaction of transactions) {
      try {
        const entry = await this.recordTransaction(transaction);
        results.push(entry);
      } catch (error) {
        logger.error('Failed to record transaction in batch', {
          transactionId: transaction.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Continue with other transactions
      }
    }

    return results;
  }

  /**
   * Validate hash chain integrity
   */
  async validateHashChain(userId: string): Promise<ChainValidationResult> {
    try {
      // Get all ledger entries for user
      const entriesQuery = await this.firestore
        .collection('blockchain_ledger')
        .where('userId', '==', userId)
        .orderBy('blockIndex', 'asc')
        .get();

      const entries = entriesQuery.docs.map(doc => doc.data() as LedgerEntry);
      const errors: ChainValidationError[] = [];
      let validatedTransactions = 0;

      if (entries.length === 0) {
        return {
          isValid: true,
          userId,
          totalTransactions: 0,
          validatedTransactions: 0,
          errors: []
        };
      }

      // Validate each entry in the chain
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const previousEntry = i > 0 ? entries[i - 1] : null;
        const expectedPreviousHash = previousEntry?.transactionHash || '0';

        // Check previous hash reference
        if (entry.previousHash !== expectedPreviousHash) {
          errors.push({
            blockIndex: entry.blockIndex,
            transactionId: entry.transactionId,
            errorType: ChainErrorType.HASH_MISMATCH,
            message: `Previous hash mismatch at block ${entry.blockIndex}`,
            expectedHash: expectedPreviousHash,
            actualHash: entry.previousHash
          });
        }

        // Validate block index sequence
        const expectedBlockIndex = (previousEntry?.blockIndex || 0) + 1;
        if (entry.blockIndex !== expectedBlockIndex) {
          errors.push({
            blockIndex: entry.blockIndex,
            transactionId: entry.transactionId,
            errorType: ChainErrorType.BROKEN_CHAIN,
            message: `Block index sequence broken at block ${entry.blockIndex}`
          });
        }

        // Validate transaction hash
        const transaction = await this.getTransactionById(entry.transactionId);
        if (transaction) {
          const expectedHash = this.cryptoUtils.generateTransactionHash(transaction, entry.previousHash);
          if (entry.transactionHash !== expectedHash) {
            errors.push({
              blockIndex: entry.blockIndex,
              transactionId: entry.transactionId,
              errorType: ChainErrorType.HASH_MISMATCH,
              message: `Transaction hash mismatch at block ${entry.blockIndex}`,
              expectedHash,
              actualHash: entry.transactionHash
            });
          } else {
            validatedTransactions++;
          }
        } else {
          errors.push({
            blockIndex: entry.blockIndex,
            transactionId: entry.transactionId,
            errorType: ChainErrorType.MISSING_TRANSACTION,
            message: `Referenced transaction not found for block ${entry.blockIndex}`
          });
        }
      }

      const result: ChainValidationResult = {
        isValid: errors.length === 0,
        userId,
        totalTransactions: entries.length,
        validatedTransactions,
        errors
      };

      if (errors.length > 0) {
        result.brokenAt = errors[0].blockIndex;
        result.lastValidHash = entries[Math.max(0, errors[0].blockIndex - 1)]?.transactionHash;
      }

      // Update metrics
      this.metrics.increment('ledger.chain_validations', 1, {
        user_id: userId,
        is_valid: result.isValid.toString(),
        error_count: errors.length.toString()
      });

      logger.info('Hash chain validation completed', {
        userId,
        isValid: result.isValid,
        totalTransactions: result.totalTransactions,
        validatedTransactions: result.validatedTransactions,
        errorCount: errors.length
      });

      return result;

    } catch (error) {
      logger.error('Failed to validate hash chain', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        isValid: false,
        userId,
        totalTransactions: 0,
        validatedTransactions: 0,
        errors: [{
          blockIndex: 0,
          transactionId: '',
          errorType: ChainErrorType.CORRUPTED_DATA,
          message: 'Chain validation failed due to system error'
        }]
      };
    }
  }

  /**
   * Validate individual transaction integrity
   */
  async validateTransactionIntegrity(transactionId: string): Promise<IntegrityResult> {
    try {
      // Get ledger entry
      const ledgerQuery = await this.firestore
        .collection('blockchain_ledger')
        .where('transactionId', '==', transactionId)
        .get();

      if (ledgerQuery.empty) {
        return {
          isValid: false,
          transactionId,
          issues: [{
            type: IntegrityIssueType.DATA_CORRUPTION,
            severity: IssueSeverity.HIGH,
            description: 'Ledger entry not found for transaction',
            recommendation: 'Investigate missing ledger entry and restore from backup'
          }],
          verificationTimestamp: new Date()
        };
      }

      const ledgerEntry = ledgerQuery.docs[0].data() as LedgerEntry;
      const issues: IntegrityIssue[] = [];

      // Get original transaction
      const transaction = await this.getTransactionById(transactionId);
      if (!transaction) {
        issues.push({
          type: IntegrityIssueType.DATA_CORRUPTION,
          severity: IssueSeverity.CRITICAL,
          description: 'Original transaction data not found',
          recommendation: 'Restore transaction data from backup or mark as corrupted'
        });
      } else {
        // Validate hash
        const expectedHash = this.cryptoUtils.generateTransactionHash(transaction, ledgerEntry.previousHash);
        if (ledgerEntry.transactionHash !== expectedHash) {
          issues.push({
            type: IntegrityIssueType.HASH_MISMATCH,
            severity: IssueSeverity.HIGH,
            description: 'Transaction hash does not match calculated hash',
            recommendation: 'Recalculate hash and update ledger entry'
          });
        }

        // Validate signature
        const signatureValid = await this.cryptoUtils.verifyTransactionSignature(
          transaction,
          ledgerEntry.signature,
          this.signingKey
        );
        if (!signatureValid) {
          issues.push({
            type: IntegrityIssueType.SIGNATURE_INVALID,
            severity: IssueSeverity.HIGH,
            description: 'Transaction signature is invalid',
            recommendation: 'Re-sign transaction with valid key'
          });
        }

        // Validate timestamp
        const timeDiff = Math.abs(transaction.timestamp.getTime() - ledgerEntry.timestamp.getTime());
        if (timeDiff > 60000) { // More than 1 minute difference
          issues.push({
            type: IntegrityIssueType.TIMESTAMP_INVALID,
            severity: IssueSeverity.MEDIUM,
            description: 'Timestamp mismatch between transaction and ledger entry',
            recommendation: 'Synchronize timestamps or investigate timing issues'
          });
        }
      }

      return {
        isValid: issues.length === 0,
        transactionId,
        issues,
        verificationTimestamp: new Date()
      };

    } catch (error) {
      logger.error('Failed to validate transaction integrity', {
        transactionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        isValid: false,
        transactionId,
        issues: [{
          type: IntegrityIssueType.DATA_CORRUPTION,
          severity: IssueSeverity.CRITICAL,
          description: 'System error during integrity validation',
          recommendation: 'Retry validation or investigate system issues'
        }],
        verificationTimestamp: new Date()
      };
    }
  }

  /**
   * Start integrity monitoring
   */
  async startIntegrityMonitoring(userId: string): Promise<MonitoringSession> {
    return await this.integrityMonitor.startMonitoring(userId);
  }

  /**
   * Repair hash chain
   */
  async repairHashChain(userId: string, fromTransaction?: string): Promise<RepairResult> {
    try {
      // Create backup before repair
      const backupId = await this.createChainBackup(userId);

      // Get all entries from the point of repair
      let entriesQuery = this.firestore
        .collection('blockchain_ledger')
        .where('userId', '==', userId)
        .orderBy('blockIndex', 'asc');

      if (fromTransaction) {
        const fromEntry = await this.getLedgerEntryByTransactionId(fromTransaction);
        if (fromEntry) {
          entriesQuery = entriesQuery.where('blockIndex', '>=', fromEntry.blockIndex);
        }
      }

      const entriesSnapshot = await entriesQuery.get();
      const entries = entriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as (LedgerEntry & { id: string })[];

      let repairedCount = 0;
      const newHashChain: string[] = [];

      // Repair each entry
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const previousEntry = i > 0 ? entries[i - 1] : null;
        const expectedPreviousHash = previousEntry?.transactionHash || '0';

        // Get original transaction
        const transaction = await this.getTransactionById(entry.transactionId);
        if (!transaction) {
          logger.error('Cannot repair entry without original transaction', {
            userId,
            transactionId: entry.transactionId,
            blockIndex: entry.blockIndex
          });
          continue;
        }

        // Recalculate hash
        const newHash = this.cryptoUtils.generateTransactionHash(transaction, expectedPreviousHash);
        const newSignature = await this.cryptoUtils.signTransaction(transaction, this.signingKey);

        // Update entry if needed
        if (entry.transactionHash !== newHash || entry.previousHash !== expectedPreviousHash || entry.signature !== newSignature) {
          await this.firestore.collection('blockchain_ledger').doc(entry.id).update({
            transactionHash: newHash,
            previousHash: expectedPreviousHash,
            signature: newSignature,
            isValid: true,
            chainValidated: true,
            lastValidationTimestamp: new Date()
          });

          repairedCount++;
        }

        newHashChain.push(newHash);
      }

      const result: RepairResult = {
        success: true,
        userId,
        transactionsRepaired: repairedCount,
        newHashChain,
        repairTimestamp: new Date(),
        backupCreated: !!backupId
      };

      logger.info('Hash chain repair completed', {
        userId,
        transactionsRepaired: repairedCount,
        backupId
      });

      return result;

    } catch (error) {
      logger.error('Failed to repair hash chain', {
        userId,
        fromTransaction,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        userId,
        transactionsRepaired: 0,
        newHashChain: [],
        repairTimestamp: new Date(),
        backupCreated: false
      };
    }
  }

  /**
   * Generate audit report
   */
  async generateAuditReport(userId: string, timeRange: TimeRange): Promise<AuditReport> {
    try {
      const reportId = uuidv4();
      
      // Get transactions in time range
      const transactionsQuery = await this.firestore
        .collection('credit_transactions')
        .where('userId', '==', userId)
        .where('timestamp', '>=', timeRange.startDate)
        .where('timestamp', '<=', timeRange.endDate)
        .get();

      const transactions = transactionsQuery.docs.map(doc => doc.data() as CreditTransaction);
      
      // Get corresponding ledger entries
      const auditTransactions: AuditTransaction[] = [];
      let integrityScore = 0;
      let validTransactions = 0;

      for (const transaction of transactions) {
        const integrity = await this.validateTransactionIntegrity(transaction.id);
        const verificationStatus = integrity.isValid ? VerificationStatus.VERIFIED : VerificationStatus.FAILED;
        
        if (integrity.isValid) {
          validTransactions++;
        }

        auditTransactions.push({
          transactionId: transaction.id,
          timestamp: transaction.timestamp,
          type: transaction.type,
          amount: transaction.amount,
          status: transaction.status,
          verificationStatus,
          flags: integrity.issues.map(issue => ({
            type: 'integrity_issue' as any,
            severity: issue.severity as any,
            message: issue.description,
            autoGenerated: true,
            flaggedAt: new Date()
          }))
        });
      }

      integrityScore = transactions.length > 0 ? (validTransactions / transactions.length) * 100 : 100;

      // Detect anomalies
      const anomalies = await this.detectAnomalies(userId, transactions);

      // Generate recommendations
      const recommendations = await this.generateRecommendations(userId, auditTransactions, anomalies);

      // Check compliance
      const complianceChecks = await this.performComplianceChecks(userId, transactions);
      const complianceStatus = this.determineComplianceStatus(complianceChecks);

      const report: AuditReport = {
        userId,
        reportId,
        timeRange,
        generatedAt: new Date(),
        generatedBy: 'system',
        totalTransactions: transactions.length,
        totalCreditsProcessed: transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0),
        integrityScore,
        transactions: auditTransactions,
        anomalies,
        recommendations,
        complianceStatus,
        complianceChecks
      };

      // Store report
      await this.firestore.collection('audit_reports').doc(reportId).set(report);

      logger.info('Audit report generated', {
        userId,
        reportId,
        totalTransactions: transactions.length,
        integrityScore,
        anomaliesFound: anomalies.length
      });

      return report;

    } catch (error) {
      logger.error('Failed to generate audit report', {
        userId,
        timeRange,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Verify compliance
   */
  async verifyCompliance(userId: string, complianceRules: ComplianceRule[]): Promise<ComplianceResult> {
    try {
      const ruleResults: ComplianceRuleResult[] = [];
      const recommendations: ComplianceRecommendation[] = [];

      for (const rule of complianceRules) {
        const result = await this.checkComplianceRule(userId, rule);
        ruleResults.push(result);

        if (result.status !== ComplianceStatus.COMPLIANT) {
          recommendations.push({
            priority: this.mapSeverityToPriority(rule.severity),
            category: RecommendationCategory.COMPLIANCE,
            title: `Address ${rule.name} compliance issue`,
            description: `Rule "${rule.name}" failed compliance check`,
            actionRequired: rule.severity === ComplianceSeverity.CRITICAL,
            estimatedEffort: this.estimateEffort(rule.type)
          });
        }
      }

      const overallScore = ruleResults.reduce((sum, r) => sum + r.score, 0) / ruleResults.length;
      const overall = this.scoreToComplianceLevel(overallScore);

      return {
        overall,
        userId,
        checkedAt: new Date(),
        ruleResults,
        recommendations
      };

    } catch (error) {
      logger.error('Failed to verify compliance', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get transaction events
   */
  async getTransactionEvents(userId: string): Promise<TransactionEvent[]> {
    try {
      const eventsQuery = await this.firestore
        .collection('transaction_events')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .get();

      return eventsQuery.docs.map(doc => doc.data() as TransactionEvent);

    } catch (error) {
      logger.error('Failed to get transaction events', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  /**
   * Replay transaction history
   */
  async replayTransactionHistory(userId: string): Promise<ReplayResult> {
    try {
      const events = await this.getTransactionEvents(userId);
      let eventsReplayed = 0;
      let inconsistenciesFound = 0;
      const finalState: any = {};

      // Process events in chronological order
      const sortedEvents = events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      for (const event of sortedEvents) {
        try {
          // Process event based on type
          await this.processTransactionEvent(event);
          eventsReplayed++;
        } catch (error) {
          inconsistenciesFound++;
          logger.warn('Inconsistency found during replay', {
            userId,
            eventId: event.id,
            eventType: event.eventType,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return {
        success: true,
        userId,
        eventsReplayed,
        finalState,
        replayTimestamp: new Date(),
        inconsistenciesFound
      };

    } catch (error) {
      logger.error('Failed to replay transaction history', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        userId,
        eventsReplayed: 0,
        finalState: {},
        replayTimestamp: new Date(),
        inconsistenciesFound: 0
      };
    }
  }

  // Private helper methods

  private async getLastLedgerEntry(userId: string): Promise<LedgerEntry | null> {
    try {
      const query = await this.firestore
        .collection('blockchain_ledger')
        .where('userId', '==', userId)
        .orderBy('blockIndex', 'desc')
        .limit(1)
        .get();

      return query.empty ? null : query.docs[0].data() as LedgerEntry;
    } catch (error) {
      logger.error('Failed to get last ledger entry', { userId, error });
      return null;
    }
  }

  private async getTransactionById(transactionId: string): Promise<CreditTransaction | null> {
    try {
      const doc = await this.firestore.collection('credit_transactions').doc(transactionId).get();
      return doc.exists ? doc.data() as CreditTransaction : null;
    } catch (error) {
      logger.error('Failed to get transaction by ID', { transactionId, error });
      return null;
    }
  }

  private async getLedgerEntryByTransactionId(transactionId: string): Promise<LedgerEntry | null> {
    try {
      const query = await this.firestore
        .collection('blockchain_ledger')
        .where('transactionId', '==', transactionId)
        .limit(1)
        .get();

      return query.empty ? null : query.docs[0].data() as LedgerEntry;
    } catch (error) {
      logger.error('Failed to get ledger entry by transaction ID', { transactionId, error });
      return null;
    }
  }

  private async recordTransactionEvent(
    userId: string,
    transactionId: string,
    eventType: TransactionEventType,
    data: any
  ): Promise<void> {
    try {
      const event: TransactionEvent = {
        id: uuidv4(),
        userId,
        transactionId,
        eventType,
        timestamp: new Date(),
        data,
        metadata: {}
      };

      await this.firestore.collection('transaction_events').doc(event.id).set(event);
    } catch (error) {
      logger.error('Failed to record transaction event', {
        userId,
        transactionId,
        eventType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw - this is not critical
    }
  }

  private async createChainBackup(userId: string): Promise<string | null> {
    try {
      const backupId = uuidv4();
      const timestamp = new Date();

      // Get all ledger entries
      const entriesQuery = await this.firestore
        .collection('blockchain_ledger')
        .where('userId', '==', userId)
        .orderBy('blockIndex', 'asc')
        .get();

      const entries = entriesQuery.docs.map(doc => doc.data());

      // Store backup
      await this.firestore.collection('chain_backups').doc(backupId).set({
        id: backupId,
        userId,
        entries,
        createdAt: timestamp,
        entryCount: entries.length
      });

      return backupId;
    } catch (error) {
      logger.error('Failed to create chain backup', { userId, error });
      return null;
    }
  }

  private async detectAnomalies(userId: string, transactions: CreditTransaction[]): Promise<AuditAnomaly[]> {
    const anomalies: AuditAnomaly[] = [];

    // Detect unusual amounts
    const amounts = transactions.map(t => Math.abs(t.amount));
    const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const threshold = avgAmount * 3; // 3x average

    transactions.forEach(transaction => {
      if (Math.abs(transaction.amount) > threshold) {
        anomalies.push({
          id: uuidv4(),
          type: AnomalyType.UNUSUAL_AMOUNT,
          severity: AnomalySeverity.MEDIUM,
          description: `Transaction amount ${transaction.amount} is unusually high (threshold: ${threshold})`,
          transactionIds: [transaction.id],
          detectedAt: new Date(),
          resolved: false
        });
      }
    });

    // Detect frequency spikes
    const transactionsByHour = new Map<string, number>();
    transactions.forEach(t => {
      const hour = t.timestamp.toISOString().substring(0, 13);
      transactionsByHour.set(hour, (transactionsByHour.get(hour) || 0) + 1);
    });

    const avgPerHour = Array.from(transactionsByHour.values()).reduce((sum, count) => sum + count, 0) / transactionsByHour.size;
    const spikeThreshold = avgPerHour * 5; // 5x average

    transactionsByHour.forEach((count, hour) => {
      if (count > spikeThreshold) {
        const hourTransactions = transactions.filter(t => t.timestamp.toISOString().startsWith(hour));
        anomalies.push({
          id: uuidv4(),
          type: AnomalyType.FREQUENCY_SPIKE,
          severity: AnomalySeverity.HIGH,
          description: `Unusual transaction frequency: ${count} transactions in hour ${hour} (threshold: ${spikeThreshold})`,
          transactionIds: hourTransactions.map(t => t.id),
          detectedAt: new Date(),
          resolved: false
        });
      }
    });

    return anomalies;
  }

  private async generateRecommendations(
    userId: string,
    transactions: AuditTransaction[],
    anomalies: AuditAnomaly[]
  ): Promise<AuditRecommendation[]> {
    const recommendations: AuditRecommendation[] = [];

    // Recommend based on failed verifications
    const failedVerifications = transactions.filter(t => t.verificationStatus === VerificationStatus.FAILED);
    if (failedVerifications.length > 0) {
      recommendations.push({
        id: uuidv4(),
        category: RecommendationCategory.SECURITY,
        priority: RecommendationPriority.HIGH,
        title: 'Address failed transaction verifications',
        description: `${failedVerifications.length} transactions failed integrity verification`,
        actionRequired: true,
        estimatedImpact: 'High - affects data integrity and compliance'
      });
    }

    // Recommend based on anomalies
    const highSeverityAnomalies = anomalies.filter(a => a.severity === AnomalySeverity.HIGH || a.severity === AnomalySeverity.CRITICAL);
    if (highSeverityAnomalies.length > 0) {
      recommendations.push({
        id: uuidv4(),
        category: RecommendationCategory.SECURITY,
        priority: RecommendationPriority.URGENT,
        title: 'Investigate high-severity anomalies',
        description: `${highSeverityAnomalies.length} high-severity anomalies detected`,
        actionRequired: true,
        estimatedImpact: 'Critical - potential security or fraud issues'
      });
    }

    return recommendations;
  }

  private async performComplianceChecks(userId: string, transactions: CreditTransaction[]): Promise<ComplianceCheck[]> {
    const checks: ComplianceCheck[] = [];

    // Hash integrity check
    let hashIntegrityPassed = 0;
    for (const transaction of transactions) {
      const integrity = await this.validateTransactionIntegrity(transaction.id);
      if (integrity.isValid) {
        hashIntegrityPassed++;
      }
    }

    const hashIntegrityScore = transactions.length > 0 ? (hashIntegrityPassed / transactions.length) * 100 : 100;
    checks.push({
      checkId: 'hash_integrity',
      name: 'Hash Integrity Check',
      status: hashIntegrityScore >= 95 ? CheckStatus.PASSED : CheckStatus.FAILED,
      lastRun: new Date(),
      result: {
        passed: hashIntegrityScore >= 95,
        score: hashIntegrityScore,
        maxScore: 100,
        findings: [],
        recommendations: hashIntegrityScore < 95 ? ['Investigate and repair hash chain integrity issues'] : []
      }
    });

    // Chain continuity check
    const chainValidation = await this.validateHashChain(userId);
    checks.push({
      checkId: 'chain_continuity',
      name: 'Chain Continuity Check',
      status: chainValidation.isValid ? CheckStatus.PASSED : CheckStatus.FAILED,
      lastRun: new Date(),
      result: {
        passed: chainValidation.isValid,
        findings: chainValidation.errors.map(error => ({
          type: 'chain_error' as any,
          severity: 'high' as any,
          message: error.message,
          evidence: error,
          remediation: 'Repair hash chain from the point of failure'
        })),
        recommendations: chainValidation.isValid ? [] : ['Repair hash chain integrity']
      }
    });

    return checks;
  }

  private determineComplianceStatus(checks: ComplianceCheck[]): ComplianceStatus {
    const failedChecks = checks.filter(c => c.status === CheckStatus.FAILED);
    
    if (failedChecks.length === 0) {
      return {
        overall: ComplianceLevel.COMPLIANT,
        lastAssessment: new Date(),
        nextAssessment: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        certifications: []
      };
    } else if (failedChecks.length <= checks.length * 0.2) {
      return {
        overall: ComplianceLevel.MINOR_ISSUES,
        lastAssessment: new Date(),
        nextAssessment: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        certifications: []
      };
    } else {
      return {
        overall: ComplianceLevel.MAJOR_ISSUES,
        lastAssessment: new Date(),
        nextAssessment: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day
        certifications: []
      };
    }
  }

  private async checkComplianceRule(userId: string, rule: ComplianceRule): Promise<ComplianceRuleResult> {
    // Simplified compliance rule checking
    return {
      ruleId: rule.id,
      status: ComplianceStatus.COMPLIANT,
      score: 100,
      issues: [],
      evidence: []
    };
  }

  private mapSeverityToPriority(severity: ComplianceSeverity): RecommendationPriority {
    switch (severity) {
      case ComplianceSeverity.CRITICAL: return RecommendationPriority.URGENT;
      case ComplianceSeverity.ERROR: return RecommendationPriority.HIGH;
      case ComplianceSeverity.WARNING: return RecommendationPriority.MEDIUM;
      default: return RecommendationPriority.LOW;
    }
  }

  private estimateEffort(ruleType: ComplianceRuleType): string {
    switch (ruleType) {
      case ComplianceRuleType.HASH_INTEGRITY: return '2-4 hours';
      case ComplianceRuleType.SIGNATURE_VALIDATION: return '1-2 hours';
      case ComplianceRuleType.CHAIN_CONTINUITY: return '4-8 hours';
      default: return '1-3 hours';
    }
  }

  private scoreToComplianceLevel(score: number): ComplianceLevel {
    if (score >= 95) return ComplianceLevel.COMPLIANT;
    if (score >= 80) return ComplianceLevel.MINOR_ISSUES;
    if (score >= 60) return ComplianceLevel.MAJOR_ISSUES;
    return ComplianceLevel.NON_COMPLIANT;
  }

  private async processTransactionEvent(event: TransactionEvent): Promise<void> {
    // Process event based on type
    switch (event.eventType) {
      case TransactionEventType.CREATED:
        // Handle transaction creation event
        break;
      case TransactionEventType.RECORDED:
        // Handle transaction recording event
        break;
      // Add other event types as needed
    }
  }

  private categorizeError(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('hash')) return 'hash_error';
      if (error.message.includes('signature')) return 'signature_error';
      if (error.message.includes('chain')) return 'chain_error';
      if (error.message.includes('validation')) return 'validation_error';
    }
    return 'unknown_error';
  }
}