/**
 * Shared Types Index
 * Central export point for all type definitions
 */

// AI Assistant Types
export * from './ai-assistant';

// Credit System Types  
export * from './credit-system';

// Image Generation Types
export * from './image-generation';

// Payment System Types - export with aliases for conflicting types
export {
    // Export everything except conflicting types
    PaymentRequest,
    TraditionalPaymentRequest,
    Web3PaymentRequest,
    PaymentResult,
    PaymentMethod,
    TraditionalPaymentMethod,
    Web3PaymentMethod,
    CardBrand,
    DigitalWalletType,
    CryptoCurrency,
    BlockchainNetwork,
    WalletType,
    TokenStandard,
    GasEstimate,
    GasConfidence,
    CryptoPaymentSession,
    PaymentSessionStatus,
    PaymentStatus,
    PaymentError,
    PaymentErrorType,
    PaymentFee,
    FeeType,
    CustomerInfo,
    KYCStatus,
    KYCLevel,
    VerificationDocument,
    DocumentType,
    DocumentStatus,
    BillingAddress,
    BankAccountInfo,
    BankAccountType,
    VerificationMethod,
    RiskAssessment,
    RiskLevel,
    RiskFactor,
    RiskFactorType as PaymentRiskFactorType,
    RiskRecommendation,
    RiskAction,
    VerificationType,
    PaymentMetadata,
    PaymentWebhook,
    WebhookType,
    PaymentProvider,
    PaymentAnalytics,
    TimeRange as PaymentTimeRange,
    TimeGranularity as PaymentTimeGranularity,
    PaymentMethodAnalytics,
    GeographicAnalytics,
    HourlyDistribution,
    DailyTrend,
    RiskDistribution,
    RevenueByMethod
} from './payment-system';

// Model Configuration Types
export * from './model-configuration';

// Firebase Auth Types - exclude AuthenticatedRequest to avoid conflict
export {
    UserContext,
    UserRole,
    Permission,
    ProviderData,
    UserMetadata,
    IFirebaseAuthMiddleware,
    RateLimitOptions,
    AuthenticationError,
    InvalidTokenError,
    ExpiredTokenError,
    RevokedTokenError,
    InsufficientPermissionsError,
    InsufficientRoleError,
    AccountDisabledError,
    EmailNotVerifiedError,
    InvalidSessionError,
    SessionExpiredError,
    RateLimitExceededError,
    TokenValidationResult,
    TokenType,
    SecurityFlag,
    SecurityFlagType,
    SecuritySeverity,
    TokenRefreshRequest,
    TokenRefreshResult,
    SecurityAssessment,
    SecurityRiskLevel,
    SecurityRiskFactor,
    RiskFactorType as AuthRiskFactorType,
    SecurityRecommendation,
    SecurityAction,
    RecommendationPriority as AuthRecommendationPriority,
    DeviceTrustLevel,
    LocationTrustLevel,
    BehaviorAnalysis,
    BehaviorProfile,
    TimePattern,
    HourRange,
    LocationPattern,
    DevicePattern,
    UsagePattern,
    UsageIntensity,
    BehaviorAnomaly,
    AnomalyType as AuthAnomalyType,
    AnomalySeverity as AuthAnomalySeverity,
    AnomalyEvidence,
    UserSession,
    DeviceInfo,
    DeviceType,
    LocationInfo,
    SessionMetadata,
    AuthenticationMethod,
    SessionActivity,
    SessionAction,
    SessionSecurityFlag,
    SessionSecurityFlagType,
    ISessionManager,
    SessionValidationResult,
    SessionRefreshResult,
    SecurityCheck,
    SecurityCheckType,
    SecurityIssue,
    SecurityIssueType,
    SessionStatistics,
    DeviceTypeStats,
    LocationStats,
    MFAConfiguration,
    MFAMethod,
    MFAChallenge,
    MFAChallengeStatus,
    MFAMethodData,
    BiometricType,
    MFAVerificationRequest,
    BiometricData,
    MFAVerificationResult,
    MFAError,
    RateLimitInfo,
    AuditContext
} from './firebase-auth';

// Notification System Types - exclude conflicting NotificationPreferences
// Export everything from notification-types except NotificationPreferences to avoid conflict with credit-system
// Users should import NotificationPreferences from the specific module they need

// Express Types
export {
    AuthenticatedRequest,
    AuthenticatedResponse,
    Request,
    Response
} from './express';