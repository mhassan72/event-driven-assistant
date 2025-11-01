/**
 * Data Consistency Validation and Repair Systems
 * Ensures data integrity across distributed systems with automatic repair mechanisms
 */

import { Database } from 'firebase-admin/database';
import { Firestore } from 'firebase-admin/firestore';
import { IStructuredLogger } from '../observability/logger';
import { IMetricsCollector } from '../observability/metrics';

/**
 * Consistency check types
 */
export enum ConsistencyCheckType {
  REFERENTIAL_INTEGRITY = 'referential_integrity',
  DATA_SYNCHRONIZATION = 'data_synchronization',
  CHECKSUM_VALIDATION = 'checksum_validation',
  SCHEMA_VALIDATION = 'schema_validation',
  BUSINESS_RULE_VALIDATION = 'business_rule_validation',
  CROSS_SERVICE_CONSISTENCY = 'cross_service_consistency'
}

/**
 * Consistency violation severity
 */
export enum ConsistencyViolationSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Repair strategy
 */
export enum RepairStrategy {
  AUTOMATIC = 'automatic',
  SEMI_AUTOMATIC = 'semi_automatic',
  MANUAL = 'manual',
  NO_REPAIR = 'no_repair'
}

/**
 * Consistency rule definition
 */
export interface ConsistencyRule {
  id: string;
  name: string;
  description: string;
  type: ConsistencyCheckType;
  severity: ConsistencyViolationSeverity;
  
  // Rule configuration
  collections: string[];
  fields: string[];
  conditions: Record<string, any>;
  
  // Validation logic
  validationFunction: string; // Function name or code
  repairFunction?: string;    // Repair function name or code
  
  // Execution settings
  enabled: boolean;
  schedule: string;           // Cron expression
  timeout: number;
  
  // Repair settings
  repairStrategy: RepairStrategy;
  autoRepairEnabled: boolean;
  maxRepairAttempts: number;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  tags: string[];
}

/**
 * Consistency violation
 */
export interface ConsistencyViolation {
  id: string;
  ruleId: string;
  ruleName: string;
  type: ConsistencyCheckType;
  severity: ConsistencyViolationSeverity;
  
  // Violation details
  description: string;
  affectedDocuments: string[];
  affectedCollections: string[];
  violationData: Record<string, any>;
  
  // Detection information
  detectedAt: Date;
  detectedBy: string;
  checkId: string;
  
  // Resolution information
  status: ViolationStatus;
  repairAttempts: RepairAttempt[];
  resolvedAt?: Date;
  resolvedBy?: string;
  
  // Metadata
  metadata: Record<string, any>;
}

/**
 * Violation status
 */
export enum ViolationStatus {
  DETECTED = 'detected',
  REPAIRING = 'repairing',
  REPAIRED = 'repaired',
  REPAIR_FAILED = 'repair_failed',
  MANUAL_REVIEW = 'manual_review',
  IGNORED = 'ignored'
}

/**
 * Repair attempt
 */
export interface RepairAttempt {
  id: string;
  violationId: string;
  strategy: RepairStrategy;
  startedAt: Date;
  completedAt?: Date;
  success: boolean;
  error?: string;
  changes: RepairChange[];
  metadata: Record<string, any>;
}

/**
 * Repair change
 */
export interface RepairChange {
  collection: string;
  documentId: string;
  operation: 'create' | 'update' | 'delete';
  beforeData?: any;
  afterData?: any;
  fieldChanges: FieldChange[];
}

/**
 * Field change
 */
export interface FieldChange {
  field: string;
  oldValue: any;
  newValue: any;
  changeType: 'added' | 'modified' | 'removed';
}

/**
 * Consistency check result
 */
export interface ConsistencyCheckResult {
  checkId: string;
  ruleId: string;
  ruleName: string;
  startedAt: Date;
  completedAt: Date;
  duration: number;
  
  // Results
  success: boolean;
  violationsFound: number;
  violations: ConsistencyViolation[];
  
  // Statistics
  documentsChecked: number;
  collectionsChecked: number;
  
  // Error information
  error?: string;
  
  // Metadata
  metadata: Record<string, any>;
}

/**
 * Data Consistency Manager
 */
export class DataConsistencyManager {
  private realtimeDB: Database;
  private firestore: Firestore;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  
  // Rule management
  private consistencyRules: Map<string, ConsistencyRule> = new Map();
  private scheduledChecks: Map<string, NodeJS.Timeout> = new Map();
  
  // Validation functions
  private validationFunctions: Map<string, Function> = new Map();
  private repairFunctions: Map<string, Function> = new Map();
  
  // State tracking
  private activeChecks: Map<string, ConsistencyCheckResult> = new Map();
  private recentViolations: ConsistencyViolation[] = [];
  
  constructor(dependencies: {
    realtimeDB: Database;
    firestore: Firestore;
    logger: IStructuredLogger;
    metrics: IMetricsCollector;
  }) {
    this.realtimeDB = dependencies.realtimeDB;
    this.firestore = dependencies.firestore;
    this.logger = dependencies.logger;
    this.metrics = dependencies.metrics;
    
    this.initializeConsistencyManager();
  }
  
  /**
   * Initialize consistency manager
   */
  private async initializeConsistencyManager(): Promise<void> {
    this.logger.info('Initializing Data Consistency Manager');
    
    // Load consistency rules
    await this.loadConsistencyRules();
    
    // Register built-in validation functions
    this.registerBuiltInValidationFunctions();
    
    // Start scheduled checks
    this.startScheduledChecks();
    
    // Setup periodic cleanup
    setInterval(() => {
      this.cleanupOldViolations();
    }, 60 * 60 * 1000); // Every hour
  }
  
  /**
   * Register consistency rule
   */
  async registerConsistencyRule(rule: Omit<ConsistencyRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const consistencyRule: ConsistencyRule = {
        id: ruleId,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...rule
      };
      
      // Store rule
      this.consistencyRules.set(ruleId, consistencyRule);
      
      // Persist to Firestore
      await this.firestore.collection('consistency_rules').doc(ruleId).set({
        ...consistencyRule,
        createdAt: consistencyRule.createdAt.toISOString(),
        updatedAt: consistencyRule.updatedAt.toISOString()
      });
      
      // Schedule checks if enabled
      if (consistencyRule.enabled && consistencyRule.schedule) {
        this.scheduleConsistencyCheck(ruleId);
      }
      
      this.logger.info('Consistency rule registered', {
        ruleId,
        ruleName: rule.name,
        type: rule.type,
        enabled: rule.enabled
      });
      
      this.metrics.counter('data_consistency.rules_registered', 1, {
        rule_type: rule.type,
        severity: rule.severity
      });
      
      return ruleId;
      
    } catch (error) {
      this.logger.error('Failed to register consistency rule', {
        ruleName: rule.name,
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Execute consistency check
   */
  async executeConsistencyCheck(ruleId: string): Promise<ConsistencyCheckResult> {
    const rule = this.consistencyRules.get(ruleId);
    if (!rule) {
      throw new Error(`Consistency rule not found: ${ruleId}`);
    }
    
    const checkId = `check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting consistency check', {
        checkId,
        ruleId,
        ruleName: rule.name,
        type: rule.type
      });
      
      const checkResult: ConsistencyCheckResult = {
        checkId,
        ruleId,
        ruleName: rule.name,
        startedAt: new Date(),
        completedAt: new Date(), // Will be updated
        duration: 0,
        success: false,
        violationsFound: 0,
        violations: [],
        documentsChecked: 0,
        collectionsChecked: rule.collections.length,
        metadata: {}
      };
      
      this.activeChecks.set(checkId, checkResult);
      
      // Execute validation function
      const validationFunction = this.validationFunctions.get(rule.validationFunction);
      if (!validationFunction) {
        throw new Error(`Validation function not found: ${rule.validationFunction}`);
      }
      
      // Run validation with timeout
      const violations = await this.executeWithTimeout(
        () => validationFunction(rule, this.firestore, this.realtimeDB),
        rule.timeout
      );
      
      // Process violations
      const processedViolations: ConsistencyViolation[] = [];
      
      for (const violationData of violations) {
        const violation = await this.createConsistencyViolation(
          rule,
          violationData,
          checkId
        );
        
        processedViolations.push(violation);
        this.recentViolations.push(violation);
        
        // Attempt automatic repair if enabled
        if (rule.autoRepairEnabled && rule.repairStrategy === RepairStrategy.AUTOMATIC) {
          await this.attemptAutomaticRepair(violation);
        }
      }
      
      // Update check result
      checkResult.completedAt = new Date();
      checkResult.duration = Date.now() - startTime;
      checkResult.success = true;
      checkResult.violationsFound = processedViolations.length;
      checkResult.violations = processedViolations;
      
      // Persist check result
      await this.firestore.collection('consistency_checks').doc(checkId).set({
        ...checkResult,
        startedAt: checkResult.startedAt.toISOString(),
        completedAt: checkResult.completedAt.toISOString(),
        violations: processedViolations.map(v => v.id)
      });
      
      this.logger.info('Consistency check completed', {
        checkId,
        ruleId,
        duration: checkResult.duration,
        violationsFound: checkResult.violationsFound
      });
      
      this.metrics.counter('data_consistency.checks_completed', 1, {
        rule_type: rule.type,
        rule_name: rule.name,
        violations_found: checkResult.violationsFound.toString()
      });
      
      this.metrics.histogram('data_consistency.check_duration', checkResult.duration, {
        rule_type: rule.type,
        success: 'true'
      });
      
      return checkResult;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Consistency check failed', {
        checkId,
        ruleId,
        error: error.message,
        duration
      });
      
      const failedResult: ConsistencyCheckResult = {
        checkId,
        ruleId,
        ruleName: rule.name,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        duration,
        success: false,
        violationsFound: 0,
        violations: [],
        documentsChecked: 0,
        collectionsChecked: 0,
        error: error.message,
        metadata: {}
      };
      
      this.metrics.counter('data_consistency.checks_failed', 1, {
        rule_type: rule.type,
        rule_name: rule.name
      });
      
      return failedResult;
      
    } finally {
      this.activeChecks.delete(checkId);
    }
  }
  
  /**
   * Create consistency violation
   */
  private async createConsistencyViolation(
    rule: ConsistencyRule,
    violationData: any,
    checkId: string
  ): Promise<ConsistencyViolation> {
    const violationId = `violation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const violation: ConsistencyViolation = {
      id: violationId,
      ruleId: rule.id,
      ruleName: rule.name,
      type: rule.type,
      severity: rule.severity,
      description: violationData.description || 'Consistency violation detected',
      affectedDocuments: violationData.affectedDocuments || [],
      affectedCollections: violationData.affectedCollections || [],
      violationData: violationData.data || {},
      detectedAt: new Date(),
      detectedBy: 'system',
      checkId,
      status: ViolationStatus.DETECTED,
      repairAttempts: [],
      metadata: violationData.metadata || {}
    };
    
    // Persist violation
    await this.firestore.collection('consistency_violations').doc(violationId).set({
      ...violation,
      detectedAt: violation.detectedAt.toISOString()
    });
    
    this.logger.warn('Consistency violation detected', {
      violationId,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      affectedDocuments: violation.affectedDocuments.length
    });
    
    this.metrics.counter('data_consistency.violations_detected', 1, {
      rule_type: rule.type,
      severity: rule.severity,
      rule_name: rule.name
    });
    
    return violation;
  }
  
  /**
   * Attempt automatic repair
   */
  async attemptAutomaticRepair(violation: ConsistencyViolation): Promise<boolean> {
    const rule = this.consistencyRules.get(violation.ruleId);
    if (!rule || !rule.repairFunction) {
      return false;
    }
    
    const attemptId = `repair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting automatic repair', {
        attemptId,
        violationId: violation.id,
        ruleId: violation.ruleId
      });
      
      // Update violation status
      violation.status = ViolationStatus.REPAIRING;
      await this.updateViolationStatus(violation.id, ViolationStatus.REPAIRING);
      
      // Get repair function
      const repairFunction = this.repairFunctions.get(rule.repairFunction);
      if (!repairFunction) {
        throw new Error(`Repair function not found: ${rule.repairFunction}`);
      }
      
      // Execute repair
      const repairChanges = await this.executeWithTimeout(
        () => repairFunction(violation, rule, this.firestore, this.realtimeDB),
        rule.timeout
      );
      
      // Create repair attempt record
      const repairAttempt: RepairAttempt = {
        id: attemptId,
        violationId: violation.id,
        strategy: RepairStrategy.AUTOMATIC,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        success: true,
        changes: repairChanges || [],
        metadata: {}
      };
      
      violation.repairAttempts.push(repairAttempt);
      violation.status = ViolationStatus.REPAIRED;
      violation.resolvedAt = new Date();
      violation.resolvedBy = 'system';
      
      // Update violation
      await this.updateViolation(violation);
      
      this.logger.info('Automatic repair completed successfully', {
        attemptId,
        violationId: violation.id,
        duration: Date.now() - startTime,
        changesApplied: repairChanges?.length || 0
      });
      
      this.metrics.counter('data_consistency.repairs_success', 1, {
        rule_type: rule.type,
        severity: violation.severity,
        strategy: RepairStrategy.AUTOMATIC
      });
      
      return true;
      
    } catch (error) {
      const repairAttempt: RepairAttempt = {
        id: attemptId,
        violationId: violation.id,
        strategy: RepairStrategy.AUTOMATIC,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        success: false,
        error: error.message,
        changes: [],
        metadata: {}
      };
      
      violation.repairAttempts.push(repairAttempt);
      violation.status = ViolationStatus.REPAIR_FAILED;
      
      await this.updateViolation(violation);
      
      this.logger.error('Automatic repair failed', {
        attemptId,
        violationId: violation.id,
        error: error.message,
        duration: Date.now() - startTime
      });
      
      this.metrics.counter('data_consistency.repairs_failed', 1, {
        rule_type: rule.type,
        severity: violation.severity,
        strategy: RepairStrategy.AUTOMATIC
      });
      
      return false;
    }
  }
  
  /**
   * Manual repair violation
   */
  async manualRepairViolation(
    violationId: string,
    repairData: any,
    repairedBy: string
  ): Promise<boolean> {
    try {
      const violation = await this.getViolation(violationId);
      if (!violation) {
        throw new Error(`Violation not found: ${violationId}`);
      }
      
      const attemptId = `manual_repair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      this.logger.info('Starting manual repair', {
        attemptId,
        violationId,
        repairedBy
      });
      
      // Create repair attempt record
      const repairAttempt: RepairAttempt = {
        id: attemptId,
        violationId,
        strategy: RepairStrategy.MANUAL,
        startedAt: new Date(),
        completedAt: new Date(),
        success: true,
        changes: repairData.changes || [],
        metadata: repairData.metadata || {}
      };
      
      violation.repairAttempts.push(repairAttempt);
      violation.status = ViolationStatus.REPAIRED;
      violation.resolvedAt = new Date();
      violation.resolvedBy = repairedBy;
      
      await this.updateViolation(violation);
      
      this.logger.info('Manual repair completed', {
        attemptId,
        violationId,
        repairedBy
      });
      
      this.metrics.counter('data_consistency.repairs_success', 1, {
        severity: violation.severity,
        strategy: RepairStrategy.MANUAL
      });
      
      return true;
      
    } catch (error) {
      this.logger.error('Manual repair failed', {
        violationId,
        repairedBy,
        error: error.message
      });
      
      return false;
    }
  }
  
  /**
   * Load consistency rules from Firestore
   */
  private async loadConsistencyRules(): Promise<void> {
    try {
      const snapshot = await this.firestore.collection('consistency_rules').get();
      
      snapshot.forEach(doc => {
        const data = doc.data();
        const rule: ConsistencyRule = {
          ...data,
          createdAt: new Date(data.createdAt),
          updatedAt: new Date(data.updatedAt)
        } as ConsistencyRule;
        
        this.consistencyRules.set(rule.id, rule);
      });
      
      this.logger.info('Loaded consistency rules', {
        ruleCount: this.consistencyRules.size
      });
      
    } catch (error) {
      this.logger.error('Failed to load consistency rules', {
        error: error.message
      });
    }
  }
  
  /**
   * Register built-in validation functions
   */
  private registerBuiltInValidationFunctions(): void {
    // Referential integrity check
    this.validationFunctions.set('checkReferentialIntegrity', async (rule, firestore, realtimeDB) => {
      const violations = [];
      
      // Example: Check if user references in transactions exist
      const transactionsSnapshot = await firestore.collection('credit_transactions').get();
      
      for (const doc of transactionsSnapshot.docs) {
        const transaction = doc.data();
        if (transaction.userId) {
          const userDoc = await firestore.collection('users').doc(transaction.userId).get();
          if (!userDoc.exists) {
            violations.push({
              description: `Transaction references non-existent user: ${transaction.userId}`,
              affectedDocuments: [doc.id],
              affectedCollections: ['credit_transactions', 'users'],
              data: {
                transactionId: doc.id,
                userId: transaction.userId
              }
            });
          }
        }
      }
      
      return violations;
    });
    
    // Data synchronization check
    this.validationFunctions.set('checkDataSynchronization', async (rule, firestore, realtimeDB) => {
      const violations = [];
      
      // Example: Check if credit balances match between Firestore and Realtime DB
      const balancesSnapshot = await firestore.collection('credit_balances').get();
      
      for (const doc of balancesSnapshot.docs) {
        const firestoreBalance = doc.data();
        const rtdbSnapshot = await realtimeDB.ref(`sessions/${doc.id}/currentBalance`).once('value');
        const rtdbBalance = rtdbSnapshot.val();
        
        if (rtdbBalance !== null && firestoreBalance.currentBalance !== rtdbBalance) {
          violations.push({
            description: `Credit balance mismatch between Firestore and RTDB for user: ${doc.id}`,
            affectedDocuments: [doc.id],
            affectedCollections: ['credit_balances'],
            data: {
              userId: doc.id,
              firestoreBalance: firestoreBalance.currentBalance,
              rtdbBalance
            }
          });
        }
      }
      
      return violations;
    });
    
    // Checksum validation
    this.validationFunctions.set('checkChecksumValidation', async (rule, firestore, realtimeDB) => {
      const violations = [];
      
      // Example: Validate blockchain ledger checksums
      const ledgerSnapshot = await firestore.collection('blockchain_ledger').get();
      
      for (const doc of ledgerSnapshot.docs) {
        const ledgerEntry = doc.data();
        if (ledgerEntry.transactionHash && ledgerEntry.signature) {
          // Validate checksum (simplified example)
          const expectedHash = this.calculateTransactionHash(ledgerEntry);
          if (ledgerEntry.transactionHash !== expectedHash) {
            violations.push({
              description: `Invalid transaction hash in blockchain ledger: ${doc.id}`,
              affectedDocuments: [doc.id],
              affectedCollections: ['blockchain_ledger'],
              data: {
                ledgerEntryId: doc.id,
                expectedHash,
                actualHash: ledgerEntry.transactionHash
              }
            });
          }
        }
      }
      
      return violations;
    });
    
    // Register corresponding repair functions
    this.repairFunctions.set('repairReferentialIntegrity', async (violation, rule, firestore, realtimeDB) => {
      const changes = [];
      
      // Example repair: Remove transactions with invalid user references
      if (violation.violationData.transactionId) {
        await firestore.collection('credit_transactions').doc(violation.violationData.transactionId).delete();
        
        changes.push({
          collection: 'credit_transactions',
          documentId: violation.violationData.transactionId,
          operation: 'delete',
          fieldChanges: []
        });
      }
      
      return changes;
    });
    
    this.repairFunctions.set('repairDataSynchronization', async (violation, rule, firestore, realtimeDB) => {
      const changes = [];
      
      // Example repair: Sync RTDB balance with Firestore
      if (violation.violationData.userId) {
        const firestoreBalance = violation.violationData.firestoreBalance;
        await realtimeDB.ref(`sessions/${violation.violationData.userId}/currentBalance`).set(firestoreBalance);
        
        changes.push({
          collection: 'realtime_db_sessions',
          documentId: violation.violationData.userId,
          operation: 'update',
          fieldChanges: [{
            field: 'currentBalance',
            oldValue: violation.violationData.rtdbBalance,
            newValue: firestoreBalance,
            changeType: 'modified'
          }]
        });
      }
      
      return changes;
    });
    
    this.logger.info('Registered built-in validation functions');
  }
  
  /**
   * Calculate transaction hash (simplified example)
   */
  private calculateTransactionHash(ledgerEntry: any): string {
    // This is a simplified example - in practice, use proper cryptographic hashing
    const data = `${ledgerEntry.userId}_${ledgerEntry.transactionId}_${ledgerEntry.timestamp}`;
    return Buffer.from(data).toString('base64');
  }
  
  /**
   * Start scheduled checks
   */
  private startScheduledChecks(): void {
    for (const rule of this.consistencyRules.values()) {
      if (rule.enabled && rule.schedule) {
        this.scheduleConsistencyCheck(rule.id);
      }
    }
    
    this.logger.info('Started scheduled consistency checks');
  }
  
  /**
   * Schedule consistency check
   */
  private scheduleConsistencyCheck(ruleId: string): void {
    const rule = this.consistencyRules.get(ruleId);
    if (!rule) {
      return;
    }
    
    // Clear existing schedule
    const existingTimer = this.scheduledChecks.get(ruleId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }
    
    // Parse cron expression and create interval
    // For simplicity, using fixed intervals based on schedule string
    let intervalMs = 60 * 60 * 1000; // Default: 1 hour
    
    if (rule.schedule.includes('hourly')) {
      intervalMs = 60 * 60 * 1000;
    } else if (rule.schedule.includes('daily')) {
      intervalMs = 24 * 60 * 60 * 1000;
    } else if (rule.schedule.includes('weekly')) {
      intervalMs = 7 * 24 * 60 * 60 * 1000;
    }
    
    const timer = setInterval(async () => {
      try {
        await this.executeConsistencyCheck(ruleId);
      } catch (error) {
        this.logger.error('Scheduled consistency check failed', {
          ruleId,
          error: error.message
        });
      }
    }, intervalMs);
    
    this.scheduledChecks.set(ruleId, timer);
  }
  
  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      
      fn()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }
  
  /**
   * Update violation status
   */
  private async updateViolationStatus(violationId: string, status: ViolationStatus): Promise<void> {
    await this.firestore.collection('consistency_violations').doc(violationId).update({
      status,
      updatedAt: new Date().toISOString()
    });
  }
  
  /**
   * Update violation
   */
  private async updateViolation(violation: ConsistencyViolation): Promise<void> {
    await this.firestore.collection('consistency_violations').doc(violation.id).update({
      ...violation,
      detectedAt: violation.detectedAt.toISOString(),
      resolvedAt: violation.resolvedAt?.toISOString()
    });
  }
  
  /**
   * Get violation by ID
   */
  async getViolation(violationId: string): Promise<ConsistencyViolation | null> {
    try {
      const doc = await this.firestore.collection('consistency_violations').doc(violationId).get();
      
      if (!doc.exists) {
        return null;
      }
      
      const data = doc.data()!;
      return {
        ...data,
        detectedAt: new Date(data.detectedAt),
        resolvedAt: data.resolvedAt ? new Date(data.resolvedAt) : undefined
      } as ConsistencyViolation;
      
    } catch (error) {
      this.logger.error('Failed to get violation', {
        violationId,
        error: error.message
      });
      
      return null;
    }
  }
  
  /**
   * Get violations by rule
   */
  async getViolationsByRule(ruleId: string, limit: number = 100): Promise<ConsistencyViolation[]> {
    try {
      const snapshot = await this.firestore.collection('consistency_violations')
        .where('ruleId', '==', ruleId)
        .orderBy('detectedAt', 'desc')
        .limit(limit)
        .get();
      
      const violations: ConsistencyViolation[] = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        violations.push({
          ...data,
          detectedAt: new Date(data.detectedAt),
          resolvedAt: data.resolvedAt ? new Date(data.resolvedAt) : undefined
        } as ConsistencyViolation);
      });
      
      return violations;
      
    } catch (error) {
      this.logger.error('Failed to get violations by rule', {
        ruleId,
        error: error.message
      });
      
      return [];
    }
  }
  
  /**
   * Clean up old violations
   */
  private async cleanupOldViolations(): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)); // 30 days
      
      const snapshot = await this.firestore.collection('consistency_violations')
        .where('detectedAt', '<', cutoffDate.toISOString())
        .where('status', 'in', [ViolationStatus.REPAIRED, ViolationStatus.IGNORED])
        .get();
      
      const batch = this.firestore.batch();
      
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      
      this.logger.info('Cleaned up old violations', {
        count: snapshot.size
      });
      
    } catch (error) {
      this.logger.error('Failed to cleanup old violations', {
        error: error.message
      });
    }
  }
  
  /**
   * Get consistency statistics
   */
  async getConsistencyStats(): Promise<{
    totalRules: number;
    activeRules: number;
    totalViolations: number;
    unresolvedViolations: number;
    recentChecks: number;
    repairSuccessRate: number;
  }> {
    const totalRules = this.consistencyRules.size;
    const activeRules = Array.from(this.consistencyRules.values()).filter(r => r.enabled).length;
    
    // Get violation statistics
    const violationsSnapshot = await this.firestore.collection('consistency_violations').get();
    const totalViolations = violationsSnapshot.size;
    
    let unresolvedViolations = 0;
    let totalRepairAttempts = 0;
    let successfulRepairs = 0;
    
    violationsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.status !== ViolationStatus.REPAIRED && data.status !== ViolationStatus.IGNORED) {
        unresolvedViolations++;
      }
      
      if (data.repairAttempts) {
        totalRepairAttempts += data.repairAttempts.length;
        successfulRepairs += data.repairAttempts.filter((a: any) => a.success).length;
      }
    });
    
    const repairSuccessRate = totalRepairAttempts > 0 ? successfulRepairs / totalRepairAttempts : 0;
    
    // Get recent checks count
    const recentChecksSnapshot = await this.firestore.collection('consistency_checks')
      .where('startedAt', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .get();
    
    return {
      totalRules,
      activeRules,
      totalViolations,
      unresolvedViolations,
      recentChecks: recentChecksSnapshot.size,
      repairSuccessRate
    };
  }
  
  /**
   * Register custom validation function
   */
  registerValidationFunction(name: string, fn: Function): void {
    this.validationFunctions.set(name, fn);
    this.logger.info('Registered custom validation function', { name });
  }
  
  /**
   * Register custom repair function
   */
  registerRepairFunction(name: string, fn: Function): void {
    this.repairFunctions.set(name, fn);
    this.logger.info('Registered custom repair function', { name });
  }
  
  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clear all scheduled checks
    for (const timer of this.scheduledChecks.values()) {
      clearInterval(timer);
    }
    
    this.scheduledChecks.clear();
    
    this.logger.info('Data Consistency Manager cleaned up');
  }
}