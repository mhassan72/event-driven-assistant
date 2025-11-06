/**
 * Base Analytics Service
 * Provides common functionality for analytics services following DRY principles
 */

import { TimeRange, TimeGranularity } from '../types';
import { IStructuredLogger } from '../observability/logger';
import * as admin from 'firebase-admin';

/**
 * Base class for analytics services to eliminate code duplication
 */
export abstract class BaseAnalyticsService {
  protected firestore: admin.firestore.Firestore;
  protected logger: IStructuredLogger;

  constructor(
    firestore: admin.firestore.Firestore,
    logger: IStructuredLogger
  ) {
    this.firestore = firestore;
    this.logger = logger;
  }

  /**
   * Creates a default time range (30 days) to avoid duplication
   */
  protected createDefaultTimeRange(): TimeRange {
    return {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      endDate: new Date(),
      granularity: TimeGranularity.DAY
    };
  }

  /**
   * Gets the effective time range (provided or default)
   */
  protected getEffectiveTimeRange(timeRange?: TimeRange): TimeRange {
    return timeRange || this.createDefaultTimeRange();
  }

  /**
   * Generic method to query a collection with time range filtering
   */
  protected async queryCollectionByTimeRange(
    collectionName: string,
    timeRange: TimeRange,
    additionalFilters?: Array<{ field: string; operator: FirebaseFirestore.WhereFilterOp; value: any }>
  ): Promise<any[]> {
    try {
      let query = this.firestore
        .collection(collectionName)
        .where('timestamp', '>=', timeRange.startDate)
        .where('timestamp', '<=', timeRange.endDate);

      // Apply additional filters if provided
      if (additionalFilters) {
        additionalFilters.forEach(filter => {
          query = query.where(filter.field, filter.operator, filter.value);
        });
      }

      const snapshot = await query.orderBy('timestamp', 'desc').get();
      return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      this.logger.error(`Error querying collection ${collectionName}:`, { error, timeRange });
      throw error;
    }
  }

  /**
   * Generic method to aggregate numeric values from a collection
   */
  protected aggregateNumericField(
    data: any[],
    field: string,
    filterFn?: (item: any) => boolean
  ): number {
    const filteredData = filterFn ? data.filter(filterFn) : data;
    return filteredData.reduce((sum, item) => sum + (item[field] || 0), 0);
  }

  /**
   * Generic method to count unique values in a field
   */
  protected countUniqueValues(data: any[], field: string): number {
    const uniqueValues = new Set(data.map(item => item[field]));
    return uniqueValues.size;
  }

  /**
   * Generic method to group data by a field
   */
  protected groupByField(data: any[], field: string): Record<string, any[]> {
    return data.reduce((groups, item) => {
      const key = item[field];
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
      return groups;
    }, {} as Record<string, any[]>);
  }

  /**
   * Generic error handling wrapper for analytics methods
   */
  protected async executeAnalyticsMethod<T>(
    methodName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    try {
      this.logger.debug(`Executing analytics method: ${methodName}`);
      const result = await operation();
      this.logger.debug(`Completed analytics method: ${methodName}`);
      return result;
    } catch (error) {
      this.logger.error(`Error in analytics method ${methodName}:`, { error });
      throw error;
    }
  }

  /**
   * Calculate percentage change between two values
   */
  protected calculatePercentageChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  /**
   * Calculate average of numeric values
   */
  protected calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  /**
   * Get data for comparison period (e.g., previous month for trend analysis)
   */
  protected getComparisonTimeRange(timeRange: TimeRange): TimeRange {
    const duration = timeRange.endDate.getTime() - timeRange.startDate.getTime();
    return {
      startDate: new Date(timeRange.startDate.getTime() - duration),
      endDate: timeRange.startDate,
      granularity: timeRange.granularity
    };
  }
}