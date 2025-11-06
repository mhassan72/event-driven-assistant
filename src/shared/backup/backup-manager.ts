/**
 * Backup and Disaster Recovery Manager
 * Handles automated backups and disaster recovery procedures
 */

import * as admin from 'firebase-admin';
import { productionLogger } from '../observability/production-logger';
import { alertingSystem } from '../observability/alerting-system';

export interface BackupConfig {
  enabled: boolean;
  intervalHours: number;
  retentionDays: number;
  collections: string[];
  includeRealtimeDB: boolean;
  compressionEnabled: boolean;
}

export interface BackupResult {
  id: string;
  timestamp: Date;
  status: 'success' | 'failed' | 'partial';
  collections: string[];
  documentCount: number;
  sizeBytes: number;
  duration: number;
  error?: string;
}

export interface RestoreOptions {
  backupId: string;
  collections?: string[];
  targetTimestamp?: Date;
  dryRun?: boolean;
}

export class BackupManager {
  private static instance: BackupManager;
  private config: BackupConfig;
  private backupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.config = {
      enabled: process.env.BACKUP_ENABLED === 'true',
      intervalHours: parseInt(process.env.BACKUP_INTERVAL_HOURS || '6'),
      retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30'),
      collections: [
        'users',
        'credit_transactions',
        'credit_balances',
        'ai_interactions',
        'conversations',
        'payments',
        'crypto_payments',
        'generated_images',
        'audit_logs',
        'system_config'
      ],
      includeRealtimeDB: true,
      compressionEnabled: true
    };

    if (this.config.enabled) {
      this.startAutomaticBackups();
    }
  }

  public static getInstance(): BackupManager {
    if (!BackupManager.instance) {
      BackupManager.instance = new BackupManager();
    }
    return BackupManager.instance;
  }

  private startAutomaticBackups(): void {
    const intervalMs = this.config.intervalHours * 60 * 60 * 1000;
    
    this.backupInterval = setInterval(async () => {
      try {
        await this.createFullBackup();
      } catch (error) {
        productionLogger.error('Automatic backup failed', {
          component: 'backup-manager',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        alertingSystem.createAlert({
          type: 'critical',
          title: 'Backup Failed',
          message: 'Automatic backup process failed',
          source: 'backup-manager',
          context: { error: error instanceof Error ? error.message : 'Unknown error' }
        });
      }
    }, intervalMs);

    productionLogger.info('Automatic backups started', {
      component: 'backup-manager',
      intervalHours: this.config.intervalHours
    });
  }

  public async createFullBackup(): Promise<BackupResult> {
    const startTime = Date.now();
    const backupId = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    productionLogger.info('Starting full backup', {
      component: 'backup-manager',
      backupId
    });

    try {
      const db = admin.firestore();
      let totalDocuments = 0;
      let totalSize = 0;
      const backedUpCollections: string[] = [];

      // Create backup metadata document
      const backupMetadata = {
        id: backupId,
        timestamp: new Date(),
        type: 'full',
        status: 'in_progress',
        collections: this.config.collections,
        startTime: new Date(startTime)
      };

      await db.collection('system_backups').doc(backupId).set(backupMetadata);

      // Backup each collection
      for (const collectionName of this.config.collections) {
        try {
          const collectionBackup = await this.backupCollection(collectionName, backupId);
          totalDocuments += collectionBackup.documentCount;
          totalSize += collectionBackup.sizeBytes;
          backedUpCollections.push(collectionName);
          
          productionLogger.info('Collection backup completed', {
            component: 'backup-manager',
            backupId,
            collection: collectionName,
            documents: collectionBackup.documentCount
          });
        } catch (error) {
          productionLogger.error('Collection backup failed', {
            component: 'backup-manager',
            backupId,
            collection: collectionName,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Backup Realtime Database if enabled
      if (this.config.includeRealtimeDB) {
        try {
          await this.backupRealtimeDatabase(backupId);
          productionLogger.info('Realtime Database backup completed', {
            component: 'backup-manager',
            backupId
          });
        } catch (error) {
          productionLogger.error('Realtime Database backup failed', {
            component: 'backup-manager',
            backupId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const duration = Date.now() - startTime;
      const result: BackupResult = {
        id: backupId,
        timestamp: new Date(),
        status: backedUpCollections.length === this.config.collections.length ? 'success' : 'partial',
        collections: backedUpCollections,
        documentCount: totalDocuments,
        sizeBytes: totalSize,
        duration
      };

      // Update backup metadata
      await db.collection('system_backups').doc(backupId).update({
        status: result.status,
        endTime: new Date(),
        duration,
        documentCount: totalDocuments,
        sizeBytes: totalSize,
        collections: backedUpCollections
      });

      productionLogger.info('Full backup completed', {
        component: 'backup-manager',
        backupId,
        status: result.status,
        duration,
        documents: totalDocuments
      });

      // Clean up old backups
      await this.cleanupOldBackups();

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: BackupResult = {
        id: backupId,
        timestamp: new Date(),
        status: 'failed',
        collections: [],
        documentCount: 0,
        sizeBytes: 0,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      productionLogger.error('Full backup failed', {
        component: 'backup-manager',
        backupId,
        duration,
        error: result.error
      });

      return result;
    }
  }

  private async backupCollection(collectionName: string, backupId: string): Promise<{ documentCount: number; sizeBytes: number }> {
    const db = admin.firestore();
    const collection = db.collection(collectionName);
    
    let documentCount = 0;
    let sizeBytes = 0;
    let lastDoc: any = null;
    const batchSize = 500;

    do {
      let query = collection.orderBy(admin.firestore.FieldPath.documentId()).limit(batchSize);
      
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const snapshot = await query.get();
      
      if (snapshot.empty) {
        break;
      }

      const batch = db.batch();
      const backupDocs: any[] = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        backupDocs.push({
          id: doc.id,
          data,
          path: doc.ref.path
        });
        
        // Estimate size (rough calculation)
        sizeBytes += JSON.stringify(data).length;
        documentCount++;
      });

      // Store backup batch
      const backupBatchDoc = db.collection('system_backups')
        .doc(backupId)
        .collection('collections')
        .doc(collectionName)
        .collection('batches')
        .doc(`batch_${Math.floor(documentCount / batchSize)}`);

      batch.set(backupBatchDoc, {
        documents: backupDocs,
        timestamp: new Date(),
        batchNumber: Math.floor(documentCount / batchSize),
        documentCount: backupDocs.length
      });

      await batch.commit();
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    } while (true);

    return { documentCount, sizeBytes };
  }

  private async backupRealtimeDatabase(backupId: string): Promise<void> {
    const rtdb = admin.database();
    const db = admin.firestore();

    // Get critical paths from Realtime Database
    const criticalPaths = [
      'credit_orchestration',
      'ai_orchestration',
      'rate_limits',
      'system_status'
    ];

    for (const path of criticalPaths) {
      try {
        const snapshot = await rtdb.ref(path).once('value');
        const data = snapshot.val();

        if (data) {
          await db.collection('system_backups')
            .doc(backupId)
            .collection('realtime_db')
            .doc(path.replace('/', '_'))
            .set({
              path,
              data,
              timestamp: new Date()
            });
        }
      } catch (error) {
        productionLogger.warn('Failed to backup Realtime DB path', {
          component: 'backup-manager',
          path,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  private async cleanupOldBackups(): Promise<void> {
    try {
      const db = admin.firestore();
      const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
      
      const oldBackupsSnapshot = await db.collection('system_backups')
        .where('timestamp', '<', cutoffDate)
        .get();

      const batch = db.batch();
      let deleteCount = 0;

      for (const doc of oldBackupsSnapshot.docs) {
        batch.delete(doc.ref);
        deleteCount++;
        
        // Also delete the backup data collections
        try {
          const collectionsSnapshot = await doc.ref.collection('collections').get();
          for (const collectionDoc of collectionsSnapshot.docs) {
            batch.delete(collectionDoc.ref);
          }
          
          const rtdbSnapshot = await doc.ref.collection('realtime_db').get();
          for (const rtdbDoc of rtdbSnapshot.docs) {
            batch.delete(rtdbDoc.ref);
          }
        } catch (error) {
          productionLogger.warn('Failed to cleanup backup data', {
            component: 'backup-manager',
            backupId: doc.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      if (deleteCount > 0) {
        await batch.commit();
        productionLogger.info('Old backups cleaned up', {
          component: 'backup-manager',
          deletedCount: deleteCount,
          retentionDays: this.config.retentionDays
        });
      }
    } catch (error) {
      productionLogger.error('Failed to cleanup old backups', {
        component: 'backup-manager',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  public async listBackups(limit: number = 10): Promise<any[]> {
    try {
      const db = admin.firestore();
      const snapshot = await db.collection('system_backups')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();

      return snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      productionLogger.error('Failed to list backups', {
        component: 'backup-manager',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return [];
    }
  }

  public async validateBackup(backupId: string): Promise<boolean> {
    try {
      const db = admin.firestore();
      const backupDoc = await db.collection('system_backups').doc(backupId).get();
      
      if (!backupDoc.exists) {
        return false;
      }

      const backupData = backupDoc.data();
      return backupData?.status === 'success' && backupData?.collections?.length > 0;
    } catch (error) {
      productionLogger.error('Failed to validate backup', {
        component: 'backup-manager',
        backupId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  public stop(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
      productionLogger.info('Automatic backups stopped', {
        component: 'backup-manager'
      });
    }
  }
}

// Export singleton instance
export const backupManager = BackupManager.getInstance();