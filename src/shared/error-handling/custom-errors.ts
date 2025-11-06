/**
 * Custom Error Classes
 * Implements error class hierarchies following OOP principles
 */

import { ApplicationError } from './error-type-guards';

/**
 * Base application error class
 */
export abstract class BaseApplicationError extends Error implements ApplicationError {
  public readonly code: string;
  public readonly severity: 'low' | 'medium' | 'high' | 'critical';
  public readonly retryable: boolean;
  public readonly timestamp: number;
  public readonly context?: Record<string, any>;
  public readonly userMessage?: string;

  constructor(
    message: string,
    code: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    retryable: boolean = false,
    userMessage?: string,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.severity = severity;
    this.retryable = retryable;
    this.timestamp = Date.now();
    this.userMessage = userMessage;
    this.context = context;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      retryable: this.retryable,
      timestamp: this.timestamp,
      userMessage: this.userMessage,
      context: this.context,
      stack: this.stack
    };
  }

  /**
   * Get user-friendly representation
   */
  toUserError(): Record<string, any> {
    return {
      code: this.code,
      message: this.userMessage || this.message,
      retryable: this.retryable,
      timestamp: this.timestamp
    };
  }
}

/**
 * Authentication and authorization errors
 */
export class AuthenticationError extends BaseApplicationError {
  constructor(
    message: string = 'Authentication failed',
    code: string = 'AUTH_FAILED',
    userMessage?: string,
    context?: Record<string, any>
  ) {
    super(message, code, 'critical', false, userMessage, context);
  }
}

export class AuthorizationError extends BaseApplicationError {
  constructor(
    message: string = 'Access denied',
    code: string = 'ACCESS_DENIED',
    userMessage?: string,
    context?: Record<string, any>
  ) {
    super(message, code, 'critical', false, userMessage, context);
  }
}

export class TokenExpiredError extends AuthenticationError {
  constructor(
    message: string = 'Authentication token has expired',
    context?: Record<string, any>
  ) {
    super(
      message,
      'TOKEN_EXPIRED',
      'Your session has expired. Please log in again.',
      context
    );
  }
}

export class InvalidTokenError extends AuthenticationError {
  constructor(
    message: string = 'Invalid authentication token',
    context?: Record<string, any>
  ) {
    super(
      message,
      'INVALID_TOKEN',
      'Invalid authentication. Please log in again.',
      context
    );
  }
}

/**
 * Validation errors
 */
export class ValidationError extends BaseApplicationError {
  public readonly field?: string;
  public readonly value?: any;
  public readonly constraints?: string[];

  constructor(
    message: string,
    field?: string,
    value?: any,
    constraints?: string[],
    context?: Record<string, any>
  ) {
    super(
      message,
      'VALIDATION_ERROR',
      'medium',
      false,
      'The provided data is invalid. Please check your input.',
      { ...context, field, value, constraints }
    );
    this.field = field;
    this.value = value;
    this.constraints = constraints;
  }
}

export class RequiredFieldError extends ValidationError {
  constructor(field: string, context?: Record<string, any>) {
    super(
      `Field '${field}' is required`,
      field,
      undefined,
      ['required'],
      context
    );
  }
}

export class InvalidFormatError extends ValidationError {
  constructor(
    field: string,
    value: any,
    expectedFormat: string,
    context?: Record<string, any>
  ) {
    super(
      `Field '${field}' has invalid format. Expected: ${expectedFormat}`,
      field,
      value,
      [`format:${expectedFormat}`],
      context
    );
  }
}

/**
 * Business logic errors
 */
export class BusinessLogicError extends BaseApplicationError {
  constructor(
    message: string,
    code: string,
    userMessage?: string,
    context?: Record<string, any>
  ) {
    super(message, code, 'medium', false, userMessage, context);
  }
}

export class InsufficientCreditsError extends BusinessLogicError {
  public readonly required: number;
  public readonly available: number;

  constructor(required: number, available: number, context?: Record<string, any>) {
    super(
      `Insufficient credits: required ${required}, available ${available}`,
      'INSUFFICIENT_CREDITS',
      `You need ${required} credits but only have ${available} available.`,
      { ...context, required, available }
    );
    this.required = required;
    this.available = available;
  }
}

export class UserNotFoundError extends BusinessLogicError {
  public readonly userId: string;

  constructor(userId: string, context?: Record<string, any>) {
    super(
      `User not found: ${userId}`,
      'USER_NOT_FOUND',
      'User account not found.',
      { ...context, userId }
    );
    this.userId = userId;
  }
}

export class ConversationNotFoundError extends BusinessLogicError {
  public readonly conversationId: string;

  constructor(conversationId: string, context?: Record<string, any>) {
    super(
      `Conversation not found: ${conversationId}`,
      'CONVERSATION_NOT_FOUND',
      'Conversation not found.',
      { ...context, conversationId }
    );
    this.conversationId = conversationId;
  }
}

export class DuplicateResourceError extends BusinessLogicError {
  public readonly resourceType: string;
  public readonly resourceId: string;

  constructor(
    resourceType: string,
    resourceId: string,
    context?: Record<string, any>
  ) {
    super(
      `${resourceType} already exists: ${resourceId}`,
      'DUPLICATE_RESOURCE',
      `${resourceType} already exists.`,
      { ...context, resourceType, resourceId }
    );
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * External service errors
 */
export class ExternalServiceError extends BaseApplicationError {
  public readonly serviceName: string;
  public readonly statusCode?: number;

  constructor(
    serviceName: string,
    message: string,
    statusCode?: number,
    retryable: boolean = true,
    context?: Record<string, any>
  ) {
    super(
      `${serviceName} service error: ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      'high',
      retryable,
      'External service temporarily unavailable. Please try again later.',
      { ...context, serviceName, statusCode }
    );
    this.serviceName = serviceName;
    this.statusCode = statusCode;
  }
}

export class OpenAIServiceError extends ExternalServiceError {
  constructor(
    message: string,
    statusCode?: number,
    retryable: boolean = true,
    context?: Record<string, any>
  ) {
    super('OpenAI', message, statusCode, retryable, context);
  }
}

export class NebiusServiceError extends ExternalServiceError {
  constructor(
    message: string,
    statusCode?: number,
    retryable: boolean = true,
    context?: Record<string, any>
  ) {
    super('Nebius', message, statusCode, retryable, context);
  }
}

/**
 * Database errors
 */
export class DatabaseError extends BaseApplicationError {
  public readonly operation?: string;
  public readonly collection?: string;

  constructor(
    message: string,
    operation?: string,
    collection?: string,
    retryable: boolean = true,
    context?: Record<string, any>
  ) {
    super(
      message,
      'DATABASE_ERROR',
      'high',
      retryable,
      'Database operation failed. Please try again.',
      { ...context, operation, collection }
    );
    this.operation = operation;
    this.collection = collection;
  }
}

export class DatabaseConnectionError extends DatabaseError {
  constructor(message: string = 'Database connection failed', context?: Record<string, any>) {
    super(message, 'connection', undefined, true, context);
    Object.defineProperty(this, 'code', { value: 'DATABASE_CONNECTION_ERROR', writable: false });
  }
}

export class DocumentNotFoundError extends DatabaseError {
  public readonly documentId: string;

  constructor(
    collection: string,
    documentId: string,
    context?: Record<string, any>
  ) {
    super(
      `Document not found in ${collection}: ${documentId}`,
      'read',
      collection,
      false,
      { ...context, documentId }
    );
    Object.defineProperty(this, 'code', { value: 'DOCUMENT_NOT_FOUND', writable: false });
    this.documentId = documentId;
  }
}

export class TransactionFailedError extends DatabaseError {
  public readonly reason?: string;

  constructor(reason?: string, context?: Record<string, any>) {
    super(
      `Transaction failed${reason ? `: ${reason}` : ''}`,
      'transaction',
      undefined,
      true,
      { ...context, reason }
    );
    Object.defineProperty(this, 'code', { value: 'TRANSACTION_FAILED', writable: false });
    this.reason = reason;
  }
}

/**
 * Network errors
 */
export class NetworkError extends BaseApplicationError {
  public readonly statusCode?: number;
  public readonly timeout?: boolean;

  constructor(
    message: string,
    statusCode?: number,
    timeout: boolean = false,
    context?: Record<string, any>
  ) {
    super(
      message,
      'NETWORK_ERROR',
      'medium',
      true,
      'Network error. Please check your connection and try again.',
      { ...context, statusCode, timeout }
    );
    this.statusCode = statusCode;
    this.timeout = timeout;
  }
}

export class TimeoutError extends NetworkError {
  public readonly timeoutMs: number;

  constructor(timeoutMs: number, context?: Record<string, any>) {
    super(
      `Request timed out after ${timeoutMs}ms`,
      408,
      true,
      { ...context, timeoutMs }
    );
    Object.defineProperty(this, 'code', { value: 'TIMEOUT_ERROR', writable: false });
    this.timeoutMs = timeoutMs;
  }
}

export class RateLimitError extends BaseApplicationError {
  public readonly retryAfter?: number;

  constructor(retryAfter?: number, context?: Record<string, any>) {
    super(
      `Rate limit exceeded${retryAfter ? `. Retry after ${retryAfter}s` : ''}`,
      'RATE_LIMIT_EXCEEDED',
      'medium',
      true,
      'Too many requests. Please wait a moment and try again.',
      { ...context, retryAfter }
    );
    this.retryAfter = retryAfter;
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends BaseApplicationError {
  public readonly configKey?: string;

  constructor(
    message: string,
    configKey?: string,
    context?: Record<string, any>
  ) {
    super(
      message,
      'CONFIGURATION_ERROR',
      'critical',
      false,
      'System configuration error.',
      { ...context, configKey }
    );
    this.configKey = configKey;
  }
}

export class MissingEnvironmentVariableError extends ConfigurationError {
  constructor(variableName: string, context?: Record<string, any>) {
    super(
      `Missing required environment variable: ${variableName}`,
      variableName,
      context
    );
    Object.defineProperty(this, 'code', { value: 'MISSING_ENV_VAR', writable: false });
  }
}

/**
 * Workflow and orchestration errors
 */
export class WorkflowError extends BaseApplicationError {
  public readonly workflowId?: string;
  public readonly stepId?: string;

  constructor(
    message: string,
    workflowId?: string,
    stepId?: string,
    retryable: boolean = false,
    context?: Record<string, any>
  ) {
    super(
      message,
      'WORKFLOW_ERROR',
      'high',
      retryable,
      'Workflow execution failed.',
      { ...context, workflowId, stepId }
    );
    this.workflowId = workflowId;
    this.stepId = stepId;
  }
}

export class WorkflowTimeoutError extends WorkflowError {
  public readonly timeoutMs: number;

  constructor(
    workflowId: string,
    timeoutMs: number,
    context?: Record<string, any>
  ) {
    super(
      `Workflow ${workflowId} timed out after ${timeoutMs}ms`,
      workflowId,
      undefined,
      false,
      { ...context, timeoutMs }
    );
    Object.defineProperty(this, 'code', { value: 'WORKFLOW_TIMEOUT', writable: false });
    this.timeoutMs = timeoutMs;
  }
}

export class WorkflowStepFailedError extends WorkflowError {
  public readonly stepError: Error;

  constructor(
    workflowId: string,
    stepId: string,
    stepError: Error,
    context?: Record<string, any>
  ) {
    super(
      `Workflow ${workflowId} step ${stepId} failed: ${stepError.message}`,
      workflowId,
      stepId,
      true,
      { ...context, stepError: stepError.message }
    );
    Object.defineProperty(this, 'code', { value: 'WORKFLOW_STEP_FAILED', writable: false });
    this.stepError = stepError;
  }
}

/**
 * Error factory functions for common error creation patterns
 */
export class ErrorFactory {
  /**
   * Create authentication error from Firebase auth error
   */
  static fromFirebaseAuthError(error: any, context?: Record<string, any>): AuthenticationError {
    const code = error.code || 'auth/unknown';
    
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return new AuthenticationError(
          'Invalid credentials',
          'INVALID_CREDENTIALS',
          'Invalid email or password.',
          context
        );
      
      case 'auth/user-disabled':
        return new AuthenticationError(
          'User account disabled',
          'ACCOUNT_DISABLED',
          'Your account has been disabled.',
          context
        );
      
      case 'auth/too-many-requests':
        return new RateLimitError(undefined, context);
      
      case 'auth/id-token-expired':
        return new TokenExpiredError(undefined, context);
      
      case 'auth/id-token-revoked':
        return new InvalidTokenError('Token has been revoked', context);
      
      default:
        return new AuthenticationError(
          error.message || 'Authentication failed',
          code.replace('auth/', '').toUpperCase(),
          undefined,
          context
        );
    }
  }

  /**
   * Create database error from Firestore error
   */
  static fromFirestoreError(error: any, operation?: string, collection?: string, context?: Record<string, any>): DatabaseError {
    const code = error.code || 'unknown';
    
    switch (code) {
      case 'not-found':
        return new DocumentNotFoundError(
          collection || 'unknown',
          context?.documentId || 'unknown',
          context
        );
      
      case 'permission-denied':
        return new AuthorizationError(
          'Insufficient permissions for database operation',
          'DATABASE_PERMISSION_DENIED',
          'You do not have permission to access this data.',
          context
        );
      
      case 'unavailable':
      case 'deadline-exceeded':
        return new DatabaseConnectionError(
          'Database service temporarily unavailable',
          context
        );
      
      case 'aborted':
        return new TransactionFailedError('Transaction was aborted', context);
      
      default:
        return new DatabaseError(
          error.message || 'Database operation failed',
          operation,
          collection,
          ['unavailable', 'deadline-exceeded', 'resource-exhausted'].includes(code),
          context
        );
    }
  }

  /**
   * Create network error from HTTP response
   */
  static fromHttpError(error: any, context?: Record<string, any>): NetworkError | BaseApplicationError {
    const statusCode = error.response?.status || error.status;
    const message = error.message || 'Network request failed';
    
    if (statusCode === 401) {
      return new AuthenticationError(message, 'HTTP_UNAUTHORIZED', undefined, context);
    }
    
    if (statusCode === 403) {
      return new AuthorizationError(message, 'HTTP_FORBIDDEN', undefined, context);
    }
    
    if (statusCode === 404) {
      return new BusinessLogicError(message, 'HTTP_NOT_FOUND', 'Resource not found.', context);
    }
    
    if (statusCode === 429) {
      const retryAfter = error.response?.headers?.['retry-after'];
      return new RateLimitError(retryAfter ? parseInt(retryAfter) : undefined, context);
    }
    
    if (statusCode >= 500) {
      return new ExternalServiceError(
        'HTTP',
        message,
        statusCode,
        true,
        context
      );
    }
    
    return new NetworkError(message, statusCode, false, context);
  }
}