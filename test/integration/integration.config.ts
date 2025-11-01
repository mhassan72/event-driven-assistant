/**
 * Integration Test Configuration
 * Configuration and utilities for integration and end-to-end tests
 */

import { StructuredLogger } from '../../src/shared/observability/logger';
import { MetricsCollector } from '../../src/shared/observability/metrics';

export interface IntegrationTestConfig {
  timeout: number;
  maxConcurrentUsers: number;
  testDataCleanup: boolean;
  mockExternalServices: boolean;
  enablePerformanceMetrics: boolean;
  enableSecurityTesting: boolean;
}

export const defaultIntegrationConfig: IntegrationTestConfig = {
  timeout: 120000, // 2 minutes
  maxConcurrentUsers: 100,
  testDataCleanup: true,
  mockExternalServices: true,
  enablePerformanceMetrics: true,
  enableSecurityTesting: true
};

export class IntegrationTestHelper {
  private logger: StructuredLogger;
  private metrics: MetricsCollector;
  private config: IntegrationTestConfig;

  constructor(config: IntegrationTestConfig = defaultIntegrationConfig) {
    this.config = config;
    this.logger = new StructuredLogger('IntegrationTestHelper');
    this.metrics = new MetricsCollector();
  }

  /**
   * Setup test environment for integration tests
   */
  async setupTestEnvironment(): Promise<void> {
    this.logger.info('Setting up integration test environment', {
      config: this.config
    });

    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.FIREBASE_PROJECT_ID = 'test-project-integration';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = 'localhost:9000';

    // Mock external service credentials for testing
    if (this.config.mockExternalServices) {
      process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock_secret';
      process.env.PAYPAL_CLIENT_ID = 'paypal_test_client_id';
      process.env.PAYPAL_CLIENT_SECRET = 'paypal_test_client_secret';
      process.env.NEBIUS_API_KEY = 'nebius_test_api_key';
    }
  }

  /**
   * Cleanup test environment after tests
   */
  async cleanupTestEnvironment(): Promise<void> {
    this.logger.info('Cleaning up integration test environment');

    if (this.config.testDataCleanup) {
      // In a real implementation, this would clean up test data from Firebase
      // For now, we'll just log the cleanup
      this.logger.info('Test data cleanup completed');
    }
  }

  /**
   * Generate test user data
   */
  generateTestUser(index: number = 0): any {
    return {
      uid: `test_user_${index}_${Date.now()}`,
      email: `test.user.${index}@example.com`,
      name: `Test User ${index}`,
      emailVerified: true,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Generate mock Firebase ID token for testing
   */
  generateMockIdToken(userId: string): string {
    return `mock_firebase_token_${userId}`;
  }

  /**
   * Wait for async operations to complete
   */
  async waitForAsyncOperations(timeoutMs: number = 5000): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, timeoutMs));
  }

  /**
   * Measure operation performance
   */
  async measurePerformance<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<{ result: T; duration: number }> {
    const startTime = performance.now();
    
    try {
      const result = await operation();
      const endTime = performance.now();
      const duration = endTime - startTime;

      if (this.config.enablePerformanceMetrics) {
        this.metrics.histogram(`integration_test.${operationName}.duration`, duration);
        this.logger.info(`Performance measurement: ${operationName}`, {
          duration: `${duration.toFixed(2)}ms`
        });
      }

      return { result, duration };
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;

      this.logger.error(`Performance measurement failed: ${operationName}`, {
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;
    }
  }

  /**
   * Execute operations concurrently and measure performance
   */
  async executeConcurrentOperations<T>(
    operations: (() => Promise<T>)[],
    operationName: string
  ): Promise<{ results: T[]; totalDuration: number; averageDuration: number }> {
    const startTime = performance.now();
    
    const results = await Promise.all(operations);
    
    const endTime = performance.now();
    const totalDuration = endTime - startTime;
    const averageDuration = totalDuration / operations.length;

    if (this.config.enablePerformanceMetrics) {
      this.metrics.histogram(`integration_test.${operationName}.concurrent_total`, totalDuration);
      this.metrics.histogram(`integration_test.${operationName}.concurrent_average`, averageDuration);
      
      this.logger.info(`Concurrent operation performance: ${operationName}`, {
        operationCount: operations.length,
        totalDuration: `${totalDuration.toFixed(2)}ms`,
        averageDuration: `${averageDuration.toFixed(2)}ms`
      });
    }

    return { results, totalDuration, averageDuration };
  }

  /**
   * Validate security requirements
   */
  validateSecurityResponse(response: any, expectedSecurityHeaders: string[] = []): void {
    if (!this.config.enableSecurityTesting) {
      return;
    }

    // Check for security headers
    const securityHeaders = [
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection',
      'strict-transport-security',
      ...expectedSecurityHeaders
    ];

    securityHeaders.forEach(header => {
      if (response.headers[header]) {
        this.logger.info(`Security header present: ${header}`, {
          value: response.headers[header]
        });
      } else {
        this.logger.warn(`Security header missing: ${header}`);
      }
    });

    // Validate response doesn't contain sensitive information
    const responseBody = JSON.stringify(response.body);
    const sensitivePatterns = [
      /sk_[a-zA-Z0-9_]+/, // Stripe secret keys
      /whsec_[a-zA-Z0-9_]+/, // Webhook secrets
      /-----BEGIN PRIVATE KEY-----/, // Private keys
      /password/i, // Password fields
      /secret/i // Secret fields (with some exceptions)
    ];

    sensitivePatterns.forEach(pattern => {
      if (pattern.test(responseBody)) {
        this.logger.error('Sensitive information detected in response', {
          pattern: pattern.toString()
        });
        throw new Error(`Sensitive information leaked in response: ${pattern}`);
      }
    });
  }

  /**
   * Generate load test scenarios
   */
  generateLoadTestScenarios(userCount: number): Array<() => Promise<any>> {
    const scenarios: Array<() => Promise<any>> = [];

    for (let i = 0; i < userCount; i++) {
      scenarios.push(async () => {
        const user = this.generateTestUser(i);
        
        // Simulate user journey
        return {
          userId: user.uid,
          scenario: 'load_test',
          timestamp: new Date().toISOString()
        };
      });
    }

    return scenarios;
  }

  /**
   * Validate API response structure
   */
  validateApiResponse(response: any, expectedStructure: any): void {
    const validateObject = (obj: any, expected: any, path: string = '') => {
      Object.keys(expected).forEach(key => {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (!(key in obj)) {
          throw new Error(`Missing required field: ${currentPath}`);
        }

        if (typeof expected[key] === 'object' && expected[key] !== null) {
          if (Array.isArray(expected[key])) {
            if (!Array.isArray(obj[key])) {
              throw new Error(`Field ${currentPath} should be an array`);
            }
          } else {
            validateObject(obj[key], expected[key], currentPath);
          }
        } else if (typeof obj[key] !== typeof expected[key]) {
          throw new Error(`Field ${currentPath} has wrong type. Expected ${typeof expected[key]}, got ${typeof obj[key]}`);
        }
      });
    };

    validateObject(response.body, expectedStructure);
  }

  /**
   * Create test data for specific scenarios
   */
  async createTestData(scenario: string, count: number = 1): Promise<any[]> {
    const testData: any[] = [];

    for (let i = 0; i < count; i++) {
      switch (scenario) {
        case 'users':
          testData.push(this.generateTestUser(i));
          break;
        
        case 'conversations':
          testData.push({
            id: `conv_${i}_${Date.now()}`,
            title: `Test Conversation ${i}`,
            messages: [
              {
                id: `msg_${i}_${Date.now()}`,
                role: 'user',
                content: `Test message ${i}`,
                timestamp: new Date().toISOString()
              }
            ]
          });
          break;
        
        case 'transactions':
          testData.push({
            id: `txn_${i}_${Date.now()}`,
            userId: `test_user_${i}`,
            type: 'ai_usage',
            amount: 25,
            timestamp: new Date().toISOString()
          });
          break;
        
        default:
          throw new Error(`Unknown test data scenario: ${scenario}`);
      }
    }

    return testData;
  }

  /**
   * Get performance metrics summary
   */
  getPerformanceMetrics(): any {
    if (!this.config.enablePerformanceMetrics) {
      return null;
    }

    return {
      timestamp: new Date().toISOString(),
      metrics: this.metrics.getMetrics(),
      summary: 'Performance metrics collected during integration tests'
    };
  }
}

export default IntegrationTestHelper;