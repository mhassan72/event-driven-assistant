/**
 * Test Setup Configuration
 * Global test setup for Jest environment
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@test-project.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKB\nxIuOiQ4jofNjRbQlSdKn6krl7l1dqtdhhN39Q3yR58BdNpwZeI+DDMoQHuA==\n-----END PRIVATE KEY-----';
process.env.FIREBASE_DATABASE_URL = 'https://test-project.firebaseio.com';
process.env.FIREBASE_STORAGE_BUCKET = 'test-project.appspot.com';

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

// Global test timeout
jest.setTimeout(30000);

// Mock timers for consistent testing
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});