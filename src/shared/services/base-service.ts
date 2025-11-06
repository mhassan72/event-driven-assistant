/**
 * Base Service Class
 * Provides common service functionality following DRY principles and SOLID principles
 */

import { IStructuredLogger } from '../observability/logger';
import { IMetricsCollector } from '../observability/metrics';

/**
 * Base service class to eliminate code duplication in service implementations
 */
export abstract class BaseService {
  protected logger: IStructuredLogger;
  protected metrics: IMetricsCollector;

  constructor(
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ) {
    this.logger = logger;
    this.metrics = metrics;
  }

  /**
   * Generic method to execute operations with logging and metrics
   */
  protected async executeWithMetrics<T>(
    operationName: string,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      this.logger.debug(`Starting operation: ${operationName}`, metadata);
      this.metrics.incrementCounter(`${operationName}.started`);
      
      const result = await operation();
      
      const duration = Date.now() - startTime;
      this.logger.debug(`Completed operation: ${operationName}`, { ...metadata, duration });
      this.metrics.incrementCounter(`${operationName}.success`);
      this.metrics.recordValue(`${operationName}.duration`, duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed operation: ${operationName}`, { ...metadata, error, duration });
      this.metrics.incrementCounter(`${operationName}.failure`);
      this.metrics.recordValue(`${operationName}.duration`, duration);
      
      throw error;
    }
  }

  /**
   * Generic validation method
   */
  protected validateRequired(value: any, fieldName: string): void {
    if (value === null || value === undefined || value === '') {
      throw new Error(`${fieldName} is required`);
    }
  }

  /**
   * Generic method to validate multiple required fields
   */
  protected validateRequiredFields(data: Record<string, any>, requiredFields: string[]): void {
    const missingFields = requiredFields.filter(field => 
      data[field] === null || data[field] === undefined || data[field] === ''
    );
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
  }

  /**
   * Generic method to sanitize input data
   */
  protected sanitizeInput(input: string): string {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/[<>]/g, '');
  }

  /**
   * Generic method to handle service errors
   */
  protected handleServiceError(error: any, context: string): never {
    if (error instanceof Error) {
      this.logger.error(`Service error in ${context}:`, { error: error.message, stack: error.stack });
    } else {
      this.logger.error(`Unknown service error in ${context}:`, { error });
    }
    
    throw error;
  }

  /**
   * Generic method to format response data
   */
  protected formatResponse<T>(data: T, metadata?: Record<string, any>): { data: T; metadata?: Record<string, any> } {
    return {
      data,
      ...(metadata && { metadata })
    };
  }

  /**
   * Generic method to paginate results
   */
  protected paginateResults<T>(
    items: T[],
    page: number = 1,
    limit: number = 10
  ): { items: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } } {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedItems = items.slice(startIndex, endIndex);
    
    return {
      items: paginatedItems,
      pagination: {
        page,
        limit,
        total: items.length,
        totalPages: Math.ceil(items.length / limit)
      }
    };
  }

  /**
   * Generic method to retry operations
   */
  protected async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          break;
        }
        
        this.logger.warn(`Operation failed, retrying (${attempt}/${maxRetries})`, { error });
        await this.delay(delay * attempt); // Exponential backoff
      }
    }
    
    throw lastError;
  }

  /**
   * Utility method to create delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generic method to validate email format
   */
  protected isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Generic method to generate unique IDs
   */
  protected generateId(): string {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  /**
   * Generic method to format dates consistently
   */
  protected formatDate(date: Date): string {
    return date.toISOString();
  }

  /**
   * Generic method to calculate percentage
   */
  protected calculatePercentage(value: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((value / total) * 100 * 100) / 100; // Round to 2 decimal places
  }
}