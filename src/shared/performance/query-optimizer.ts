/**
 * Query Optimizer
 * Optimizes database queries with batching, caching, and connection pooling
 * Follows OOP principles and performance best practices
 */

import * as admin from 'firebase-admin';
import { IStructuredLogger } from '../observability/logger';
import { IMetricsCollector } from '../observability/metrics';
import { BaseCache, CacheFactory } from './cache-manager';

/**
 * Query configuration
 */
export interface QueryConfig {
  enableCaching: boolean;
  cacheTTL: number;
  enableBatching: boolean;
  batchSize: number;
  batchDelay: number;
  enableMetrics: boolean;
}

/**
 * Query result with metadata
 */
export interface QueryResult<T> {
  data: T[];
  fromCache: boolean;
  executionTime: number;
  queryCount: number;
}

/**
 * Batch query request
 */
interface BatchQueryRequest {
  collection: string;
  filters: Array<{ field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }>;
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  resolve: (data: any[]) => void;
  reject: (error: Error) => void;
}

/**
 * Abstract base class for query optimizers
 * Demonstrates Template Method pattern
 */
export abstract class BaseQueryOptimizer {
  protected firestore: admin.firestore.Firestore;
  protected logger: IStructuredLogger;
  protected metrics: IMetricsCollector;
  protected config: QueryConfig;
  protected cache?: BaseCache<any>;

  constructor(
    firestore: admin.firestore.Firestore,
    config: Partial<QueryConfig>,
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ) {
    this.firestore = firestore;
    this.logger = logger;
    this.metrics = metrics;
    this.config = {
      enableCaching: config.enableCaching !== false,
      cacheTTL: config.cacheTTL || 5 * 60 * 1000, // 5 minutes
      enableBatching: config.enableBatching !== false,
      batchSize: config.batchSize || 10,
      batchDelay: config.batchDelay || 100, // 100ms
      enableMetrics: config.enableMetrics !== false
    };

    // Initialize cache if enabled
    if (this.config.enableCaching) {
      this.cache = CacheFactory.createCache(
        {
          maxSize: 50 * 1024 * 1024, // 50MB
          maxEntries: 5000,
          defaultTTL: this.config.cacheTTL,
          evictionPolicy: 'LRU'
        },
        logger,
        metrics
      );
    }
  }

  /**
   * Execute query with optimization
   * Template method defining the query execution workflow
   */
  public async query<T>(
    collection: string,
    filters: Array<{ field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }>,
    options?: {
      orderBy?: { field: string; direction: 'asc' | 'desc' };
      limit?: number;
      skipCache?: boolean;
    }
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(collection, filters, options);

    try {
      // Step 1: Check cache if enabled
      if (this.config.enableCaching && !options?.skipCache && this.cache) {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          this.recordCacheHit(collection);
          return {
            data: cached,
            fromCache: true,
            executionTime: Date.now() - startTime,
            queryCount: 0
          };
        }
      }

      // Step 2: Execute query
      const data = await this.executeQuery<T>(collection, filters, options);

      // Step 3: Cache result if enabled
      if (this.config.enableCaching && this.cache) {
        await this.cache.set(cacheKey, data, this.config.cacheTTL);
      }

      // Step 4: Record metrics
      this.recordQueryExecution(collection, Date.now() - startTime);

      return {
        data,
        fromCache: false,
        executionTime: Date.now() - startTime,
        queryCount: 1
      };

    } catch (error) {
      this.logger.error('Query execution failed', {
        collection,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Execute query - abstract method to be implemented by subclasses
   */
  protected abstract executeQuery<T>(
    collection: string,
    filters: Array<{ field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }>,
    options?: {
      orderBy?: { field: string; direction: 'asc' | 'desc' };
      limit?: number;
    }
  ): Promise<T[]>;

  /**
   * Generate cache key for query
   */
  protected generateCacheKey(
    collection: string,
    filters: Array<{ field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }>,
    options?: any
  ): string {
    const filterStr = filters
      .map(f => `${f.field}${f.operator}${JSON.stringify(f.value)}`)
      .join('_');
    const optionsStr = options ? JSON.stringify(options) : '';
    return `query_${collection}_${filterStr}_${optionsStr}`;
  }

  /**
   * Record cache hit metric
   */
  protected recordCacheHit(collection: string): void {
    if (this.config.enableMetrics) {
      this.metrics.incrementCounter('query_cache_hit', { collection });
    }
  }

  /**
   * Record query execution metric
   */
  protected recordQueryExecution(collection: string, executionTime: number): void {
    if (this.config.enableMetrics) {
      this.metrics.incrementCounter('query_executed', { collection });
      this.metrics.recordValue('query_execution_time', executionTime, { collection });
    }
  }

  /**
   * Invalidate cache for collection
   */
  public async invalidateCache(collection: string): Promise<void> {
    if (this.cache) {
      // In a real implementation, we'd track cache keys by collection
      // For now, just clear the entire cache
      await this.cache.clear();
      this.logger.debug('Cache invalidated', { collection });
    }
  }
}

/**
 * Standard query optimizer
 * Executes queries without batching
 */
export class StandardQueryOptimizer extends BaseQueryOptimizer {
  protected async executeQuery<T>(
    collection: string,
    filters: Array<{ field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }>,
    options?: {
      orderBy?: { field: string; direction: 'asc' | 'desc' };
      limit?: number;
    }
  ): Promise<T[]> {
    let query: FirebaseFirestore.Query = this.firestore.collection(collection);

    // Apply filters
    for (const filter of filters) {
      query = query.where(filter.field, filter.operator, filter.value);
    }

    // Apply ordering
    if (options?.orderBy) {
      query = query.orderBy(options.orderBy.field, options.orderBy.direction);
    }

    // Apply limit
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
  }
}

/**
 * Batch query optimizer
 * Batches multiple queries together for efficiency
 */
export class BatchQueryOptimizer extends BaseQueryOptimizer {
  private batchQueue: BatchQueryRequest[] = [];
  private batchTimer?: NodeJS.Timeout;

  protected async executeQuery<T>(
    collection: string,
    filters: Array<{ field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }>,
    options?: {
      orderBy?: { field: string; direction: 'asc' | 'desc' };
      limit?: number;
    }
  ): Promise<T[]> {
    if (!this.config.enableBatching) {
      // Fall back to standard execution
      return this.executeStandardQuery<T>(collection, filters, options);
    }

    // Add to batch queue
    return new Promise<T[]>((resolve, reject) => {
      this.batchQueue.push({
        collection,
        filters,
        orderBy: options?.orderBy,
        limit: options?.limit,
        resolve,
        reject
      });

      // Schedule batch execution
      this.scheduleBatchExecution();
    });
  }

  /**
   * Schedule batch execution
   */
  private scheduleBatchExecution(): void {
    if (this.batchTimer) {
      return; // Already scheduled
    }

    // Execute immediately if batch is full
    if (this.batchQueue.length >= this.config.batchSize) {
      this.executeBatch();
      return;
    }

    // Otherwise schedule for later
    this.batchTimer = setTimeout(() => {
      this.executeBatch();
    }, this.config.batchDelay);
  }

  /**
   * Execute batched queries
   */
  private async executeBatch(): Promise<void> {
    if (this.batchQueue.length === 0) {
      return;
    }

    const batch = this.batchQueue.splice(0, this.config.batchSize);
    this.batchTimer = undefined;

    this.logger.debug('Executing batch queries', {
      batchSize: batch.length
    });

    // Execute all queries in parallel
    const results = await Promise.allSettled(
      batch.map(req =>
        this.executeStandardQuery(req.collection, req.filters, {
          orderBy: req.orderBy,
          limit: req.limit
        })
      )
    );

    // Resolve/reject promises
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        batch[index].resolve(result.value);
      } else {
        batch[index].reject(result.reason);
      }
    });

    // Schedule next batch if queue is not empty
    if (this.batchQueue.length > 0) {
      this.scheduleBatchExecution();
    }
  }

  /**
   * Execute standard query without batching
   */
  private async executeStandardQuery<T>(
    collection: string,
    filters: Array<{ field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }>,
    options?: {
      orderBy?: { field: string; direction: 'asc' | 'desc' };
      limit?: number;
    }
  ): Promise<T[]> {
    let query: FirebaseFirestore.Query = this.firestore.collection(collection);

    for (const filter of filters) {
      query = query.where(filter.field, filter.operator, filter.value);
    }

    if (options?.orderBy) {
      query = query.orderBy(options.orderBy.field, options.orderBy.direction);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
  }
}

/**
 * Query optimizer factory
 * Demonstrates Factory Pattern
 */
export class QueryOptimizerFactory {
  public static createOptimizer(
    firestore: admin.firestore.Firestore,
    config: Partial<QueryConfig>,
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ): BaseQueryOptimizer {
    if (config.enableBatching) {
      return new BatchQueryOptimizer(firestore, config, logger, metrics);
    } else {
      return new StandardQueryOptimizer(firestore, config, logger, metrics);
    }
  }
}

/**
 * Query builder for fluent API
 * Demonstrates Builder Pattern
 */
export class QueryBuilder<T> {
  private collection: string;
  private filters: Array<{ field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }> = [];
  private orderByField?: { field: string; direction: 'asc' | 'desc' };
  private limitValue?: number;
  private skipCacheFlag = false;
  private optimizer: BaseQueryOptimizer;

  constructor(collection: string, optimizer: BaseQueryOptimizer) {
    this.collection = collection;
    this.optimizer = optimizer;
  }

  public where(field: string, operator: FirebaseFirestore.WhereFilterOp, value: any): QueryBuilder<T> {
    this.filters.push({ field, operator, value });
    return this;
  }

  public orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): QueryBuilder<T> {
    this.orderByField = { field, direction };
    return this;
  }

  public limit(limit: number): QueryBuilder<T> {
    this.limitValue = limit;
    return this;
  }

  public skipCache(): QueryBuilder<T> {
    this.skipCacheFlag = true;
    return this;
  }

  public async execute(): Promise<QueryResult<T>> {
    return this.optimizer.query<T>(this.collection, this.filters, {
      orderBy: this.orderByField,
      limit: this.limitValue,
      skipCache: this.skipCacheFlag
    });
  }
}
