/**
 * Error Type Guards and Utilities
 * Provides comprehensive type safety for error handling throughout the application
 */

/**
 * Base error interface for all application errors
 */
export interface BaseError {
  name: string;
  message: string;
  code?: string;
  stack?: string;
  timestamp?: number;
  context?: Record<string, any>;
}

/**
 * Application-specific error types
 */
export interface ApplicationError extends BaseError {
  code: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  retryable: boolean;
  userMessage?: string;
}

/**
 * Firebase-specific error interface
 */
export interface FirebaseError extends BaseError {
  code: string;
  details?: any;
}

/**
 * Network error interface
 */
export interface NetworkError extends BaseError {
  statusCode?: number;
  response?: any;
  timeout?: boolean;
}

/**
 * Validation error interface
 */
export interface ValidationError extends BaseError {
  field?: string;
  value?: any;
  constraints?: string[];
}

/**
 * Type guard to check if error is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard to check if error is an ApplicationError
 */
export function isApplicationError(error: unknown): error is ApplicationError {
  return (
    isError(error) &&
    'code' in error &&
    'severity' in error &&
    'retryable' in error &&
    typeof (error as any).code === 'string' &&
    typeof (error as any).severity === 'string' &&
    typeof (error as any).retryable === 'boolean'
  );
}

/**
 * Type guard to check if error is a FirebaseError
 */
export function isFirebaseError(error: unknown): error is FirebaseError {
  return (
    isError(error) &&
    'code' in error &&
    typeof (error as any).code === 'string' &&
    ((error as any).code.startsWith('auth/') || 
     (error as any).code.startsWith('firestore/') ||
     (error as any).code.startsWith('functions/') ||
     (error as any).code.startsWith('storage/'))
  );
}

/**
 * Type guard to check if error is a NetworkError
 */
export function isNetworkError(error: unknown): error is NetworkError {
  return (
    isError(error) &&
    ('statusCode' in error || 'response' in error || 'timeout' in error)
  );
}

/**
 * Type guard to check if error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return (
    isError(error) &&
    ('field' in error || 'constraints' in error)
  );
}

/**
 * Extract error message safely from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as any).message);
  }
  
  return 'Unknown error occurred';
}

/**
 * Extract error code safely from unknown error
 */
export function getErrorCode(error: unknown): string {
  if (isApplicationError(error) || isFirebaseError(error)) {
    return error.code;
  }
  
  if (isError(error) && 'code' in error) {
    return String((error as any).code);
  }
  
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as any).code);
  }
  
  return 'UNKNOWN_ERROR';
}

/**
 * Extract error stack trace safely from unknown error
 */
export function getErrorStack(error: unknown): string | undefined {
  if (isError(error)) {
    return error.stack;
  }
  
  if (error && typeof error === 'object' && 'stack' in error) {
    return String((error as any).stack);
  }
  
  return undefined;
}

/**
 * Create comprehensive error context for logging
 */
export function getErrorContext(error: unknown): Record<string, any> {
  const context: Record<string, any> = {
    message: getErrorMessage(error),
    code: getErrorCode(error),
    timestamp: Date.now()
  };
  
  const stack = getErrorStack(error);
  if (stack) {
    context.stack = stack;
  }
  
  if (isApplicationError(error)) {
    context.severity = error.severity;
    context.retryable = error.retryable;
    context.userMessage = error.userMessage;
    context.context = error.context;
  }
  
  if (isFirebaseError(error)) {
    context.details = error.details;
    context.type = 'firebase';
  }
  
  if (isNetworkError(error)) {
    context.statusCode = error.statusCode;
    context.timeout = error.timeout;
    context.type = 'network';
  }
  
  if (isValidationError(error)) {
    context.field = error.field;
    context.value = error.value;
    context.constraints = error.constraints;
    context.type = 'validation';
  }
  
  if (isError(error)) {
    context.name = error.name;
    context.type = context.type || 'standard';
  } else {
    context.type = 'unknown';
    context.rawError = String(error);
  }
  
  return context;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (isApplicationError(error)) {
    return error.retryable;
  }
  
  const errorMessage = getErrorMessage(error).toLowerCase();
  const errorCode = getErrorCode(error).toLowerCase();
  
  // Network-related retryable errors
  const retryablePatterns = [
    'network',
    'timeout',
    'econnreset',
    'econnrefused',
    'etimedout',
    'enotfound',
    'rate_limit',
    'service_unavailable',
    'internal_server_error',
    'temporary',
    'unavailable'
  ];
  
  // Firebase retryable errors
  const retryableFirebaseCodes = [
    'unavailable',
    'deadline-exceeded',
    'resource-exhausted',
    'internal',
    'cancelled'
  ];
  
  return (
    retryablePatterns.some(pattern => 
      errorMessage.includes(pattern) || errorCode.includes(pattern)
    ) ||
    retryableFirebaseCodes.some(code => errorCode.includes(code)) ||
    (isNetworkError(error) && 
     error.statusCode && 
     error.statusCode >= 500 && 
     error.statusCode < 600)
  );
}

/**
 * Determine error severity
 */
export function getErrorSeverity(error: unknown): 'low' | 'medium' | 'high' | 'critical' {
  if (isApplicationError(error)) {
    return error.severity;
  }
  
  const errorCode = getErrorCode(error).toLowerCase();
  const errorMessage = getErrorMessage(error).toLowerCase();
  
  // Critical errors
  if (
    errorCode.includes('security') ||
    errorCode.includes('auth') ||
    errorMessage.includes('security') ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('forbidden')
  ) {
    return 'critical';
  }
  
  // High severity errors
  if (
    errorCode.includes('database') ||
    errorCode.includes('firestore') ||
    errorMessage.includes('database') ||
    errorMessage.includes('connection')
  ) {
    return 'high';
  }
  
  // Medium severity errors
  if (
    errorCode.includes('validation') ||
    errorCode.includes('invalid') ||
    errorMessage.includes('validation') ||
    errorMessage.includes('invalid')
  ) {
    return 'medium';
  }
  
  // Default to medium for unknown errors
  return 'medium';
}

/**
 * Create user-friendly error message
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (isApplicationError(error) && error.userMessage) {
    return error.userMessage;
  }
  
  const errorCode = getErrorCode(error).toLowerCase();
  const errorMessage = getErrorMessage(error).toLowerCase();
  
  // Map common errors to user-friendly messages
  if (errorCode.includes('auth') || errorMessage.includes('unauthorized')) {
    return 'Authentication required. Please log in and try again.';
  }
  
  if (errorCode.includes('permission') || errorMessage.includes('forbidden')) {
    return 'You do not have permission to perform this action.';
  }
  
  if (errorCode.includes('not_found') || errorMessage.includes('not found')) {
    return 'The requested resource was not found.';
  }
  
  if (errorCode.includes('validation') || errorMessage.includes('invalid')) {
    return 'The provided data is invalid. Please check your input and try again.';
  }
  
  if (errorCode.includes('network') || errorMessage.includes('network')) {
    return 'Network error. Please check your connection and try again.';
  }
  
  if (errorCode.includes('timeout') || errorMessage.includes('timeout')) {
    return 'The request timed out. Please try again.';
  }
  
  if (errorCode.includes('rate_limit') || errorMessage.includes('rate limit')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  
  return 'An unexpected error occurred. Please try again later.';
}

/**
 * Sanitize error for client response (remove sensitive information)
 */
export function sanitizeErrorForClient(error: unknown): Record<string, any> {
  const context = getErrorContext(error);
  
  // Remove sensitive information
  const sanitized = {
    code: context.code,
    message: getUserFriendlyMessage(error),
    timestamp: context.timestamp,
    retryable: isRetryableError(error)
  };
  
  // Only include additional context for validation errors
  if (isValidationError(error)) {
    return {
      ...sanitized,
      field: context.field,
      constraints: context.constraints
    };
  }
  
  return sanitized;
}

/**
 * Convert unknown error to ApplicationError
 */
export function toApplicationError(
  error: unknown,
  code?: string,
  context?: Record<string, any>
): ApplicationError {
  if (isApplicationError(error)) {
    return error;
  }
  
  const message = getErrorMessage(error);
  const errorCode = code || getErrorCode(error);
  const severity = getErrorSeverity(error);
  const retryable = isRetryableError(error);
  
  const applicationError: ApplicationError = {
    name: 'ApplicationError',
    message,
    code: errorCode,
    severity,
    retryable,
    timestamp: Date.now(),
    context: {
      ...context,
      originalError: isError(error) ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    }
  };
  
  const stack = getErrorStack(error);
  if (stack) {
    applicationError.stack = stack;
  }
  
  return applicationError;
}