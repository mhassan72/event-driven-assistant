/**
 * Comprehensive Error Categories and Classification
 * Production-ready error handling with detailed categorization
 */

/**
 * Error severity levels for proper escalation
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
  FATAL = 'fatal'
}

/**
 * Error categories for systematic classification
 */
export enum ErrorCategory {
  // System-level errors
  SYSTEM_FAILURE = 'system_failure',
  INFRASTRUCTURE = 'infrastructure',
  CONFIGURATION = 'configuration',
  
  // Application-level errors
  VALIDATION = 'validation',
  BUSINESS_LOGIC = 'business_logic',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  
  // External service errors
  EXTERNAL_SERVICE = 'external_service',
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  
  // Data-related errors
  DATA_CORRUPTION = 'data_corruption',
  DATA_INCONSISTENCY = 'data_inconsistency',
  STORAGE_FAILURE = 'storage_failure',
  
  // Resource errors
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
  MEMORY_LIMIT = 'memory_limit',
  CPU_LIMIT = 'cpu_limit',
  
  // Security errors
  SECURITY_VIOLATION = 'security_violation',
  FRAUD_DETECTION = 'fraud_detection',
  
  // User errors
  USER_INPUT = 'user_input',
  PERMISSION_DENIED = 'permission_denied'
}

/**
 * Error recovery strategies
 */
export enum RecoveryStrategy {
  RETRY = 'retry',
  FALLBACK = 'fallback',
  CIRCUIT_BREAKER = 'circuit_breaker',
  COMPENSATION = 'compensation',
  MANUAL_INTERVENTION = 'manual_intervention',
  GRACEFUL_DEGRADATION = 'graceful_degradation',
  FAIL_FAST = 'fail_fast'
}

/**
 * Comprehensive error interface
 */
export interface CategorizedError extends Error {
  // Core identification
  id: string;
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  
  // Context information
  timestamp: Date;
  correlationId?: string;
  userId?: string;
  sessionId?: string;
  
  // Technical details
  statusCode?: number;
  originalError?: Error;
  stackTrace?: string;
  
  // Recovery information
  retryable: boolean;
  recoveryStrategy: RecoveryStrategy;
  maxRetries?: number;
  retryDelay?: number;
  
  // Metadata
  context: Record<string, any>;
  tags: string[];
  
  // Operational flags
  isOperational: boolean;
  requiresAlert: boolean;
  requiresEscalation: boolean;
}

/**
 * Error classification rules
 */
export interface ErrorClassificationRule {
  pattern: RegExp | string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  recoveryStrategy: RecoveryStrategy;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Predefined error classification rules
 */
export const ERROR_CLASSIFICATION_RULES: ErrorClassificationRule[] = [
  // Network and connectivity errors
  {
    pattern: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET/,
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.MEDIUM,
    retryable: true,
    recoveryStrategy: RecoveryStrategy.RETRY,
    maxRetries: 3,
    retryDelay: 1000
  },
  
  // Rate limiting errors
  {
    pattern: /rate.?limit|too.?many.?requests/i,
    category: ErrorCategory.RATE_LIMIT,
    severity: ErrorSeverity.MEDIUM,
    retryable: true,
    recoveryStrategy: RecoveryStrategy.RETRY,
    maxRetries: 5,
    retryDelay: 5000
  },
  
  // Authentication errors
  {
    pattern: /unauthorized|invalid.?token|expired.?token/i,
    category: ErrorCategory.AUTHENTICATION,
    severity: ErrorSeverity.HIGH,
    retryable: false,
    recoveryStrategy: RecoveryStrategy.FAIL_FAST
  },
  
  // Authorization errors
  {
    pattern: /forbidden|access.?denied|insufficient.?permissions/i,
    category: ErrorCategory.AUTHORIZATION,
    severity: ErrorSeverity.HIGH,
    retryable: false,
    recoveryStrategy: RecoveryStrategy.FAIL_FAST
  },
  
  // Validation errors
  {
    pattern: /validation|invalid.?input|bad.?request/i,
    category: ErrorCategory.VALIDATION,
    severity: ErrorSeverity.LOW,
    retryable: false,
    recoveryStrategy: RecoveryStrategy.FAIL_FAST
  },
  
  // External service errors
  {
    pattern: /service.?unavailable|bad.?gateway|gateway.?timeout/i,
    category: ErrorCategory.EXTERNAL_SERVICE,
    severity: ErrorSeverity.HIGH,
    retryable: true,
    recoveryStrategy: RecoveryStrategy.CIRCUIT_BREAKER,
    maxRetries: 3,
    retryDelay: 2000
  },
  
  // Database errors
  {
    pattern: /database|firestore|connection.?pool/i,
    category: ErrorCategory.STORAGE_FAILURE,
    severity: ErrorSeverity.CRITICAL,
    retryable: true,
    recoveryStrategy: RecoveryStrategy.RETRY,
    maxRetries: 2,
    retryDelay: 500
  },
  
  // Memory errors
  {
    pattern: /out.?of.?memory|memory.?limit|heap/i,
    category: ErrorCategory.MEMORY_LIMIT,
    severity: ErrorSeverity.CRITICAL,
    retryable: false,
    recoveryStrategy: RecoveryStrategy.GRACEFUL_DEGRADATION
  },
  
  // Timeout errors
  {
    pattern: /timeout|deadline.?exceeded/i,
    category: ErrorCategory.TIMEOUT,
    severity: ErrorSeverity.MEDIUM,
    retryable: true,
    recoveryStrategy: RecoveryStrategy.RETRY,
    maxRetries: 2,
    retryDelay: 1000
  }
];

/**
 * Error classifier for automatic categorization
 */
export class ErrorClassifier {
  private rules: ErrorClassificationRule[];
  
  constructor(customRules: ErrorClassificationRule[] = []) {
    this.rules = [...ERROR_CLASSIFICATION_RULES, ...customRules];
  }
  
  /**
   * Classify an error based on its message and properties
   */
  classify(error: Error | string): Partial<CategorizedError> {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorName = typeof error === 'string' ? 'Error' : error.name;
    
    // Find matching rule
    for (const rule of this.rules) {
      const pattern = typeof rule.pattern === 'string' 
        ? new RegExp(rule.pattern, 'i') 
        : rule.pattern;
        
      if (pattern.test(errorMessage) || pattern.test(errorName)) {
        return {
          category: rule.category,
          severity: rule.severity,
          retryable: rule.retryable,
          recoveryStrategy: rule.recoveryStrategy,
          maxRetries: rule.maxRetries,
          retryDelay: rule.retryDelay
        };
      }
    }
    
    // Default classification for unmatched errors
    return {
      category: ErrorCategory.SYSTEM_FAILURE,
      severity: ErrorSeverity.MEDIUM,
      retryable: true,
      recoveryStrategy: RecoveryStrategy.RETRY,
      maxRetries: 1,
      retryDelay: 1000
    };
  }
  
  /**
   * Add custom classification rule
   */
  addRule(rule: ErrorClassificationRule): void {
    this.rules.unshift(rule); // Add to beginning for priority
  }
  
  /**
   * Remove classification rule
   */
  removeRule(pattern: RegExp | string): boolean {
    const initialLength = this.rules.length;
    this.rules = this.rules.filter(rule => {
      if (typeof pattern === 'string' && typeof rule.pattern === 'string') {
        return rule.pattern !== pattern;
      }
      if (pattern instanceof RegExp && rule.pattern instanceof RegExp) {
        return rule.pattern.source !== pattern.source;
      }
      return true;
    });
    
    return this.rules.length < initialLength;
  }
}

/**
 * Create a categorized error from a standard error
 */
export function createCategorizedError(
  error: Error | string,
  context: Partial<CategorizedError> = {}
): CategorizedError {
  const classifier = new ErrorClassifier();
  const classification = classifier.classify(error);
  
  const originalError = typeof error === 'string' ? new Error(error) : error;
  const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    // Core identification
    id: context.id || errorId,
    name: originalError.name,
    message: originalError.message,
    code: context.code || `${classification.category?.toUpperCase()}_ERROR`,
    category: context.category || classification.category || ErrorCategory.SYSTEM_FAILURE,
    severity: context.severity || classification.severity || ErrorSeverity.MEDIUM,
    
    // Context information
    timestamp: context.timestamp || new Date(),
    correlationId: context.correlationId,
    userId: context.userId,
    sessionId: context.sessionId,
    
    // Technical details
    statusCode: context.statusCode || getStatusCodeForCategory(classification.category),
    originalError,
    stackTrace: context.stackTrace || originalError.stack,
    
    // Recovery information
    retryable: context.retryable ?? classification.retryable ?? true,
    recoveryStrategy: context.recoveryStrategy || classification.recoveryStrategy || RecoveryStrategy.RETRY,
    maxRetries: context.maxRetries || classification.maxRetries || 1,
    retryDelay: context.retryDelay || classification.retryDelay || 1000,
    
    // Metadata
    context: context.context || {},
    tags: context.tags || [],
    
    // Operational flags
    isOperational: context.isOperational ?? isOperationalError(classification.category),
    requiresAlert: context.requiresAlert ?? requiresAlert(context.severity || classification.severity || ErrorSeverity.MEDIUM),
    requiresEscalation: context.requiresEscalation ?? requiresEscalation(context.severity || classification.severity || ErrorSeverity.MEDIUM),
    
    // Standard Error properties
    stack: originalError.stack
  };
}

/**
 * Get HTTP status code for error category
 */
function getStatusCodeForCategory(category?: ErrorCategory): number {
  switch (category) {
    case ErrorCategory.VALIDATION:
    case ErrorCategory.USER_INPUT:
      return 400;
    case ErrorCategory.AUTHENTICATION:
      return 401;
    case ErrorCategory.AUTHORIZATION:
    case ErrorCategory.PERMISSION_DENIED:
      return 403;
    case ErrorCategory.RATE_LIMIT:
      return 429;
    case ErrorCategory.EXTERNAL_SERVICE:
    case ErrorCategory.NETWORK:
      return 502;
    case ErrorCategory.TIMEOUT:
      return 504;
    default:
      return 500;
  }
}

/**
 * Determine if error is operational (expected) or programming error
 */
function isOperationalError(category?: ErrorCategory): boolean {
  const operationalCategories = [
    ErrorCategory.VALIDATION,
    ErrorCategory.AUTHENTICATION,
    ErrorCategory.AUTHORIZATION,
    ErrorCategory.USER_INPUT,
    ErrorCategory.PERMISSION_DENIED,
    ErrorCategory.RATE_LIMIT,
    ErrorCategory.EXTERNAL_SERVICE,
    ErrorCategory.NETWORK,
    ErrorCategory.TIMEOUT
  ];
  
  return category ? operationalCategories.includes(category) : false;
}

/**
 * Determine if error requires immediate alerting
 */
function requiresAlert(severity: ErrorSeverity): boolean {
  return [ErrorSeverity.HIGH, ErrorSeverity.CRITICAL, ErrorSeverity.FATAL].includes(severity);
}

/**
 * Determine if error requires escalation
 */
function requiresEscalation(severity: ErrorSeverity): boolean {
  return [ErrorSeverity.CRITICAL, ErrorSeverity.FATAL].includes(severity);
}