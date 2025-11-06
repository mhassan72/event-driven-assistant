/**
 * Firestore Callback Type Definitions
 * Provides proper typing for Firestore operations to eliminate implicit any parameters
 */

import { 
  Transaction, 
  QueryDocumentSnapshot, 
  DocumentSnapshot,
  DocumentData,
  QuerySnapshot,
  WriteResult,
  BulkWriter
} from 'firebase-admin/firestore';

/**
 * Transaction callback types
 */
export type TransactionCallback<T = any> = (transaction: Transaction) => Promise<T>;
export type TransactionUpdateCallback = (transaction: Transaction) => Promise<void>;
export type TransactionReadCallback<T = DocumentData> = (transaction: Transaction) => Promise<T>;

/**
 * Document callback types
 */
export type DocumentCallback<T = DocumentData> = (doc: QueryDocumentSnapshot<T>) => void;
export type DocumentAsyncCallback<T = DocumentData> = (doc: QueryDocumentSnapshot<T>) => Promise<void>;
export type DocumentMapCallback<T = DocumentData, R = any> = (doc: QueryDocumentSnapshot<T>) => R;
export type DocumentFilterCallback<T = DocumentData> = (doc: QueryDocumentSnapshot<T>) => boolean;

/**
 * Snapshot callback types
 */
export type SnapshotCallback<T = DocumentData> = (snapshot: DocumentSnapshot<T>) => void;
export type SnapshotAsyncCallback<T = DocumentData> = (snapshot: DocumentSnapshot<T>) => Promise<void>;
export type QuerySnapshotCallback<T = DocumentData> = (snapshot: QuerySnapshot<T>) => void;
export type QuerySnapshotAsyncCallback<T = DocumentData> = (snapshot: QuerySnapshot<T>) => Promise<void>;

/**
 * Batch operation callback types
 */
export type BatchCallback = (batch: FirebaseFirestore.WriteBatch) => void;
export type BatchAsyncCallback = (batch: FirebaseFirestore.WriteBatch) => Promise<void>;

/**
 * Bulk writer callback types
 */
export type BulkWriterCallback = (bulkWriter: BulkWriter) => void;
export type BulkWriterAsyncCallback = (bulkWriter: BulkWriter) => Promise<void>;

/**
 * Error handling callback types
 */
export type ErrorCallback = (error: Error) => void;
export type ErrorAsyncCallback = (error: Error) => Promise<void>;
export type ErrorHandlerCallback = (error: Error) => boolean; // return true to retry

/**
 * Data transformation callback types
 */
export type DataTransformCallback<T = DocumentData, R = any> = (data: T) => R;
export type DataValidationCallback<T = DocumentData> = (data: T) => boolean;
export type DataMergeCallback<T = DocumentData> = (existing: T, incoming: T) => T;

/**
 * Collection operation callback types
 */
export type CollectionIteratorCallback<T = DocumentData> = (doc: QueryDocumentSnapshot<T>, index: number) => void;
export type CollectionAsyncIteratorCallback<T = DocumentData> = (doc: QueryDocumentSnapshot<T>, index: number) => Promise<void>;
export type CollectionReducerCallback<T = DocumentData, R = any> = (accumulator: R, doc: QueryDocumentSnapshot<T>, index: number) => R;

/**
 * Listener callback types
 */
export type DocumentChangeCallback<T = DocumentData> = (
  change: FirebaseFirestore.DocumentChange<T>,
  snapshot: QuerySnapshot<T>
) => void;

export type DocumentChangeAsyncCallback<T = DocumentData> = (
  change: FirebaseFirestore.DocumentChange<T>,
  snapshot: QuerySnapshot<T>
) => Promise<void>;

/**
 * Pagination callback types
 */
export type PaginationCallback<T = DocumentData> = (
  docs: QueryDocumentSnapshot<T>[],
  hasMore: boolean,
  cursor?: QueryDocumentSnapshot<T>
) => void;

export type PaginationAsyncCallback<T = DocumentData> = (
  docs: QueryDocumentSnapshot<T>[],
  hasMore: boolean,
  cursor?: QueryDocumentSnapshot<T>
) => Promise<void>;

/**
 * Aggregation callback types
 */
export type AggregationCallback<T = any> = (result: T) => void;
export type AggregationAsyncCallback<T = any> = (result: T) => Promise<void>;

/**
 * Utility types for common Firestore patterns
 */

/**
 * Transaction operation result
 */
export interface TransactionResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  retryCount?: number;
}

/**
 * Batch operation result
 */
export interface BatchOperationResult {
  success: boolean;
  results: WriteResult[];
  errors: Error[];
  processedCount: number;
  failedCount: number;
}

/**
 * Document change event
 */
export interface DocumentChangeEvent<T = DocumentData> {
  type: 'added' | 'modified' | 'removed';
  doc: QueryDocumentSnapshot<T>;
  oldIndex: number;
  newIndex: number;
}

/**
 * Collection listener options
 */
export interface CollectionListenerOptions {
  includeMetadataChanges?: boolean;
  source?: 'default' | 'server' | 'cache';
}

/**
 * Transaction options with typed callbacks
 */
export interface TypedTransactionOptions<T = any> {
  maxAttempts?: number;
  onRetry?: (attempt: number, error: Error) => void;
  onSuccess?: (result: T) => void;
  onFailure?: (error: Error) => void;
}

/**
 * Batch processing options
 */
export interface BatchProcessingOptions<T = DocumentData> {
  batchSize?: number;
  maxConcurrency?: number;
  onProgress?: (processed: number, total: number) => void;
  onError?: ErrorCallback;
  onBatchComplete?: (batchResults: WriteResult[]) => void;
}

/**
 * Query builder callback types
 */
export type QueryBuilderCallback = (query: FirebaseFirestore.Query) => FirebaseFirestore.Query;
export type CollectionQueryCallback<T = DocumentData> = (
  collection: FirebaseFirestore.CollectionReference<T>
) => FirebaseFirestore.Query<T>;

/**
 * Document reference callback types
 */
export type DocumentRefCallback<T = DocumentData> = (
  docRef: FirebaseFirestore.DocumentReference<T>
) => void;

export type DocumentRefAsyncCallback<T = DocumentData> = (
  docRef: FirebaseFirestore.DocumentReference<T>
) => Promise<void>;

/**
 * Helper type for Firestore document with ID
 */
export interface FirestoreDocument<T = DocumentData> {
  id: string;
  data: T;
  ref: FirebaseFirestore.DocumentReference<T>;
  exists: boolean;
  createTime?: FirebaseFirestore.Timestamp;
  updateTime?: FirebaseFirestore.Timestamp;
}

/**
 * Helper type for Firestore query result
 */
export interface FirestoreQueryResult<T = DocumentData> {
  docs: FirestoreDocument<T>[];
  size: number;
  empty: boolean;
  metadata: FirebaseFirestore.SnapshotMetadata;
}

/**
 * Typed Firestore operation wrappers
 */
export interface TypedFirestoreOperations {
  /**
   * Execute transaction with proper typing
   */
  runTransaction<T>(
    callback: TransactionCallback<T>,
    options?: TypedTransactionOptions<T>
  ): Promise<T>;

  /**
   * Process documents in batches with proper typing
   */
  processBatch<T = DocumentData>(
    docs: QueryDocumentSnapshot<T>[],
    processor: DocumentAsyncCallback<T>,
    options?: BatchProcessingOptions<T>
  ): Promise<BatchOperationResult>;

  /**
   * Listen to collection changes with proper typing
   */
  listenToCollection<T = DocumentData>(
    query: FirebaseFirestore.Query<T>,
    callback: QuerySnapshotAsyncCallback<T>,
    errorCallback?: ErrorCallback,
    options?: CollectionListenerOptions
  ): () => void;

  /**
   * Paginate through collection with proper typing
   */
  paginateCollection<T = DocumentData>(
    query: FirebaseFirestore.Query<T>,
    pageSize: number,
    callback: PaginationAsyncCallback<T>
  ): Promise<void>;
}

/**
 * Common Firestore callback patterns
 */
export const FirestoreCallbacks = {
  /**
   * Standard document processor
   */
  processDocument: <T = DocumentData>(
    processor: (data: T, id: string) => void | Promise<void>
  ): DocumentAsyncCallback<T> => {
    return async (doc: QueryDocumentSnapshot<T>) => {
      await processor(doc.data(), doc.id);
    };
  },

  /**
   * Document to object mapper
   */
  mapToObject: <T = DocumentData>(): DocumentMapCallback<T, FirestoreDocument<T>> => {
    return (doc: QueryDocumentSnapshot<T>): FirestoreDocument<T> => ({
      id: doc.id,
      data: doc.data(),
      ref: doc.ref,
      exists: doc.exists,
      createTime: doc.createTime,
      updateTime: doc.updateTime
    });
  },

  /**
   * Error logger
   */
  logError: (context: string): ErrorCallback => {
    return (error: Error) => {
      console.error(`Firestore error in ${context}:`, error);
    };
  },

  /**
   * Retry handler
   */
  retryHandler: (maxRetries: number = 3): ErrorHandlerCallback => {
    let retryCount = 0;
    return (error: Error): boolean => {
      retryCount++;
      if (retryCount <= maxRetries) {
        console.warn(`Retrying operation (${retryCount}/${maxRetries}):`, error.message);
        return true;
      }
      return false;
    };
  }
};

/**
 * Type-safe Firestore utility functions
 */
export const FirestoreUtils = {
  /**
   * Convert QuerySnapshot to typed array
   */
  snapshotToArray: <T = DocumentData>(
    snapshot: QuerySnapshot<T>
  ): FirestoreDocument<T>[] => {
    return snapshot.docs.map(FirestoreCallbacks.mapToObject<T>());
  },

  /**
   * Check if document exists and has data
   */
  documentExists: <T = DocumentData>(
    snapshot: DocumentSnapshot<T>
  ): snapshot is DocumentSnapshot<T> & { data(): T } => {
    return snapshot.exists;
  },

  /**
   * Safe document data extraction
   */
  getDocumentData: <T = DocumentData>(
    snapshot: DocumentSnapshot<T>
  ): T | null => {
    return snapshot.exists ? snapshot.data() : null;
  }
};