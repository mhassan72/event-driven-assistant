/**
 * Error Handling Module
 * Comprehensive error handling system with classification, circuit breakers, retry mechanisms, and DLQ
 */

// Error categories and classification
export {
  ErrorSeverity,
  ErrorCategory,
  RecoveryStrategy,
  CategorizedError,
  ErrorClassificationRule,
  ErrorClassifier,
  createCategorizedError,
  ERROR_CLASSIFICATION_RULES
} from './error-categories';

// Circuit breaker
export {
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerStats,
  CircuitBreakerResult,
  CircuitBreaker,
  CircuitBreakerManager
} from './circuit-breaker';

// Retry mechanism
export {
  RetryPolicy,
  RetryAttempt,
  RetryResult,
  RetryExecutor,
  RetryManager,
  DEFAULT_RETRY_POLICIES,
  retryWithBackoff
} from './retry-mechanism';

// Dead letter queue
export {
  DLQItem,
  DLQStatus,
  DLQPriority,
  DLQRetryPolicy,
  DLQRecoveryAttempt,
  DLQRecoveryMethod,
  DLQProcessingResult,
  DLQFilter,
  DLQStats,
  DeadLetterQueueManager,
  DLQRecoveryHandler,
  DLQRecoveryResult
} from './dead-letter-queue';

// Comprehensive error handler
export {
  ErrorHandlingConfig,
  ErrorHandlingResult,
  OperationContext,
  ComprehensiveErrorHandler,
  initializeGlobalErrorHandler,
  getGlobalErrorHandler,
  handleWithErrorRecovery
} from './comprehensive-error-handler';

// Re-export existing error types for backward compatibility
export {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InternalServerError,
  errorHandler,
  asyncHandler
} from '../../api/middleware/error-handling';