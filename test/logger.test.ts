/**
 * Logger Unit Tests
 * Tests for the structured logger functionality
 */

import { logger } from '../src/shared/observability/logger';

describe('Structured Logger', () => {
  // Mock console methods to capture output
  let consoleSpy: jest.SpyInstance;
  
  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'info').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('should log info messages with proper structure', () => {
    const testMessage = 'Test info message';
    const testContext = { userId: 'test-user-123', action: 'test-action' };

    logger.info(testMessage, testContext);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    
    const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(loggedData.level).toBe('info');
    expect(loggedData.message).toBe(testMessage);
    expect(loggedData.context).toEqual(testContext);
    expect(loggedData.timestamp).toBeDefined();
    expect(loggedData.service).toBe('integrated-credit-system');
  });

  test('should log error messages with error details', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    const testError = new Error('Test error');
    const testMessage = 'Test error occurred';

    logger.logError(testError, testMessage);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    
    const loggedData = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(loggedData.level).toBe('error');
    expect(loggedData.message).toBe(testMessage);
    expect(loggedData.context.error.name).toBe('Error');
    expect(loggedData.context.error.message).toBe('Test error');
    expect(loggedData.context.error.stack).toBeDefined();

    errorSpy.mockRestore();
  });

  test('should log debug messages only in non-production', () => {
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation();
    const originalEnv = process.env.NODE_ENV;
    
    // Create a new logger instance to test environment behavior
    const { logger: testLogger } = require('../src/shared/observability/logger');
    
    // Test in development mode
    process.env.NODE_ENV = 'development';
    // Force logger to re-read environment
    (testLogger as any).environment = 'development';
    testLogger.debug('Debug message');
    expect(debugSpy).toHaveBeenCalledTimes(1);

    debugSpy.mockClear();

    // Test in production mode
    process.env.NODE_ENV = 'production';
    // Force logger to re-read environment
    (testLogger as any).environment = 'production';
    testLogger.debug('Debug message');
    expect(debugSpy).toHaveBeenCalledTimes(0);

    // Restore environment
    process.env.NODE_ENV = originalEnv;
    (testLogger as any).environment = originalEnv || 'development';
    debugSpy.mockRestore();
  });

  test('should include service name and environment in all logs', () => {
    const testMessage = 'Service info test';

    logger.info(testMessage);

    const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(loggedData.service).toBe('integrated-credit-system');
    expect(loggedData.environment).toBeDefined();
  });
});