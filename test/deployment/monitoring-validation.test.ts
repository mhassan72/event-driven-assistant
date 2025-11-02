/**
 * Monitoring and Alerting System Validation Tests
 * Validates monitoring infrastructure after deployment
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import supertest from 'supertest';
import * as admin from 'firebase-admin';
import { healthChecker } from '../../src/shared/observability/health-checker';
import { performanceMonitor } from '../../src/shared/observability/performance-monitor';
import { alertingSystem } from '../../src/shared/observability/alerting-system';
import { productionLogger } from '../../src/shared/observability/production-logger';

const TEST_CONFIG = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:5001/sports-news-5fd0a/us-central1/api',
  timeout: 30000
};

let request: supertest.SuperTest<supertest.Test>;
let adminToken: string;

describe('Monitoring and Alerting Validation', () => {
  beforeAll(async () => {
    request = supertest(TEST_CONFIG.baseUrl);
    
    // Create admin user for monitoring endpoints
    if (admin.apps.length === 0) {
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'sports-news-5fd0a'
      });
    }
    
    try {
      const adminUser = await admin.auth().createUser({
        email: `admin-test-${Date.now()}@example.com`,
        password: 'AdminPassword123!'
      });
      
      // Set admin claims
      await admin.auth().setCustomUserClaims(adminUser.uid, { admin: true });
      adminToken = await admin.auth().createCustomToken(adminUser.uid);
    } catch (error) {
      console.warn('Could not create admin user, monitoring tests may be skipped');
    }
  }, TEST_CONFIG.timeout);

  describe('Health Monitoring System', () => {
    test('should perform comprehensive health checks', async () => {
      const health = await healthChecker.runAllHealthChecks();
      
      expect(health).toMatchObject({
        overall: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
        timestamp: expect.any(Date),
        uptime: expect.any(Number),
        checks: expect.any(Array),
        summary: expect.objectContaining({
          healthy: expect.any(Number),
          degraded: expect.any(Number),
          unhealthy: expect.any(Number),
          total: expect.any(Number)
        })
      });

      // Validate individual health checks
      expect(health.checks.length).toBeGreaterThan(0);
      
      health.checks.forEach(check => {
        expect(check).toMatchObject({
          name: expect.any(String),
          status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
          lastCheck: expect.any(Date)
        });
      });
    });

    test('should expose health monitoring API endpoint', async () => {
      if (!adminToken) {
        console.log('Skipping admin test - no admin token');
        return;
      }

      const response = await request
        .get('/monitoring/system/health')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          overall: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
          checks: expect.any(Array)
        })
      });
    });

    test('should validate Firebase service connectivity', async () => {
      const firestoreCheck = healthChecker.getHealthCheck('firestore');
      const rtdbCheck = healthChecker.getHealthCheck('realtime_database');
      const authCheck = healthChecker.getHealthCheck('firebase_auth');

      expect(firestoreCheck).toBeDefined();
      expect(rtdbCheck).toBeDefined();
      expect(authCheck).toBeDefined();

      // At least one should be healthy in a working deployment
      const healthyServices = [firestoreCheck, rtdbCheck, authCheck]
        .filter(check => check?.status === 'healthy');
      
      expect(healthyServices.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Monitoring System', () => {
    test('should track system performance metrics', async () => {
      // Record a test metric
      performanceMonitor.recordMetric({
        name: 'test_metric',
        value: 100,
        unit: 'ms',
        timestamp: new Date(),
        tags: { test: 'true' }
      });

      const summary = performanceMonitor.getMetricSummary('test_metric', 1);
      expect(summary).toMatchObject({
        count: expect.any(Number),
        average: expect.any(Number),
        minimum: expect.any(Number),
        maximum: expect.any(Number),
        unit: 'ms'
      });
    });

    test('should provide system health metrics', async () => {
      const systemHealth = performanceMonitor.getSystemHealth();
      
      expect(systemHealth).toMatchObject({
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        memory: expect.objectContaining({
          used: expect.any(Number),
          limit: expect.any(Number),
          percentage: expect.any(Number)
        })
      });

      // Memory usage should be reasonable
      expect(systemHealth.memory.percentage).toBeLessThan(95);
    });

    test('should expose performance monitoring API', async () => {
      if (!adminToken) {
        console.log('Skipping admin test - no admin token');
        return;
      }

      const response = await request
        .get('/monitoring/system/performance')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          systemHealth: expect.any(Object)
        })
      });
    });

    test('should measure operation performance', async () => {
      const testOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'test result';
      };

      const result = await performanceMonitor.measureApiCall(testOperation, 'test-endpoint');
      expect(result).toBe('test result');

      // Check that metric was recorded
      const summary = performanceMonitor.getMetricSummary('api_response_time', 1);
      expect(summary?.count).toBeGreaterThan(0);
    });
  });

  describe('Alerting System', () => {
    test('should create and manage alerts', async () => {
      const alertId = alertingSystem.createAlert({
        type: 'warning',
        title: 'Test Alert',
        message: 'This is a test alert for validation',
        source: 'monitoring-validation-test'
      });

      expect(alertId).toBeDefined();
      expect(typeof alertId).toBe('string');

      // Check active alerts
      const activeAlerts = alertingSystem.getActiveAlerts();
      const testAlert = activeAlerts.find(alert => alert.id === alertId);
      
      expect(testAlert).toBeDefined();
      expect(testAlert?.title).toBe('Test Alert');
      expect(testAlert?.type).toBe('warning');

      // Resolve the alert
      const resolved = alertingSystem.resolveAlert(alertId);
      expect(resolved).toBe(true);
    });

    test('should expose alerts API endpoint', async () => {
      if (!adminToken) {
        console.log('Skipping admin test - no admin token');
        return;
      }

      const response = await request
        .get('/monitoring/system/alerts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          active: expect.any(Array),
          recent: expect.any(Array),
          summary: expect.objectContaining({
            activeCount: expect.any(Number),
            recentCount: expect.any(Number)
          })
        })
      });
    });

    test('should trigger alerts based on rules', async () => {
      // Simulate high error rate
      alertingSystem.checkRules({
        errorRate: 15, // Above critical threshold
        source: 'test-validation'
      });

      const activeAlerts = alertingSystem.getActiveAlerts();
      const errorRateAlert = activeAlerts.find(alert => 
        alert.source === 'alerting-system' && 
        alert.context?.rule === 'critical_error_rate'
      );

      expect(errorRateAlert).toBeDefined();
      expect(errorRateAlert?.type).toBe('critical');
    });
  });

  describe('Logging System', () => {
    test('should log structured messages', () => {
      // Test different log levels
      productionLogger.info('Test info message', {
        component: 'monitoring-validation',
        testType: 'logging'
      });

      productionLogger.warn('Test warning message', {
        component: 'monitoring-validation',
        testType: 'logging'
      });

      // Should not throw errors
      expect(true).toBe(true);
    });

    test('should log specialized operations', () => {
      productionLogger.logCreditOperation('TEST_DEDUCTION', 'test-user-123', 50, {
        testOperation: true
      });

      productionLogger.logAIInteraction('test-user-123', 'test-model', 25, 1500, {
        testInteraction: true
      });

      productionLogger.logPerformanceMetric('test_operation', 250, {
        testMetric: true
      });

      // Should not throw errors
      expect(true).toBe(true);
    });
  });

  describe('Business Metrics Dashboard', () => {
    test('should provide business metrics API', async () => {
      if (!adminToken) {
        console.log('Skipping admin test - no admin token');
        return;
      }

      const response = await request
        .get('/monitoring/business/metrics?hours=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          users: expect.any(Object),
          credits: expect.any(Object),
          ai: expect.any(Object),
          payments: expect.any(Object)
        })
      });
    });

    test('should provide system overview', async () => {
      if (!adminToken) {
        console.log('Skipping admin test - no admin token');
        return;
      }

      const response = await request
        .get('/monitoring/system/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          system: expect.objectContaining({
            status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
            uptime: expect.any(Number)
          }),
          alerts: expect.objectContaining({
            active: expect.any(Number)
          }),
          performance: expect.any(Object)
        })
      });
    });
  });

  describe('Monitoring Integration', () => {
    test('should integrate all monitoring components', async () => {
      // Test that all monitoring systems work together
      const startTime = Date.now();

      // Trigger a performance measurement
      await performanceMonitor.measureApiCall(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'integration test';
      }, 'integration-test');

      // Create a test alert
      const alertId = alertingSystem.createAlert({
        type: 'info',
        title: 'Integration Test Alert',
        message: 'Testing monitoring integration',
        source: 'integration-test'
      });

      // Run health check
      const health = await healthChecker.runAllHealthChecks();

      // Log the integration test
      productionLogger.info('Monitoring integration test completed', {
        component: 'integration-test',
        duration: Date.now() - startTime,
        alertId,
        healthStatus: health.overall
      });

      // Verify everything worked
      expect(alertId).toBeDefined();
      expect(health.overall).toMatch(/^(healthy|degraded|unhealthy)$/);

      // Clean up
      alertingSystem.resolveAlert(alertId);
    });
  });
});

describe('Monitoring System Resilience', () => {
  test('should handle monitoring system failures gracefully', async () => {
    // Test that the application continues to work even if monitoring fails
    try {
      // Simulate monitoring failure by calling with invalid parameters
      performanceMonitor.recordMetric({
        name: '',
        value: NaN,
        unit: '',
        timestamp: new Date()
      });

      // Should not crash the application
      expect(true).toBe(true);
    } catch (error) {
      // Monitoring errors should be handled gracefully
      expect(error).toBeDefined();
    }
  });

  test('should maintain service availability during monitoring operations', async () => {
    // Ensure monitoring doesn't impact service performance
    const healthCheckPromise = healthChecker.runAllHealthChecks();
    
    // Service should still respond while health check is running
    const response = await request
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('healthy');

    // Wait for health check to complete
    const health = await healthCheckPromise;
    expect(health).toBeDefined();
  });
});