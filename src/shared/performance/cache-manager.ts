/**
 * Cache Manager
 * Implements efficient caching strategies with TTL, LRU eviction, and memory management
 * Follows OOP principles and design patterns
 */

import { IStructuredLogger } from '../observability/logger';
import { IMetricsCollector } from '../observability/metrics';

/**
 * Cache entry interface
 */
export interface CacheEntry<T> {
  key: string;
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
  size: number; // Approximate size in bytes
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  maxSize: number; // Maximum cache size in bytes
  maxEntries: number; // Maximum number of entries
  defaultTTL: number; // Default TTL in milliseconds
  evictionPolicy: 'LRU' | 'LFU' | 'FIFO';
  enableMetrics: boolean;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  currentSize: number;
  currentEntries: number;
  hitRate: number;
  averageAccessTime: number;
}

/**
 * Abstract base class for cache implementations
 * Demonstrates Template Method pattern
 */
export abstract class BaseCache<T> {
  protected cache: Map<string, CacheEntry<T>> = new Map();
  protected config: CacheConfig;
  protected logger: IStructuredLogger;
  protected metrics: IMetricsCollector;
  protected stats: CacheStats;

  constructor(
    config: Partial<CacheConfig>,
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ) {
    this.config = {
      maxSize: config.maxSize || 100 * 1024 * 1024, // 100MB default
      maxEntries: config.maxEntries || 10000,
      defaultTTL: config.defaultTTL || 5 * 60 * 1000, // 5 minutes default
      evictionPolicy: config.evictionPolicy || 'LRU',
      enableMetrics: config.enableMetrics !== false
    };
    this.logger = logger;
    this.metrics = metrics;
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      currentSize: 0,
      currentEntries: 0,
      hitRate: 0,
      averageAccessTime: 0
    };
  }

  /**
   * Get value from cache
   * Template method - defines the algorithm structure
   */
  public async get(key: string): Promise<T | null> {
    const startTime = Date.now();

    try {
      // Check if entry exists
      const entry = this.cache.get(key);

      if (!entry) {
        this.recordMiss(key);
        return null;
      }

      // Check if entry is expired
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.updateSize(-entry.size);
        this.recordMiss(key);
        return null;
      }

      // Update access metadata
      this.updateAccessMetadata(entry);

      // Record hit
      this.recordHit(key, Date.now() - startTime);

      return entry.value;

    } catch (error) {
      this.logger.error('Cache get error', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Set value in cache
   * Template method - defines the algorithm structure
   */
  public async set(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const size = this.estimateSize(value);
      const expiresAt = Date.now() + (ttl || this.config.defaultTTL);

      // Check if we need to evict entries
      await this.ensureCapacity(size);

      // Create cache entry
      const entry: CacheEntry<T> = {
        key,
        value,
        expiresAt,
        accessCount: 0,
        lastAccessed: Date.now(),
        size
      };

      // Remove old entry if exists
      const oldEntry = this.cache.get(key);
      if (oldEntry) {
        this.updateSize(-oldEntry.size);
      }

      // Add new entry
      this.cache.set(key, entry);
      this.updateSize(size);

      this.logger.debug('Cache set', {
        key,
        size,
        ttl: ttl || this.config.defaultTTL,
        currentEntries: this.cache.size
      });

    } catch (error) {
      this.logger.error('Cache set error', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Delete value from cache
   */
  public async delete(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.updateSize(-entry.size);
      return true;
    }
    return false;
  }

  /**
   * Clear all cache entries
   */
  public async clear(): Promise<void> {
    this.cache.clear();
    this.stats.currentSize = 0;
    this.stats.currentEntries = 0;
    this.logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    this.stats.hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    this.stats.currentEntries = this.cache.size;
    return { ...this.stats };
  }

  /**
   * Check if entry is expired
   */
  protected isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt;
  }

  /**
   * Update access metadata
   */
  protected updateAccessMetadata(entry: CacheEntry<T>): void {
    entry.accessCount++;
    entry.lastAccessed = Date.now();
  }

  /**
   * Ensure cache has capacity for new entry
   * Hook method - can be overridden by subclasses
   */
  protected async ensureCapacity(requiredSize: number): Promise<void> {
    // Check if we need to evict based on size
    while (this.stats.currentSize + requiredSize > this.config.maxSize) {
      await this.evictOne();
    }

    // Check if we need to evict based on entry count
    while (this.cache.size >= this.config.maxEntries) {
      await this.evictOne();
    }
  }

  /**
   * Evict one entry based on eviction policy
   * Abstract method - must be implemented by subclasses
   */
  protected abstract evictOne(): Promise<void>;

  /**
   * Estimate size of value in bytes
   */
  protected estimateSize(value: T): number {
    try {
      const json = JSON.stringify(value);
      return json.length * 2; // Approximate size (UTF-16)
    } catch {
      return 1024; // Default 1KB if can't estimate
    }
  }

  /**
   * Update total cache size
   */
  protected updateSize(delta: number): void {
    this.stats.currentSize += delta;
    if (this.stats.currentSize < 0) {
      this.stats.currentSize = 0;
    }
  }

  /**
   * Record cache hit
   */
  protected recordHit(key: string, accessTime: number): void {
    this.stats.hits++;
    
    if (this.config.enableMetrics) {
      this.metrics.incrementCounter('cache_hit', { key });
      this.metrics.recordValue('cache_access_time', accessTime, { result: 'hit' });
    }
  }

  /**
   * Record cache miss
   */
  protected recordMiss(key: string): void {
    this.stats.misses++;
    
    if (this.config.enableMetrics) {
      this.metrics.incrementCounter('cache_miss', { key });
    }
  }

  /**
   * Record cache eviction
   */
  protected recordEviction(key: string): void {
    this.stats.evictions++;
    
    if (this.config.enableMetrics) {
      this.metrics.incrementCounter('cache_eviction', { key });
    }
  }
}

/**
 * LRU Cache implementation
 * Evicts least recently used entries
 */
export class LRUCache<T> extends BaseCache<T> {
  protected async evictOne(): Promise<void> {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    // Find least recently used entry
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey);
      if (entry) {
        this.cache.delete(oldestKey);
        this.updateSize(-entry.size);
        this.recordEviction(oldestKey);
        
        this.logger.debug('LRU eviction', {
          key: oldestKey,
          lastAccessed: new Date(oldestTime).toISOString()
        });
      }
    }
  }
}

/**
 * LFU Cache implementation
 * Evicts least frequently used entries
 */
export class LFUCache<T> extends BaseCache<T> {
  protected async evictOne(): Promise<void> {
    let leastUsedKey: string | null = null;
    let leastAccessCount = Infinity;

    // Find least frequently used entry
    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < leastAccessCount) {
        leastAccessCount = entry.accessCount;
        leastUsedKey = key;
      }
    }

    if (leastUsedKey) {
      const entry = this.cache.get(leastUsedKey);
      if (entry) {
        this.cache.delete(leastUsedKey);
        this.updateSize(-entry.size);
        this.recordEviction(leastUsedKey);
        
        this.logger.debug('LFU eviction', {
          key: leastUsedKey,
          accessCount: leastAccessCount
        });
      }
    }
  }
}

/**
 * FIFO Cache implementation
 * Evicts oldest entries first
 */
export class FIFOCache<T> extends BaseCache<T> {
  private insertionOrder: string[] = [];

  public async set(key: string, value: T, ttl?: number): Promise<void> {
    await super.set(key, value, ttl);
    
    // Track insertion order
    if (!this.insertionOrder.includes(key)) {
      this.insertionOrder.push(key);
    }
  }

  protected async evictOne(): Promise<void> {
    if (this.insertionOrder.length === 0) {
      return;
    }

    const oldestKey = this.insertionOrder.shift();
    if (oldestKey) {
      const entry = this.cache.get(oldestKey);
      if (entry) {
        this.cache.delete(oldestKey);
        this.updateSize(-entry.size);
        this.recordEviction(oldestKey);
        
        this.logger.debug('FIFO eviction', { key: oldestKey });
      }
    }
  }

  public async clear(): Promise<void> {
    await super.clear();
    this.insertionOrder = [];
  }
}

/**
 * Cache factory for creating appropriate cache instances
 * Demonstrates Factory Pattern
 */
export class CacheFactory {
  public static createCache<T>(
    config: Partial<CacheConfig>,
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ): BaseCache<T> {
    const evictionPolicy = config.evictionPolicy || 'LRU';

    switch (evictionPolicy) {
      case 'LRU':
        return new LRUCache<T>(config, logger, metrics);
      case 'LFU':
        return new LFUCache<T>(config, logger, metrics);
      case 'FIFO':
        return new FIFOCache<T>(config, logger, metrics);
      default:
        throw new Error(`Unsupported eviction policy: ${evictionPolicy}`);
    }
  }
}

/**
 * Multi-level cache for hierarchical caching
 * Demonstrates Composite Pattern
 */
export class MultiLevelCache<T> {
  private levels: BaseCache<T>[];
  private logger: IStructuredLogger;

  constructor(levels: BaseCache<T>[], logger: IStructuredLogger) {
    this.levels = levels;
    this.logger = logger;
  }

  public async get(key: string): Promise<T | null> {
    // Try each level in order
    for (let i = 0; i < this.levels.length; i++) {
      const value = await this.levels[i].get(key);
      
      if (value !== null) {
        // Promote to higher levels
        for (let j = 0; j < i; j++) {
          await this.levels[j].set(key, value);
        }
        return value;
      }
    }

    return null;
  }

  public async set(key: string, value: T, ttl?: number): Promise<void> {
    // Set in all levels
    await Promise.all(
      this.levels.map(level => level.set(key, value, ttl))
    );
  }

  public async delete(key: string): Promise<void> {
    // Delete from all levels
    await Promise.all(
      this.levels.map(level => level.delete(key))
    );
  }

  public async clear(): Promise<void> {
    // Clear all levels
    await Promise.all(
      this.levels.map(level => level.clear())
    );
  }
}
