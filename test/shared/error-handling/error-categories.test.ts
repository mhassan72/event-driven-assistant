/**
 * Error Categories and Classification Tests
 */

import {
  ErrorSeverity,
  ErrorCategory,
  RecoveryStrategy,
  ErrorClassifier,
  createCategorizedError,
  ERROR_CLASSIFICATION_RULES
} from '../../../src/shared/error-handling/error-categories';

describe('Error Categories and Classification', () => {
  let errorClassifier: ErrorClassifier;

  beforeEach(() => {
    errorClassifier = new ErrorClassifier();
  });

  describe('ErrorClassifier', () => {
    it('should classify network errors correctly', () => {
      const networkError = new Error('ECONNREFUSED: Connection refused');
      const classification = errorClassifier.classify(networkError);

      expect(classification.category).toBe(ErrorCategory.NETWORK);
      expect(classification.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.retryable).toBe(true);
      expect(classification.recoveryStrategy).toBe(RecoveryStrategy.RETRY);
    });

    it('should classify rate limit errors correctly', () => {
      const rateLimitError = new Error('Too many requests');
      const classification = errorClassifier.classify(rateLimitError);

      expect(classification.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(classification.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.retryable).toBe(true);
      expect(classification.recoveryStrategy).toBe(RecoveryStrategy.RETRY);
    });

    it('should classify authentication errors correctly', () => {
      const authError = new Error('Unauthorized access');
      const classification = errorClassifier.classify(authError);

      expect(classification.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(classification.severity).toBe(ErrorSeverity.HIGH);
      expect(classification.retryable).toBe(false);
      expect(classification.recoveryStrategy).toBe(RecoveryStrategy.FAIL_FAST);
    });

    it('should classify validation errors correctly', () => {
      const validationError = new Error('Invalid input provided');
      const classification = errorClassifier.classify(validationError);

      expect(classification.category).toBe(ErrorCategory.VALIDATION);
      expect(classification.severity).toBe(ErrorSeverity.LOW);
      expect(classification.retryable).toBe(false);
      expect(classification.recoveryStrategy).toBe(RecoveryStrategy.FAIL_FAST);
    });

    it('should handle unknown errors with default classification', () => {
      const unknownError = new Error('Some unknown error');
      const classification = errorClassifier.classify(unknownError);

      expect(classification.category).toBe(ErrorCategory.SYSTEM_FAILURE);
      expect(classification.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classification.retryable).toBe(true);
      expect(classification.recoveryStrategy).toBe(RecoveryStrategy.RETRY);
    });

    it('should add custom classification rules', () => {
      errorClassifier.addRule({
        pattern: /custom.error/i,
        category: ErrorCategory.BUSINESS_LOGIC,
        severity: ErrorSeverity.HIGH,
        retryable: false,
        recoveryStrategy: RecoveryStrategy.MANUAL_INTERVENTION
      });

      const customError = new Error('Custom error occurred');
      const classification = errorClassifier.classify(customError);

      expect(classification.category).toBe(ErrorCategory.BUSINESS_LOGIC);
      expect(classification.severity).toBe(ErrorSeverity.HIGH);
      expect(classification.retryable).toBe(false);
    });

    it('should remove classification rules', () => {
      const pattern = /test.pattern/i;
      
      errorClassifier.addRule({
        pattern,
        category: ErrorCategory.BUSINESS_LOGIC,
        severity: ErrorSeverity.HIGH,
        retryable: false,
        recoveryStrategy: RecoveryStrategy.MANUAL_INTERVENTION
      });

      const removed = errorClassifier.removeRule(pattern);
      expect(removed).toBe(true);

      // Should not match the removed rule
      const testError = new Error('test pattern error');
      const classification = errorClassifier.classify(testError);
      expect(classification.category).not.toBe(ErrorCategory.BUSINESS_LOGIC);
    });
  });

  describe('createCategorizedError', () => {
    it('should create categorized error from string', () => {
      const errorMessage = 'Database connection failed';
      const categorizedError = createCategorizedError(errorMessage);

      expect(categorizedError.message).toBe(errorMessage);
      expect(categorizedError.id).toBeDefined();
      expect(categorizedError.timestamp).toBeInstanceOf(Date);
      expect(categorizedError.category).toBeDefined();
      expect(categorizedError.severity).toBeDefined();
    });

    it('should create categorized error from Error object', () => {
      const originalError = new Error('Network timeout');
      const categorizedError = createCategorizedError(originalError);

      expect(categorizedError.message).toBe(originalError.message);
      expect(categorizedError.originalError).toBe(originalError);
      expect(categorizedError.stackTrace).toBe(originalError.stack);
    });

    it('should apply custom context to categorized error', () => {
      const error = new Error('Test error');
      const context = {
        userId: 'user123',
        correlationId: 'corr456',
        severity: ErrorSeverity.CRITICAL,
        category: ErrorCategory.SECURITY_VIOLATION
      };

      const categorizedError = createCategorizedError(error, context);

      expect(categorizedError.userId).toBe(context.userId);
      expect(categorizedError.correlationId).toBe(context.correlationId);
      expect(categorizedError.severity).toBe(context.severity);
      expect(categorizedError.category).toBe(context.category);
    });

    it('should set operational flags correctly', () => {
      const validationError = new Error('Invalid input');
      const categorizedError = createCategorizedError(validationError);

      expect(categorizedError.isOperational).toBe(true);
      expect(categorizedError.requiresAlert).toBe(false);
      expect(categorizedError.requiresEscalation).toBe(false);
    });

    it('should set alert flags for critical errors', () => {
      const criticalError = new Error('System failure');
      const categorizedError = createCategorizedError(criticalError, {
        severity: ErrorSeverity.CRITICAL
      });

      expect(categorizedError.requiresAlert).toBe(true);
      expect(categorizedError.requiresEscalation).toBe(true);
    });
  });

  describe('ERROR_CLASSIFICATION_RULES', () => {
    it('should have valid classification rules', () => {
      expect(ERROR_CLASSIFICATION_RULES).toBeInstanceOf(Array);
      expect(ERROR_CLASSIFICATION_RULES.length).toBeGreaterThan(0);

      ERROR_CLASSIFICATION_RULES.forEach(rule => {
        expect(rule.pattern).toBeDefined();
        expect(rule.category).toBeDefined();
        expect(rule.severity).toBeDefined();
        expect(typeof rule.retryable).toBe('boolean');
        expect(rule.recoveryStrategy).toBeDefined();
      });
    });

    it('should cover common error patterns', () => {
      const patterns = ERROR_CLASSIFICATION_RULES.map(rule => rule.pattern);
      
      // Check for network error patterns
      const hasNetworkPattern = patterns.some(pattern => 
        pattern.toString().includes('ECONNREFUSED') || 
        pattern.toString().includes('ETIMEDOUT')
      );
      expect(hasNetworkPattern).toBe(true);

      // Check for auth error patterns
      const hasAuthPattern = patterns.some(pattern => 
        pattern.toString().includes('unauthorized') || 
        pattern.toString().includes('forbidden')
      );
      expect(hasAuthPattern).toBe(true);
    });
  });

  describe('Error Severity Levels', () => {
    it('should have all severity levels defined', () => {
      expect(ErrorSeverity.LOW).toBeDefined();
      expect(ErrorSeverity.MEDIUM).toBeDefined();
      expect(ErrorSeverity.HIGH).toBeDefined();
      expect(ErrorSeverity.CRITICAL).toBeDefined();
      expect(ErrorSeverity.FATAL).toBeDefined();
    });
  });

  describe('Error Categories', () => {
    it('should have comprehensive error categories', () => {
      const categories = Object.values(ErrorCategory);
      
      expect(categories).toContain(ErrorCategory.SYSTEM_FAILURE);
      expect(categories).toContain(ErrorCategory.NETWORK);
      expect(categories).toContain(ErrorCategory.AUTHENTICATION);
      expect(categories).toContain(ErrorCategory.VALIDATION);
      expect(categories).toContain(ErrorCategory.EXTERNAL_SERVICE);
      expect(categories).toContain(ErrorCategory.DATA_CORRUPTION);
      expect(categories).toContain(ErrorCategory.SECURITY_VIOLATION);
    });
  });

  describe('Recovery Strategies', () => {
    it('should have all recovery strategies defined', () => {
      const strategies = Object.values(RecoveryStrategy);
      
      expect(strategies).toContain(RecoveryStrategy.RETRY);
      expect(strategies).toContain(RecoveryStrategy.FALLBACK);
      expect(strategies).toContain(RecoveryStrategy.CIRCUIT_BREAKER);
      expect(strategies).toContain(RecoveryStrategy.COMPENSATION);
      expect(strategies).toContain(RecoveryStrategy.MANUAL_INTERVENTION);
      expect(strategies).toContain(RecoveryStrategy.GRACEFUL_DEGRADATION);
      expect(strategies).toContain(RecoveryStrategy.FAIL_FAST);
    });
  });
});