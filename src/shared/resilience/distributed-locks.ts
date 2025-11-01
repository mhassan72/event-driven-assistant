/**
 * Distributed Locks and Optimistic Concurrency Control
 * Prevents race conditions and ensures data consistency in distributed systems
 */

import { Database } from 'firebase-admin/database';
import { Firestore } from 'firebase-admin/firestore';
import { IStructuredLogger } from '../observability/logger';
import { IMetricsCollector } from '../observability/metrics';

/**
 * Lock configuration
 */
export interface LockConfig {
  // Lock timing
  ttl: number;                    // Time to live in milliseconds
  acquireTimeout: number;         // Maximum time to wait for lock acquisition
  retryInterval: number;          // Interval between acquisition attempts
  
  // Lock behavior
  autoRenew: boolean;            // Automatically renew lock before expiration
  renewInterval: number;         // Interval for auto-renewal
  
  // Concurrency settings
  maxConcurrentLocks: number;    // Maximum concurrent locks per resource
  fairnessEnabled: boolean;      // Enable fair lock acquisition (FIFO)
  
  // Monitoring
  enableMetrics: boolean;
  enableDetailedLogging: boolean;
}

/**
 * Lock information
 */
export interface LockInfo {
  id: string;
  resource: string;
  owner: string;
  acquiredAt: Date;
  expiresAt: Date;
  renewCount: number;
  metadata: Record<string, any>;
}

/**
 * Lock acquisition result
 */
export interface LockAcquisitionResult {
  success: boolean;
  lock?: LockInfo;
  error?: string;
  waitTime: number;
  queuePosition?: number;
}

/**
 * Optimistic lock version
 */
export interface OptimisticLockVersion {
  version: number;
  lastModified: Date;
  modifiedBy: string;
  checksum?: string;
}

/**
 * Optimistic update result
 */
export interface OptimisticUpdateResult<T> {
  success: boolean;
  data?: T;
  currentVersion?: OptimisticLockVersion;
  conflictDetected: boolean;
  retryable: boolean;
}

/**
 * Distributed Lock Manager
 */
export class DistributedLockManager {
  private realtimeDB: Database;
  private firestore: Firestore;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  private config: LockConfig;
  
  // Internal state
  private activeLocks: Map<string, LockInfo> = new Map();
  private renewalTimers: Map<string, NodeJS.Timeout> = new Map();
  private lockQueues: Map<string, string[]> = new Map();
  
  constructor(
    config: Partial<LockConfig> = {},
    dependencies: {
      realtimeDB: Database;
      firestore: Firestore;
      logger: IStructuredLogger;
      metrics: IMetricsCollector;
    }
  ) {
    this.config = {
      ttl: 30000,                    // 30 seconds
      acquireTimeout: 10000,         // 10 seconds
      retryInterval: 100,            // 100ms
      autoRenew: true,
      renewInterval: 10000,          // 10 seconds
      maxConcurrentLocks: 1,
      fairnessEnabled: true,
      enableMetrics: true,
      enableDetailedLogging: false,
      ...config
    };
    
    this.realtimeDB = dependencies.realtimeDB;
    this.firestore = dependencies.firestore;
    this.logger = dependencies.logger;
    this.metrics = dependencies.metrics;
    
    this.initializeLockManager();
  }
  
  /**
   * Initialize lock manager
   */
  private async initializeLockManager(): Promise<void> {
    this.logger.info('Initializing Distributed Lock Manager', {
      config: this.config
    });
    
    // Clean up expired locks on startup
    await this.cleanupExpiredLocks();
    
    // Start periodic cleanup
    setInterval(() => {
      this.cleanupExpiredLocks().catch(error => {
        this.logger.error('Lock cleanup failed', { error: error.message });
      });
    }, 60000); // Every minute
  }
  
  /**
   * Acquire distributed lock
   */
  async acquireLock(
    resource: string,
    owner: string,
    metadata: Record<string, any> = {}
  ): Promise<LockAcquisitionResult> {
    const startTime = Date.now();
    const lockId = `lock_${resource}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      this.logger.debug('Attempting to acquire lock', {
        lockId,
        resource,
        owner,
        fairnessEnabled: this.config.fairnessEnabled
      });
      
      // Add to queue if fairness is enabled
      if (this.config.fairnessEnabled) {
        await this.addToLockQueue(resource, lockId);
      }
      
      const result = await this.attemptLockAcquisition(lockId, resource, owner, metadata, startTime);
      
      if (result.success && result.lock) {
        // Store lock locally
        this.activeLocks.set(lockId, result.lock);
        
        // Setup auto-renewal if enabled
        if (this.config.autoRenew) {
          this.setupAutoRenewal(lockId);
        }
        
        this.logger.info('Lock acquired successfully', {
          lockId,
          resource,
          owner,
          waitTime: result.waitTime
        });
        
        if (this.config.enableMetrics) {
          this.metrics.counter('distributed_locks.acquired', 1, {
            resource,
            owner
          });
          
          this.metrics.histogram('distributed_locks.acquisition_time', result.waitTime, {
            resource,
            success: 'true'
          });
        }
      } else {
        this.logger.warn('Failed to acquire lock', {
          lockId,
          resource,
          owner,
          error: result.error,
          waitTime: result.waitTime
        });
        
        if (this.config.enableMetrics) {
          this.metrics.counter('distributed_locks.acquisition_failed', 1, {
            resource,
            owner,
            reason: result.error || 'unknown'
          });
        }
      }
      
      return result;
      
    } catch (error) {
      const waitTime = Date.now() - startTime;
      
      this.logger.error('Lock acquisition error', {
        lockId,
        resource,
        owner,
        error: error.message,
        waitTime
      });
      
      if (this.config.enableMetrics) {
        this.metrics.counter('distributed_locks.acquisition_errors', 1, {
          resource,
          owner
        });
      }
      
      return {
        success: false,
        error: error.message,
        waitTime
      };
    }
  }
  
  /**
   * Attempt lock acquisition with retry logic
   */
  private async attemptLockAcquisition(
    lockId: string,
    resource: string,
    owner: string,
    metadata: Record<string, any>,
    startTime: number
  ): Promise<LockAcquisitionResult> {
    const deadline = startTime + this.config.acquireTimeout;
    
    while (Date.now() < deadline) {
      // Check if we're next in queue (if fairness is enabled)
      if (this.config.fairnessEnabled) {
        const queuePosition = await this.getQueuePosition(resource, lockId);
        if (queuePosition > 0) {
          // Not our turn yet, wait
          await this.sleep(this.config.retryInterval);
          continue;
        }
      }
      
      // Check current lock count
      const currentLocks = await this.getCurrentLockCount(resource);
      if (currentLocks >= this.config.maxConcurrentLocks) {
        await this.sleep(this.config.retryInterval);
        continue;
      }
      
      // Try to acquire lock atomically
      const lock = await this.atomicLockAcquisition(lockId, resource, owner, metadata);
      if (lock) {
        // Remove from queue
        if (this.config.fairnessEnabled) {
          await this.removeFromLockQueue(resource, lockId);
        }
        
        return {
          success: true,
          lock,
          waitTime: Date.now() - startTime
        };
      }
      
      // Wait before retry
      await this.sleep(this.config.retryInterval);
    }
    
    // Timeout reached
    if (this.config.fairnessEnabled) {
      await this.removeFromLockQueue(resource, lockId);
    }
    
    return {
      success: false,
      error: 'Lock acquisition timeout',
      waitTime: Date.now() - startTime
    };
  }
  
  /**
   * Atomic lock acquisition using Realtime Database transaction
   */
  private async atomicLockAcquisition(
    lockId: string,
    resource: string,
    owner: string,
    metadata: Record<string, any>
  ): Promise<LockInfo | null> {
    const lockRef = this.realtimeDB.ref(`locks/${resource}/${lockId}`);
    const resourceRef = this.realtimeDB.ref(`locks/${resource}`);
    
    try {
      const result = await resourceRef.transaction((currentData) => {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.config.ttl);
        
        // Initialize if null
        if (currentData === null) {
          currentData = {};
        }
        
        // Count active locks
        let activeLockCount = 0;
        for (const [key, lockData] of Object.entries(currentData)) {
          if (lockData && typeof lockData === 'object' && 'expiresAt' in lockData) {
            const lockExpiresAt = new Date(lockData.expiresAt as string);
            if (lockExpiresAt > now) {
              activeLockCount++;
            } else {
              // Remove expired lock
              delete currentData[key];
            }
          }
        }
        
        // Check if we can acquire lock
        if (activeLockCount >= this.config.maxConcurrentLocks) {
          return; // Abort transaction
        }
        
        // Add new lock
        currentData[lockId] = {
          id: lockId,
          resource,
          owner,
          acquiredAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          renewCount: 0,
          metadata
        };
        
        return currentData;
      });
      
      if (result.committed && result.snapshot.child(lockId).exists()) {
        const lockData = result.snapshot.child(lockId).val();
        return {
          id: lockId,
          resource,
          owner,
          acquiredAt: new Date(lockData.acquiredAt),
          expiresAt: new Date(lockData.expiresAt),
          renewCount: lockData.renewCount,
          metadata: lockData.metadata
        };
      }
      
      return null;
      
    } catch (error) {
      this.logger.error('Atomic lock acquisition failed', {
        lockId,
        resource,
        error: error.message
      });
      
      return null;
    }
  }
  
  /**
   * Release distributed lock
   */
  async releaseLock(lockId: string): Promise<boolean> {
    try {
      const lock = this.activeLocks.get(lockId);
      if (!lock) {
        this.logger.warn('Attempted to release unknown lock', { lockId });
        return false;
      }
      
      // Cancel auto-renewal
      const renewalTimer = this.renewalTimers.get(lockId);
      if (renewalTimer) {
        clearTimeout(renewalTimer);
        this.renewalTimers.delete(lockId);
      }
      
      // Remove from Realtime Database
      await this.realtimeDB.ref(`locks/${lock.resource}/${lockId}`).remove();
      
      // Remove from local state
      this.activeLocks.delete(lockId);
      
      this.logger.info('Lock released successfully', {
        lockId,
        resource: lock.resource,
        owner: lock.owner
      });
      
      if (this.config.enableMetrics) {
        this.metrics.counter('distributed_locks.released', 1, {
          resource: lock.resource,
          owner: lock.owner
        });
      }
      
      return true;
      
    } catch (error) {
      this.logger.error('Lock release failed', {
        lockId,
        error: error.message
      });
      
      return false;
    }
  }
  
  /**
   * Renew lock expiration
   */
  async renewLock(lockId: string): Promise<boolean> {
    try {
      const lock = this.activeLocks.get(lockId);
      if (!lock) {
        this.logger.warn('Attempted to renew unknown lock', { lockId });
        return false;
      }
      
      const lockRef = this.realtimeDB.ref(`locks/${lock.resource}/${lockId}`);
      const newExpiresAt = new Date(Date.now() + this.config.ttl);
      
      const result = await lockRef.transaction((currentData) => {
        if (currentData === null) {
          return; // Lock doesn't exist, abort
        }
        
        // Verify ownership
        if (currentData.owner !== lock.owner) {
          return; // Not our lock, abort
        }
        
        // Update expiration and increment renew count
        currentData.expiresAt = newExpiresAt.toISOString();
        currentData.renewCount = (currentData.renewCount || 0) + 1;
        
        return currentData;
      });
      
      if (result.committed) {
        // Update local state
        lock.expiresAt = newExpiresAt;
        lock.renewCount++;
        
        this.logger.debug('Lock renewed successfully', {
          lockId,
          resource: lock.resource,
          newExpiresAt: newExpiresAt.toISOString(),
          renewCount: lock.renewCount
        });
        
        if (this.config.enableMetrics) {
          this.metrics.counter('distributed_locks.renewed', 1, {
            resource: lock.resource,
            owner: lock.owner
          });
        }
        
        return true;
      }
      
      return false;
      
    } catch (error) {
      this.logger.error('Lock renewal failed', {
        lockId,
        error: error.message
      });
      
      return false;
    }
  }
  
  /**
   * Setup automatic lock renewal
   */
  private setupAutoRenewal(lockId: string): void {
    const renewalTimer = setTimeout(async () => {
      const renewed = await this.renewLock(lockId);
      
      if (renewed) {
        // Schedule next renewal
        this.setupAutoRenewal(lockId);
      } else {
        // Failed to renew, remove from active locks
        this.activeLocks.delete(lockId);
        this.renewalTimers.delete(lockId);
        
        this.logger.warn('Auto-renewal failed, lock expired', { lockId });
      }
    }, this.config.renewInterval);
    
    this.renewalTimers.set(lockId, renewalTimer);
  }
  
  /**
   * Add to lock queue for fairness
   */
  private async addToLockQueue(resource: string, lockId: string): Promise<void> {
    const queueRef = this.realtimeDB.ref(`lock_queues/${resource}`);
    
    await queueRef.transaction((currentQueue) => {
      if (currentQueue === null) {
        currentQueue = [];
      }
      
      // Add to end of queue if not already present
      if (!currentQueue.includes(lockId)) {
        currentQueue.push(lockId);
      }
      
      return currentQueue;
    });
  }
  
  /**
   * Remove from lock queue
   */
  private async removeFromLockQueue(resource: string, lockId: string): Promise<void> {
    const queueRef = this.realtimeDB.ref(`lock_queues/${resource}`);
    
    await queueRef.transaction((currentQueue) => {
      if (currentQueue === null) {
        return null;
      }
      
      const index = currentQueue.indexOf(lockId);
      if (index !== -1) {
        currentQueue.splice(index, 1);
      }
      
      return currentQueue.length > 0 ? currentQueue : null;
    });
  }
  
  /**
   * Get position in lock queue
   */
  private async getQueuePosition(resource: string, lockId: string): Promise<number> {
    const queueSnapshot = await this.realtimeDB.ref(`lock_queues/${resource}`).once('value');
    const queue = queueSnapshot.val() || [];
    
    return queue.indexOf(lockId);
  }
  
  /**
   * Get current lock count for resource
   */
  private async getCurrentLockCount(resource: string): Promise<number> {
    const locksSnapshot = await this.realtimeDB.ref(`locks/${resource}`).once('value');
    const locks = locksSnapshot.val() || {};
    
    const now = new Date();
    let activeLockCount = 0;
    
    for (const lockData of Object.values(locks)) {
      if (lockData && typeof lockData === 'object' && 'expiresAt' in lockData) {
        const expiresAt = new Date((lockData as any).expiresAt);
        if (expiresAt > now) {
          activeLockCount++;
        }
      }
    }
    
    return activeLockCount;
  }
  
  /**
   * Clean up expired locks
   */
  private async cleanupExpiredLocks(): Promise<void> {
    try {
      const locksSnapshot = await this.realtimeDB.ref('locks').once('value');
      const allLocks = locksSnapshot.val() || {};
      
      const now = new Date();
      const expiredLocks: string[] = [];
      
      for (const [resource, resourceLocks] of Object.entries(allLocks)) {
        if (resourceLocks && typeof resourceLocks === 'object') {
          for (const [lockId, lockData] of Object.entries(resourceLocks as any)) {
            if (lockData && typeof lockData === 'object' && 'expiresAt' in lockData) {
              const expiresAt = new Date((lockData as any).expiresAt);
              if (expiresAt <= now) {
                expiredLocks.push(`locks/${resource}/${lockId}`);
                
                // Remove from local state if present
                this.activeLocks.delete(lockId);
                const renewalTimer = this.renewalTimers.get(lockId);
                if (renewalTimer) {
                  clearTimeout(renewalTimer);
                  this.renewalTimers.delete(lockId);
                }
              }
            }
          }
        }
      }
      
      // Remove expired locks in batch
      if (expiredLocks.length > 0) {
        const updates: Record<string, null> = {};
        expiredLocks.forEach(path => {
          updates[path] = null;
        });
        
        await this.realtimeDB.ref().update(updates);
        
        this.logger.info('Cleaned up expired locks', {
          count: expiredLocks.length
        });
        
        if (this.config.enableMetrics) {
          this.metrics.counter('distributed_locks.expired_cleaned', expiredLocks.length);
        }
      }
      
    } catch (error) {
      this.logger.error('Lock cleanup failed', {
        error: error.message
      });
    }
  }
  
  /**
   * Execute function with distributed lock
   */
  async executeWithLock<T>(
    resource: string,
    owner: string,
    fn: () => Promise<T>,
    metadata: Record<string, any> = {}
  ): Promise<T> {
    const lockResult = await this.acquireLock(resource, owner, metadata);
    
    if (!lockResult.success || !lockResult.lock) {
      throw new Error(`Failed to acquire lock for resource: ${resource}. ${lockResult.error}`);
    }
    
    try {
      return await fn();
    } finally {
      await this.releaseLock(lockResult.lock.id);
    }
  }
  
  /**
   * Get lock information
   */
  async getLockInfo(lockId: string): Promise<LockInfo | null> {
    return this.activeLocks.get(lockId) || null;
  }
  
  /**
   * Get all active locks for resource
   */
  async getResourceLocks(resource: string): Promise<LockInfo[]> {
    const locksSnapshot = await this.realtimeDB.ref(`locks/${resource}`).once('value');
    const locks = locksSnapshot.val() || {};
    
    const activeLocks: LockInfo[] = [];
    const now = new Date();
    
    for (const lockData of Object.values(locks)) {
      if (lockData && typeof lockData === 'object' && 'expiresAt' in lockData) {
        const lockInfo = lockData as any;
        const expiresAt = new Date(lockInfo.expiresAt);
        
        if (expiresAt > now) {
          activeLocks.push({
            id: lockInfo.id,
            resource: lockInfo.resource,
            owner: lockInfo.owner,
            acquiredAt: new Date(lockInfo.acquiredAt),
            expiresAt,
            renewCount: lockInfo.renewCount || 0,
            metadata: lockInfo.metadata || {}
          });
        }
      }
    }
    
    return activeLocks;
  }
  
  /**
   * Force release all locks for owner
   */
  async forceReleaseOwnerLocks(owner: string): Promise<number> {
    let releasedCount = 0;
    
    for (const [lockId, lock] of this.activeLocks) {
      if (lock.owner === owner) {
        const released = await this.releaseLock(lockId);
        if (released) {
          releasedCount++;
        }
      }
    }
    
    this.logger.info('Force released locks for owner', {
      owner,
      releasedCount
    });
    
    return releasedCount;
  }
  
  /**
   * Utility method to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get lock manager statistics
   */
  getStats(): {
    activeLocks: number;
    activeRenewals: number;
    config: LockConfig;
  } {
    return {
      activeLocks: this.activeLocks.size,
      activeRenewals: this.renewalTimers.size,
      config: this.config
    };
  }
  
  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clear all renewal timers
    for (const timer of this.renewalTimers.values()) {
      clearTimeout(timer);
    }
    
    this.renewalTimers.clear();
    this.activeLocks.clear();
    
    this.logger.info('Distributed Lock Manager cleaned up');
  }
}

/**
 * Optimistic Concurrency Control Manager
 */
export class OptimisticConcurrencyManager {
  private firestore: Firestore;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  
  constructor(dependencies: {
    firestore: Firestore;
    logger: IStructuredLogger;
    metrics: IMetricsCollector;
  }) {
    this.firestore = dependencies.firestore;
    this.logger = dependencies.logger;
    this.metrics = dependencies.metrics;
  }
  
  /**
   * Read document with version information
   */
  async readWithVersion<T>(
    collection: string,
    documentId: string
  ): Promise<{ data: T | null; version: OptimisticLockVersion | null }> {
    try {
      const doc = await this.firestore.collection(collection).doc(documentId).get();
      
      if (!doc.exists) {
        return { data: null, version: null };
      }
      
      const data = doc.data() as T;
      const version: OptimisticLockVersion = {
        version: doc.data()?._version || 1,
        lastModified: doc.data()?._lastModified?.toDate() || new Date(),
        modifiedBy: doc.data()?._modifiedBy || 'unknown',
        checksum: doc.data()?._checksum
      };
      
      return { data, version };
      
    } catch (error) {
      this.logger.error('Optimistic read failed', {
        collection,
        documentId,
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Update document with optimistic concurrency control
   */
  async updateWithVersion<T>(
    collection: string,
    documentId: string,
    updateData: Partial<T>,
    expectedVersion: OptimisticLockVersion,
    updatedBy: string
  ): Promise<OptimisticUpdateResult<T>> {
    try {
      const docRef = this.firestore.collection(collection).doc(documentId);
      
      const result = await this.firestore.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        
        if (!doc.exists) {
          return {
            success: false,
            conflictDetected: true,
            retryable: false
          };
        }
        
        const currentData = doc.data();
        const currentVersion = currentData?._version || 1;
        
        // Check for version conflict
        if (currentVersion !== expectedVersion.version) {
          this.logger.warn('Optimistic concurrency conflict detected', {
            collection,
            documentId,
            expectedVersion: expectedVersion.version,
            currentVersion,
            updatedBy
          });
          
          this.metrics.counter('optimistic_concurrency.conflicts', 1, {
            collection,
            updated_by: updatedBy
          });
          
          return {
            success: false,
            currentVersion: {
              version: currentVersion,
              lastModified: currentData._lastModified?.toDate() || new Date(),
              modifiedBy: currentData._modifiedBy || 'unknown',
              checksum: currentData._checksum
            },
            conflictDetected: true,
            retryable: true
          };
        }
        
        // Calculate checksum for data integrity
        const newChecksum = this.calculateChecksum(updateData);
        
        // Prepare update with version increment
        const updateWithVersion = {
          ...updateData,
          _version: currentVersion + 1,
          _lastModified: new Date(),
          _modifiedBy: updatedBy,
          _checksum: newChecksum
        };
        
        transaction.update(docRef, updateWithVersion);
        
        return {
          success: true,
          data: { ...currentData, ...updateWithVersion } as T,
          conflictDetected: false,
          retryable: false
        };
      });
      
      if (result.success) {
        this.logger.debug('Optimistic update succeeded', {
          collection,
          documentId,
          newVersion: expectedVersion.version + 1,
          updatedBy
        });
        
        this.metrics.counter('optimistic_concurrency.updates_success', 1, {
          collection,
          updated_by: updatedBy
        });
      }
      
      return result;
      
    } catch (error) {
      this.logger.error('Optimistic update failed', {
        collection,
        documentId,
        error: error.message,
        updatedBy
      });
      
      this.metrics.counter('optimistic_concurrency.updates_error', 1, {
        collection,
        updated_by: updatedBy
      });
      
      return {
        success: false,
        conflictDetected: false,
        retryable: true
      };
    }
  }
  
  /**
   * Update with automatic retry on conflicts
   */
  async updateWithRetry<T>(
    collection: string,
    documentId: string,
    updateFn: (currentData: T, version: OptimisticLockVersion) => Partial<T>,
    updatedBy: string,
    maxRetries: number = 3
  ): Promise<OptimisticUpdateResult<T>> {
    let lastResult: OptimisticUpdateResult<T> | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // Read current version
      const { data, version } = await this.readWithVersion<T>(collection, documentId);
      
      if (!data || !version) {
        return {
          success: false,
          conflictDetected: false,
          retryable: false
        };
      }
      
      // Calculate update
      const updateData = updateFn(data, version);
      
      // Attempt update
      const result = await this.updateWithVersion(
        collection,
        documentId,
        updateData,
        version,
        updatedBy
      );
      
      lastResult = result;
      
      if (result.success || !result.retryable) {
        return result;
      }
      
      // Wait before retry with exponential backoff
      if (attempt < maxRetries) {
        const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000);
        await this.sleep(delay);
      }
    }
    
    return lastResult || {
      success: false,
      conflictDetected: true,
      retryable: false
    };
  }
  
  /**
   * Calculate checksum for data integrity
   */
  private calculateChecksum(data: any): string {
    // Simple checksum calculation - in production, use a proper hash function
    const jsonString = JSON.stringify(data, Object.keys(data).sort());
    let hash = 0;
    
    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash.toString(36);
  }
  
  /**
   * Utility method to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}