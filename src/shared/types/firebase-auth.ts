/**
 * Firebase Auth Integration Types
 * Core interfaces for Firebase Authentication, user context, and session management
 */

import { Request, Response, NextFunction } from 'express';

// ============================================================================
// User Context and Authentication
// ============================================================================

/**
 * User context extracted from Firebase Auth token
 */
export interface UserContext {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
  phoneNumber?: string;
  
  // Custom claims
  customClaims?: Record<string, any>;
  roles?: UserRole[];
  permissions?: Permission[];
  
  // Token information
  authTime: number;
  issuedAt: number;
  expiresAt: number;
  
  // Session information
  sessionId?: string;
  deviceId?: string;
  
  // Security context
  ipAddress?: string;
  userAgent?: string;
  
  // Provider information
  providerId?: string;
  providerData?: ProviderData[];
  
  // Account status
  disabled?: boolean;
  metadata?: UserMetadata;
}

/**
 * User roles for authorization
 */
export enum UserRole {
  USER = 'user',
  PREMIUM_USER = 'premium_user',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
  DEVELOPER = 'developer',
  SUPPORT = 'support'
}

/**
 * Granular permissions
 */
export enum Permission {
  // Credit operations
  VIEW_CREDITS = 'view_credits',
  MANAGE_CREDITS = 'manage_credits',
  ADMIN_CREDITS = 'admin_credits',
  
  // AI operations
  USE_AI_ASSISTANT = 'use_ai_assistant',
  USE_PREMIUM_MODELS = 'use_premium_models',
  GENERATE_IMAGES = 'generate_images',
  
  // Payment operations
  MAKE_PAYMENTS = 'make_payments',
  VIEW_PAYMENT_HISTORY = 'view_payment_history',
  MANAGE_PAYMENT_METHODS = 'manage_payment_methods',
  
  // Admin operations
  VIEW_ANALYTICS = 'view_analytics',
  MANAGE_USERS = 'manage_users',
  MANAGE_MODELS = 'manage_models',
  SYSTEM_ADMIN = 'system_admin',
  
  // Notification operations
  VIEW_NOTIFICATIONS = 'view_notifications',
  MANAGE_NOTIFICATIONS = 'manage_notifications',
  SEND_NOTIFICATIONS = 'send_notifications',
  
  // API access
  API_ACCESS = 'api_access',
  WEBHOOK_ACCESS = 'webhook_access',
  BULK_OPERATIONS = 'bulk_operations'
}

/**
 * Provider data from Firebase Auth
 */
export interface ProviderData {
  uid: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  photoURL?: string;
  providerId: string;
}

/**
 * User metadata from Firebase Auth
 */
export interface UserMetadata {
  creationTime?: string;
  lastSignInTime?: string;
  lastRefreshTime?: string;
}

// ============================================================================
// Authentication Middleware
// ============================================================================

/**
 * Firebase Auth middleware interface
 */
export interface IFirebaseAuthMiddleware {
  // Token validation
  validateIdToken(req: Request, res: Response, next: NextFunction): Promise<void>;
  extractUserContext(idToken: string): Promise<TokenValidationResult>;
  
  // Optional authentication (for public endpoints)
  optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void>;
  
  // Role-based authentication
  requireRole(role: UserRole): (req: Request, res: Response, next: NextFunction) => Promise<void>;
  requireRoles(roles: UserRole[]): (req: Request, res: Response, next: NextFunction) => Promise<void>;
  
  // Permission-based authentication
  requirePermission(permission: Permission): (req: Request, res: Response, next: NextFunction) => Promise<void>;
  requirePermissions(permissions: Permission[]): (req: Request, res: Response, next: NextFunction) => Promise<void>;
  
  // Admin authentication
  requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void>;
  
  // Custom claims validation
  requireCustomClaim(claim: string, value: any): (req: Request, res: Response, next: NextFunction) => Promise<void>;
  
  // Session validation
  validateSession(req: Request, res: Response, next: NextFunction): Promise<void>;
  
  // Rate limiting by user
  rateLimitByUser(options: RateLimitOptions): (req: Request, res: Response, next: NextFunction) => Promise<void>;
}

/**
 * Rate limiting options
 */
export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  onLimitReached?: (req: Request, res: Response) => void;
}

// ============================================================================
// Authentication Errors
// ============================================================================

/**
 * Base authentication error
 */
export abstract class AuthenticationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  
  constructor(
    message: string,
    code: string,
    statusCode: number = 401,
    retryable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

/**
 * Token validation errors
 */
export class InvalidTokenError extends AuthenticationError {
  constructor(message: string = 'Invalid or malformed token') {
    super(message, 'INVALID_TOKEN', 401, false);
  }
}

export class ExpiredTokenError extends AuthenticationError {
  constructor(message: string = 'Token has expired') {
    super(message, 'EXPIRED_TOKEN', 401, true);
  }
}

export class RevokedTokenError extends AuthenticationError {
  constructor(message: string = 'Token has been revoked') {
    super(message, 'REVOKED_TOKEN', 401, false);
  }
}

/**
 * Authorization errors
 */
export class InsufficientPermissionsError extends AuthenticationError {
  public readonly requiredPermissions: Permission[];
  public readonly userPermissions: Permission[];
  
  constructor(
    requiredPermissions: Permission[],
    userPermissions: Permission[] = [],
    message?: string
  ) {
    const defaultMessage = `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`;
    super(message || defaultMessage, 'INSUFFICIENT_PERMISSIONS', 403, false);
    this.requiredPermissions = requiredPermissions;
    this.userPermissions = userPermissions;
  }
}

export class InsufficientRoleError extends AuthenticationError {
  public readonly requiredRoles: UserRole[];
  public readonly userRoles: UserRole[];
  
  constructor(
    requiredRoles: UserRole[],
    userRoles: UserRole[] = [],
    message?: string
  ) {
    const defaultMessage = `Insufficient role. Required: ${requiredRoles.join(', ')}`;
    super(message || defaultMessage, 'INSUFFICIENT_ROLE', 403, false);
    this.requiredRoles = requiredRoles;
    this.userRoles = userRoles;
  }
}

/**
 * Account status errors
 */
export class AccountDisabledError extends AuthenticationError {
  constructor(message: string = 'User account has been disabled') {
    super(message, 'ACCOUNT_DISABLED', 403, false);
  }
}

export class EmailNotVerifiedError extends AuthenticationError {
  constructor(message: string = 'Email address not verified') {
    super(message, 'EMAIL_NOT_VERIFIED', 403, true);
  }
}

/**
 * Session errors
 */
export class InvalidSessionError extends AuthenticationError {
  constructor(message: string = 'Invalid or expired session') {
    super(message, 'INVALID_SESSION', 401, true);
  }
}

export class SessionExpiredError extends AuthenticationError {
  constructor(message: string = 'Session has expired') {
    super(message, 'SESSION_EXPIRED', 401, true);
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitExceededError extends AuthenticationError {
  public readonly retryAfter: number;
  
  constructor(retryAfter: number, message?: string) {
    const defaultMessage = `Rate limit exceeded. Retry after ${retryAfter} seconds`;
    super(message || defaultMessage, 'RATE_LIMIT_EXCEEDED', 429, true);
    this.retryAfter = retryAfter;
  }
}

// ============================================================================
// Token Management
// ============================================================================

/**
 * Token validation result
 */
export interface TokenValidationResult {
  isValid: boolean;
  userContext?: UserContext;
  error?: AuthenticationError;
  
  // Token details
  tokenType?: TokenType;
  expiresIn?: number;
  
  // Validation metadata
  validatedAt: Date;
  validationDuration: number;
  
  // Security flags
  securityFlags?: SecurityFlag[];
}

export enum TokenType {
  ID_TOKEN = 'id_token',
  ACCESS_TOKEN = 'access_token',
  REFRESH_TOKEN = 'refresh_token',
  CUSTOM_TOKEN = 'custom_token'
}

/**
 * Security flags for token validation
 */
export interface SecurityFlag {
  type: SecurityFlagType;
  severity: SecuritySeverity;
  message: string;
  recommendation?: string;
}

export enum SecurityFlagType {
  SUSPICIOUS_LOCATION = 'suspicious_location',
  UNUSUAL_DEVICE = 'unusual_device',
  RAPID_REQUESTS = 'rapid_requests',
  MULTIPLE_SESSIONS = 'multiple_sessions',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  ANOMALOUS_BEHAVIOR = 'anomalous_behavior'
}

export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Token refresh request
 */
export interface TokenRefreshRequest {
  refreshToken: string;
  userId?: string;
  
  // Security context
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  
  // Options
  extendExpiry?: boolean;
  updateClaims?: boolean;
}

/**
 * Token refresh result
 */
export interface TokenRefreshResult {
  success: boolean;
  newIdToken?: string;
  newRefreshToken?: string;
  expiresIn?: number;
  
  // Error details
  error?: AuthenticationError;
  
  // Security assessment
  securityAssessment?: SecurityAssessment;
  
  // Metadata
  refreshedAt: Date;
  previousTokenExpiry?: Date;
}

/**
 * Security assessment for token operations
 */
export interface SecurityAssessment {
  riskLevel: SecurityRiskLevel;
  riskScore: number; // 0-100
  factors: SecurityRiskFactor[];
  recommendations: SecurityRecommendation[];
  
  // Device and location analysis
  deviceTrust: DeviceTrustLevel;
  locationTrust: LocationTrustLevel;
  
  // Behavioral analysis
  behaviorAnalysis?: BehaviorAnalysis;
}

export enum SecurityRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Security risk factor
 */
export interface SecurityRiskFactor {
  type: RiskFactorType;
  score: number;
  weight: number;
  description: string;
  evidence?: any;
}

export enum RiskFactorType {
  NEW_DEVICE = 'new_device',
  NEW_LOCATION = 'new_location',
  UNUSUAL_TIME = 'unusual_time',
  RAPID_SUCCESSION = 'rapid_succession',
  MULTIPLE_FAILURES = 'multiple_failures',
  PRIVILEGE_CHANGE = 'privilege_change',
  SUSPICIOUS_PATTERN = 'suspicious_pattern'
}

/**
 * Security recommendation
 */
export interface SecurityRecommendation {
  action: SecurityAction;
  priority: RecommendationPriority;
  description: string;
  automaticAction?: boolean;
}

export enum SecurityAction {
  ALLOW = 'allow',
  CHALLENGE = 'challenge',
  BLOCK = 'block',
  MONITOR = 'monitor',
  REQUIRE_MFA = 'require_mfa',
  FORCE_LOGOUT = 'force_logout',
  LOCK_ACCOUNT = 'lock_account'
}

export enum RecommendationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum DeviceTrustLevel {
  TRUSTED = 'trusted',
  KNOWN = 'known',
  UNKNOWN = 'unknown',
  SUSPICIOUS = 'suspicious',
  BLOCKED = 'blocked'
}

export enum LocationTrustLevel {
  TRUSTED = 'trusted',
  KNOWN = 'known',
  UNKNOWN = 'unknown',
  SUSPICIOUS = 'suspicious',
  BLOCKED = 'blocked'
}

/**
 * Behavior analysis
 */
export interface BehaviorAnalysis {
  normalBehavior: BehaviorProfile;
  currentBehavior: BehaviorProfile;
  deviationScore: number;
  anomalies: BehaviorAnomaly[];
}

/**
 * Behavior profile
 */
export interface BehaviorProfile {
  typicalLoginTimes: TimePattern[];
  typicalLocations: LocationPattern[];
  typicalDevices: DevicePattern[];
  usagePatterns: UsagePattern[];
}

/**
 * Time pattern
 */
export interface TimePattern {
  dayOfWeek: number;
  hourRange: HourRange;
  frequency: number;
  confidence: number;
}

/**
 * Hour range
 */
export interface HourRange {
  start: number; // 0-23
  end: number;   // 0-23
}

/**
 * Location pattern
 */
export interface LocationPattern {
  country: string;
  region?: string;
  city?: string;
  ipRange?: string;
  frequency: number;
  lastSeen: Date;
}

/**
 * Device pattern
 */
export interface DevicePattern {
  deviceType: string;
  browser?: string;
  os?: string;
  fingerprint?: string;
  frequency: number;
  lastSeen: Date;
  trusted: boolean;
}

/**
 * Usage pattern
 */
export interface UsagePattern {
  feature: string;
  frequency: number;
  timeOfDay: number[];
  duration: number;
  intensity: UsageIntensity;
}

export enum UsageIntensity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  VERY_HIGH = 'very_high'
}

/**
 * Behavior anomaly
 */
export interface BehaviorAnomaly {
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  confidence: number;
  evidence: AnomalyEvidence;
}

export enum AnomalyType {
  UNUSUAL_TIME = 'unusual_time',
  UNUSUAL_LOCATION = 'unusual_location',
  UNUSUAL_DEVICE = 'unusual_device',
  UNUSUAL_FREQUENCY = 'unusual_frequency',
  UNUSUAL_PATTERN = 'unusual_pattern',
  RAPID_CHANGES = 'rapid_changes'
}

export enum AnomalySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Anomaly evidence
 */
export interface AnomalyEvidence {
  expected: any;
  actual: any;
  deviation: number;
  context?: Record<string, any>;
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * User session information
 */
export interface UserSession {
  sessionId: string;
  userId: string;
  
  // Session details
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  isActive: boolean;
  
  // Device and location
  deviceInfo: DeviceInfo;
  locationInfo: LocationInfo;
  
  // Security
  ipAddress: string;
  userAgent: string;
  
  // Token information
  tokenId?: string;
  refreshTokenId?: string;
  
  // Session metadata
  metadata?: SessionMetadata;
  
  // Activity tracking
  activityLog?: SessionActivity[];
  
  // Security flags
  securityFlags?: SessionSecurityFlag[];
}

/**
 * Device information
 */
export interface DeviceInfo {
  deviceId: string;
  deviceType: DeviceType;
  deviceName?: string;
  
  // Browser/App info
  browser?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  
  // Mobile specific
  appVersion?: string;
  platform?: string;
  
  // Security
  fingerprint?: string;
  trusted: boolean;
  registeredAt?: Date;
}

export enum DeviceType {
  DESKTOP = 'desktop',
  MOBILE = 'mobile',
  TABLET = 'tablet',
  TV = 'tv',
  WATCH = 'watch',
  OTHER = 'other'
}

/**
 * Location information
 */
export interface LocationInfo {
  country: string;
  region?: string;
  city?: string;
  
  // Coordinates (if available)
  latitude?: number;
  longitude?: number;
  
  // Network info
  isp?: string;
  organization?: string;
  
  // Security assessment
  vpnDetected?: boolean;
  proxyDetected?: boolean;
  torDetected?: boolean;
  
  // Trust level
  trustLevel: LocationTrustLevel;
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  // Authentication method
  authMethod: AuthenticationMethod;
  mfaUsed: boolean;
  
  // Client information
  clientId?: string;
  clientVersion?: string;
  
  // Custom fields
  customData?: Record<string, any>;
  
  // Tracking
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export enum AuthenticationMethod {
  PASSWORD = 'password',
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
  APPLE = 'apple',
  GITHUB = 'github',
  TWITTER = 'twitter',
  PHONE = 'phone',
  EMAIL_LINK = 'email_link',
  ANONYMOUS = 'anonymous',
  CUSTOM_TOKEN = 'custom_token'
}

/**
 * Session activity
 */
export interface SessionActivity {
  timestamp: Date;
  action: SessionAction;
  resource?: string;
  
  // Request details
  method?: string;
  endpoint?: string;
  statusCode?: number;
  
  // Performance
  duration?: number;
  
  // Security
  ipAddress?: string;
  userAgent?: string;
  
  // Custom data
  metadata?: Record<string, any>;
}

export enum SessionAction {
  LOGIN = 'login',
  LOGOUT = 'logout',
  TOKEN_REFRESH = 'token_refresh',
  API_REQUEST = 'api_request',
  PERMISSION_CHECK = 'permission_check',
  ROLE_CHANGE = 'role_change',
  SECURITY_EVENT = 'security_event',
  ERROR = 'error'
}

/**
 * Session security flag
 */
export interface SessionSecurityFlag {
  type: SessionSecurityFlagType;
  severity: SecuritySeverity;
  timestamp: Date;
  description: string;
  
  // Resolution
  resolved: boolean;
  resolvedAt?: Date;
  resolution?: string;
  
  // Evidence
  evidence?: Record<string, any>;
}

export enum SessionSecurityFlagType {
  CONCURRENT_SESSIONS = 'concurrent_sessions',
  LOCATION_CHANGE = 'location_change',
  DEVICE_CHANGE = 'device_change',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  FAILED_AUTHENTICATION = 'failed_authentication',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  UNUSUAL_USAGE = 'unusual_usage'
}

// ============================================================================
// Session Management Interface
// ============================================================================

/**
 * Session management service interface
 */
export interface ISessionManager {
  // Session lifecycle
  createSession(userContext: UserContext, deviceInfo: DeviceInfo, locationInfo: LocationInfo): Promise<UserSession>;
  getSession(sessionId: string): Promise<UserSession | null>;
  updateSession(sessionId: string, updates: Partial<UserSession>): Promise<UserSession>;
  terminateSession(sessionId: string, reason?: string): Promise<void>;
  
  // Session validation
  validateSession(sessionId: string): Promise<SessionValidationResult>;
  refreshSession(sessionId: string): Promise<SessionRefreshResult>;
  
  // User session management
  getUserSessions(userId: string): Promise<UserSession[]>;
  terminateUserSessions(userId: string, excludeSessionId?: string): Promise<number>;
  
  // Activity tracking
  recordActivity(sessionId: string, activity: SessionActivity): Promise<void>;
  getSessionActivity(sessionId: string, limit?: number): Promise<SessionActivity[]>;
  
  // Security monitoring
  flagSuspiciousActivity(sessionId: string, flag: SessionSecurityFlag): Promise<void>;
  getSecurityFlags(sessionId: string): Promise<SessionSecurityFlag[]>;
  
  // Cleanup and maintenance
  cleanupExpiredSessions(): Promise<number>;
  getSessionStatistics(): Promise<SessionStatistics>;
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  isValid: boolean;
  session?: UserSession;
  error?: AuthenticationError;
  
  // Security assessment
  securityAssessment?: SecurityAssessment;
  
  // Recommendations
  recommendations?: SecurityRecommendation[];
}

/**
 * Session refresh result
 */
export interface SessionRefreshResult {
  success: boolean;
  newExpiresAt?: Date;
  error?: AuthenticationError;
  
  // Security checks
  securityChecksPerformed: SecurityCheck[];
  securityIssues?: SecurityIssue[];
}

/**
 * Security check
 */
export interface SecurityCheck {
  type: SecurityCheckType;
  passed: boolean;
  details?: string;
  timestamp: Date;
}

export enum SecurityCheckType {
  DEVICE_VERIFICATION = 'device_verification',
  LOCATION_VERIFICATION = 'location_verification',
  BEHAVIOR_ANALYSIS = 'behavior_analysis',
  RATE_LIMIT_CHECK = 'rate_limit_check',
  CONCURRENT_SESSION_CHECK = 'concurrent_session_check',
  PRIVILEGE_VERIFICATION = 'privilege_verification'
}

/**
 * Security issue
 */
export interface SecurityIssue {
  type: SecurityIssueType;
  severity: SecuritySeverity;
  description: string;
  recommendation: SecurityAction;
  autoResolved?: boolean;
}

export enum SecurityIssueType {
  SUSPICIOUS_LOCATION = 'suspicious_location',
  UNUSUAL_DEVICE = 'unusual_device',
  CONCURRENT_SESSIONS = 'concurrent_sessions',
  RAPID_REQUESTS = 'rapid_requests',
  PRIVILEGE_MISMATCH = 'privilege_mismatch',
  EXPIRED_CREDENTIALS = 'expired_credentials'
}

/**
 * Session statistics
 */
export interface SessionStatistics {
  totalActiveSessions: number;
  totalUsers: number;
  averageSessionDuration: number;
  
  // Breakdown by device type
  sessionsByDeviceType: DeviceTypeStats[];
  
  // Geographic distribution
  sessionsByLocation: LocationStats[];
  
  // Security metrics
  securityIncidents: number;
  suspiciousActivities: number;
  
  // Performance metrics
  averageLoginTime: number;
  sessionCreationRate: number;
  
  // Time range
  timeRange: {
    start: Date;
    end: Date;
  };
}

/**
 * Device type statistics
 */
export interface DeviceTypeStats {
  deviceType: DeviceType;
  count: number;
  percentage: number;
  averageDuration: number;
}

/**
 * Location statistics
 */
export interface LocationStats {
  country: string;
  count: number;
  percentage: number;
  averageDuration: number;
  securityIncidents: number;
}

// ============================================================================
// Multi-Factor Authentication
// ============================================================================

/**
 * MFA configuration
 */
export interface MFAConfiguration {
  userId: string;
  enabled: boolean;
  
  // Available methods
  availableMethods: MFAMethod[];
  primaryMethod?: MFAMethod;
  backupMethods: MFAMethod[];
  
  // Recovery options
  recoveryCodes: string[];
  recoveryCodesUsed: number;
  
  // Configuration
  enforced: boolean;
  gracePeriodEnd?: Date;
  
  // Metadata
  configuredAt: Date;
  lastUsed?: Date;
  lastModified: Date;
}

export enum MFAMethod {
  SMS = 'sms',
  EMAIL = 'email',
  TOTP = 'totp',
  PUSH_NOTIFICATION = 'push_notification',
  HARDWARE_KEY = 'hardware_key',
  BIOMETRIC = 'biometric',
  BACKUP_CODES = 'backup_codes'
}

/**
 * MFA challenge
 */
export interface MFAChallenge {
  challengeId: string;
  userId: string;
  method: MFAMethod;
  
  // Challenge details
  createdAt: Date;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  
  // Status
  status: MFAChallengeStatus;
  completedAt?: Date;
  
  // Method-specific data
  methodData?: MFAMethodData;
  
  // Security
  ipAddress: string;
  userAgent: string;
  deviceId?: string;
}

export enum MFAChallengeStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}

/**
 * MFA method data
 */
export interface MFAMethodData {
  // SMS/Email
  destination?: string;
  maskedDestination?: string;
  
  // TOTP
  qrCode?: string;
  secret?: string;
  
  // Push notification
  deviceToken?: string;
  
  // Hardware key
  keyId?: string;
  challenge?: string;
  
  // Biometric
  biometricType?: BiometricType;
  
  // Custom data
  customData?: Record<string, any>;
}

export enum BiometricType {
  FINGERPRINT = 'fingerprint',
  FACE_ID = 'face_id',
  VOICE = 'voice',
  IRIS = 'iris',
  PALM = 'palm'
}

/**
 * MFA verification request
 */
export interface MFAVerificationRequest {
  challengeId: string;
  code: string;
  method: MFAMethod;
  
  // Device information
  deviceId?: string;
  deviceInfo?: DeviceInfo;
  
  // Biometric data (if applicable)
  biometricData?: BiometricData;
  
  // Remember device option
  rememberDevice?: boolean;
  trustDuration?: number; // hours
}

/**
 * Biometric data
 */
export interface BiometricData {
  type: BiometricType;
  template: string; // encrypted biometric template
  confidence: number;
  quality: number;
  
  // Metadata
  capturedAt: Date;
  deviceId: string;
  sensorInfo?: string;
}

/**
 * MFA verification result
 */
export interface MFAVerificationResult {
  success: boolean;
  challengeId: string;
  
  // Error details
  error?: MFAError;
  remainingAttempts?: number;
  
  // Success details
  verifiedAt?: Date;
  method?: MFAMethod;
  
  // Device trust
  deviceTrusted?: boolean;
  trustExpiresAt?: Date;
}

/**
 * MFA error
 */
export class MFAError extends AuthenticationError {
  public readonly challengeId: string;
  public readonly method: MFAMethod;
  public readonly remainingAttempts: number;
  
  constructor(
    challengeId: string,
    method: MFAMethod,
    remainingAttempts: number,
    message: string,
    code: string
  ) {
    super(message, code, 401, remainingAttempts > 0);
    this.challengeId = challengeId;
    this.method = method;
    this.remainingAttempts = remainingAttempts;
  }
}

// ============================================================================
// Extended Request Interface
// ============================================================================

/**
 * Extended Express Request with Firebase Auth context
 */
export interface AuthenticatedRequest extends Request {
  user?: UserContext;
  session?: UserSession;
  
  // Security context
  securityAssessment?: SecurityAssessment;
  rateLimitInfo?: RateLimitInfo;
  
  // MFA context
  mfaRequired?: boolean;
  mfaChallenge?: MFAChallenge;
  
  // Audit trail
  auditContext?: AuditContext;
}

/**
 * Rate limit information
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

/**
 * Audit context for requests
 */
export interface AuditContext {
  requestId: string;
  correlationId?: string;
  
  // Request details
  method: string;
  path: string;
  query?: Record<string, any>;
  
  // User context
  userId?: string;
  sessionId?: string;
  
  // Security context
  ipAddress: string;
  userAgent: string;
  
  // Timing
  startTime: Date;
  
  // Custom fields
  customFields?: Record<string, any>;
}