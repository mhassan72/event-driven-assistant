/**
 * Test Setup Configuration
 * Global test setup for Jest environment
 */

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@test-project.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKB\nxIuOiQ4jofNjRbQlSdKn6krl7l1dqtdhhN39Q3yR58BdNpwZeI+DDMoQHuA==\n-----END PRIVATE KEY-----';
process.env.FIREBASE_DATABASE_URL = 'https://test-project.firebaseio.com';
process.env.FIREBASE_STORAGE_BUCKET = 'test-project.appspot.com';

// Mock Firebase Admin
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn()
  },
  firestore: jest.fn(() => ({
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    add: jest.fn(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    runTransaction: jest.fn()
  })),
  database: jest.fn(() => ({
    ref: jest.fn().mockReturnThis(),
    once: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    on: jest.fn(),
    off: jest.fn()
  }))
}));

// Mock singleton services that start intervals to prevent open handles
jest.mock('../src/shared/observability/health-checker', () => ({
  HealthChecker: {
    getInstance: jest.fn(() => ({
      registerCheck: jest.fn(),
      runHealthCheck: jest.fn(),
      getHealthStatus: jest.fn(),
      stop: jest.fn()
    }))
  }
}));

jest.mock('../src/shared/observability/performance-monitor', () => ({
  PerformanceMonitor: {
    getInstance: jest.fn(() => ({
      recordMetric: jest.fn(),
      getMetrics: jest.fn(),
      stop: jest.fn()
    }))
  },
  performanceMonitor: {
    recordMetric: jest.fn(),
    getMetrics: jest.fn(),
    stop: jest.fn()
  }
}));

// Mock console methods to reduce noise in tests
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.warn = jest.fn();
console.error = jest.fn();

// Restore console methods after tests if needed
afterAll(() => {
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

// Set global test timeout (moved from jest config)
jest.setTimeout(30000);

// Global setup and cleanup
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});