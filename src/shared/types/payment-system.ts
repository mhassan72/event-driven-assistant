/**
 * Payment System Types
 * Core interfaces for payment processing, Web3 payments, and financial transactions
 */

// ============================================================================
// Payment Request and Response Types
// ============================================================================

/**
 * Base payment request interface
 */
export interface PaymentRequest {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  creditAmount: number;
  paymentMethod: PaymentMethod;
  metadata: PaymentMetadata;
  
  // Saga coordination
  sagaId?: string;
  correlationId: string;
  idempotencyKey: string;
  
  // Security and fraud prevention
  riskAssessment: RiskAssessment;
  fraudScore: number;
  deviceFingerprint?: string;
  
  // Timing and expiration
  createdAt: Date;
  expiresAt: Date;
  
  // Customer information
  customerInfo?: CustomerInfo;
  billingAddress?: BillingAddress;
}

/**
 * Traditional payment request (credit cards, PayPal, etc.)
 */
export interface TraditionalPaymentRequest extends PaymentRequest {
  paymentMethod: TraditionalPaymentMethod;
  
  // Card payment specific
  cardToken?: string;
  cardLast4?: string;
  cardBrand?: CardBrand;
  
  // PayPal specific
  paypalOrderId?: string;
  paypalPayerId?: string;
  
  // Bank transfer specific
  bankAccount?: BankAccountInfo;
  
  // Apple/Google Pay
  digitalWalletToken?: string;
  digitalWalletType?: DigitalWalletType;
}

/**
 * Web3 cryptocurrency payment request
 */
export interface Web3PaymentRequest extends PaymentRequest {
  paymentMethod: Web3PaymentMethod;
  currency: CryptoCurrency;
  
  // Wallet and blockchain details
  walletAddress: string;
  walletType: WalletType;
  blockchain: BlockchainNetwork;
  
  // Transaction details
  cryptoAmount: number;
  exchangeRate: number;
  gasEstimate: GasEstimate;
  
  // Smart contract details
  contractAddress?: string;
  tokenStandard?: TokenStandard;
  
  // Security
  walletSignature?: string;
  nonce?: number;
}

/**
 * Payment processing result
 */
export interface PaymentResult {
  id: string;
  requestId: string;
  userId: string;
  status: PaymentStatus;
  amount: number;
  creditAmount: number;
  paymentMethod: PaymentMethod;
  
  // Provider details
  providerId: string;
  providerTransactionId: string;
  providerResponse: any;
  
  // Blockchain specific (for Web3 payments)
  transactionHash?: string;
  blockNumber?: number;
  confirmations?: number;
  
  // Timing
  processedAt: Date;
  confirmedAt?: Date;
  
  // Error handling
  error?: PaymentError;
  retryCount: number;
  
  // Performance metrics
  processingDuration: number;
  providerLatency: number;
  
  // Financial details
  fees: PaymentFee[];
  netAmount: number;
  exchangeRate?: number;
}

// ============================================================================
// Payment Method Types
// ============================================================================

export enum PaymentMethod {
  // Traditional methods
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  PAYPAL = 'paypal',
  BANK_TRANSFER = 'bank_transfer',
  APPLE_PAY = 'apple_pay',
  GOOGLE_PAY = 'google_pay',
  
  // Web3 methods
  BITCOIN = 'bitcoin',
  ETHEREUM = 'ethereum',
  USDC = 'usdc',
  USDT = 'usdt',
  POLYGON = 'polygon',
  BINANCE_SMART_CHAIN = 'binance_smart_chain'
}

export type TraditionalPaymentMethod = 
  | PaymentMethod.CREDIT_CARD
  | PaymentMethod.DEBIT_CARD
  | PaymentMethod.PAYPAL
  | PaymentMethod.BANK_TRANSFER
  | PaymentMethod.APPLE_PAY
  | PaymentMethod.GOOGLE_PAY;

export type Web3PaymentMethod = 
  | PaymentMethod.BITCOIN
  | PaymentMethod.ETHEREUM
  | PaymentMethod.USDC
  | PaymentMethod.USDT
  | PaymentMethod.POLYGON
  | PaymentMethod.BINANCE_SMART_CHAIN;

export enum CardBrand {
  VISA = 'visa',
  MASTERCARD = 'mastercard',
  AMERICAN_EXPRESS = 'american_express',
  DISCOVER = 'discover',
  JCB = 'jcb',
  DINERS_CLUB = 'diners_club',
  UNIONPAY = 'unionpay'
}

export enum DigitalWalletType {
  APPLE_PAY = 'apple_pay',
  GOOGLE_PAY = 'google_pay',
  SAMSUNG_PAY = 'samsung_pay',
  PAYPAL = 'paypal'
}

// ============================================================================
// Web3 and Cryptocurrency Types
// ============================================================================

export enum CryptoCurrency {
  BITCOIN = 'BTC',
  ETHEREUM = 'ETH',
  USDC = 'USDC',
  USDT = 'USDT',
  MATIC = 'MATIC',
  BNB = 'BNB',
  LITECOIN = 'LTC',
  BITCOIN_CASH = 'BCH',
  DOGECOIN = 'DOGE'
}

export enum BlockchainNetwork {
  BITCOIN = 'bitcoin',
  ETHEREUM = 'ethereum',
  POLYGON = 'polygon',
  BINANCE_SMART_CHAIN = 'binance_smart_chain',
  ARBITRUM = 'arbitrum',
  OPTIMISM = 'optimism',
  AVALANCHE = 'avalanche'
}

export enum WalletType {
  METAMASK = 'metamask',
  WALLET_CONNECT = 'wallet_connect',
  COINBASE_WALLET = 'coinbase_wallet',
  TRUST_WALLET = 'trust_wallet',
  LEDGER = 'ledger',
  TREZOR = 'trezor',
  PHANTOM = 'phantom',
  SOLFLARE = 'solflare'
}

export enum TokenStandard {
  ERC20 = 'ERC-20',
  ERC721 = 'ERC-721',
  ERC1155 = 'ERC-1155',
  BEP20 = 'BEP-20',
  SPL = 'SPL'
}

/**
 * Gas estimation for blockchain transactions
 */
export interface GasEstimate {
  gasLimit: number;
  gasPrice: number; // in wei or equivalent
  maxFeePerGas?: number;
  maxPriorityFeePerGas?: number;
  estimatedCost: number; // in native currency
  estimatedCostUSD: number;
  confidence: GasConfidence;
}

export enum GasConfidence {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

/**
 * Cryptocurrency payment session
 */
export interface CryptoPaymentSession {
  id: string;
  userId: string;
  currency: CryptoCurrency;
  usdAmount: number;
  cryptoAmount: number;
  exchangeRate: number;
  walletAddress: string;
  gasEstimate: GasEstimate;
  expiresAt: Date;
  status: PaymentSessionStatus;
  correlationId: string;
  createdAt: Date;
  
  // Payment details
  paymentAddress?: string;
  qrCode?: string;
  paymentUri?: string;
  
  // Monitoring
  confirmationTarget: number;
  currentConfirmations?: number;
  transactionHash?: string;
}

export enum PaymentSessionStatus {
  PENDING = 'pending',
  AWAITING_PAYMENT = 'awaiting_payment',
  CONFIRMING = 'confirming',
  CONFIRMED = 'confirmed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  FAILED = 'failed'
}

// ============================================================================
// Payment Status and Processing
// ============================================================================

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
  DISPUTED = 'disputed',
  EXPIRED = 'expired'
}

/**
 * Payment error details
 */
export interface PaymentError {
  code: string;
  message: string;
  type: PaymentErrorType;
  retryable: boolean;
  providerCode?: string;
  providerMessage?: string;
  details?: Record<string, any>;
}

export enum PaymentErrorType {
  VALIDATION_ERROR = 'validation_error',
  INSUFFICIENT_FUNDS = 'insufficient_funds',
  CARD_DECLINED = 'card_declined',
  EXPIRED_CARD = 'expired_card',
  INVALID_CARD = 'invalid_card',
  FRAUD_DETECTED = 'fraud_detected',
  PROCESSING_ERROR = 'processing_error',
  NETWORK_ERROR = 'network_error',
  PROVIDER_ERROR = 'provider_error',
  TIMEOUT_ERROR = 'timeout_error',
  CONFIGURATION_ERROR = 'configuration_error',
  COMPLIANCE_ERROR = 'compliance_error'
}

/**
 * Payment fee breakdown
 */
export interface PaymentFee {
  type: FeeType;
  amount: number;
  currency: string;
  description: string;
  provider?: string;
}

export enum FeeType {
  PROCESSING_FEE = 'processing_fee',
  TRANSACTION_FEE = 'transaction_fee',
  NETWORK_FEE = 'network_fee',
  GAS_FEE = 'gas_fee',
  EXCHANGE_FEE = 'exchange_fee',
  PLATFORM_FEE = 'platform_fee'
}

// ============================================================================
// Customer and Billing Information
// ============================================================================

/**
 * Customer information for payments
 */
export interface CustomerInfo {
  id?: string;
  email: string;
  name: string;
  phone?: string;
  dateOfBirth?: Date;
  
  // KYC information
  kycStatus?: KYCStatus;
  kycLevel?: KYCLevel;
  verificationDocuments?: VerificationDocument[];
  
  // Risk assessment
  riskLevel: RiskLevel;
  trustScore: number;
  accountAge: number; // in days
}

export enum KYCStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}

export enum KYCLevel {
  BASIC = 'basic',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced'
}

/**
 * Verification document
 */
export interface VerificationDocument {
  type: DocumentType;
  status: DocumentStatus;
  uploadedAt: Date;
  verifiedAt?: Date;
  expiresAt?: Date;
}

export enum DocumentType {
  PASSPORT = 'passport',
  DRIVERS_LICENSE = 'drivers_license',
  NATIONAL_ID = 'national_id',
  UTILITY_BILL = 'utility_bill',
  BANK_STATEMENT = 'bank_statement'
}

export enum DocumentStatus {
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}

/**
 * Billing address information
 */
export interface BillingAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  
  // Validation
  validated: boolean;
  validationScore?: number;
  validationProvider?: string;
}

/**
 * Bank account information
 */
export interface BankAccountInfo {
  accountNumber: string;
  routingNumber: string;
  accountType: BankAccountType;
  bankName: string;
  accountHolderName: string;
  
  // Verification
  verified: boolean;
  verificationMethod?: VerificationMethod;
  verifiedAt?: Date;
}

export enum BankAccountType {
  CHECKING = 'checking',
  SAVINGS = 'savings',
  BUSINESS_CHECKING = 'business_checking',
  BUSINESS_SAVINGS = 'business_savings'
}

export enum VerificationMethod {
  MICRO_DEPOSITS = 'micro_deposits',
  INSTANT_VERIFICATION = 'instant_verification',
  MANUAL_VERIFICATION = 'manual_verification'
}

// ============================================================================
// Risk Assessment and Fraud Prevention
// ============================================================================

/**
 * Risk assessment for payments
 */
export interface RiskAssessment {
  overallRisk: RiskLevel;
  riskScore: number; // 0-100
  factors: RiskFactor[];
  recommendations: RiskRecommendation[];
  assessedAt: Date;
  assessedBy: string; // system or analyst ID
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Individual risk factor
 */
export interface RiskFactor {
  type: RiskFactorType;
  score: number;
  weight: number;
  description: string;
  evidence?: any;
}

export enum RiskFactorType {
  VELOCITY = 'velocity',
  GEOLOCATION = 'geolocation',
  DEVICE_FINGERPRINT = 'device_fingerprint',
  BEHAVIORAL_PATTERN = 'behavioral_pattern',
  PAYMENT_HISTORY = 'payment_history',
  ACCOUNT_AGE = 'account_age',
  TRANSACTION_AMOUNT = 'transaction_amount',
  TIME_OF_DAY = 'time_of_day',
  IP_REPUTATION = 'ip_reputation',
  EMAIL_REPUTATION = 'email_reputation'
}

/**
 * Risk recommendation
 */
export interface RiskRecommendation {
  action: RiskAction;
  reason: string;
  confidence: number;
  additionalVerification?: VerificationType[];
}

export enum RiskAction {
  APPROVE = 'approve',
  REVIEW = 'review',
  DECLINE = 'decline',
  REQUIRE_VERIFICATION = 'require_verification',
  LIMIT_AMOUNT = 'limit_amount',
  DELAY_PROCESSING = 'delay_processing'
}

export enum VerificationType {
  TWO_FACTOR_AUTH = 'two_factor_auth',
  EMAIL_VERIFICATION = 'email_verification',
  PHONE_VERIFICATION = 'phone_verification',
  IDENTITY_VERIFICATION = 'identity_verification',
  ADDRESS_VERIFICATION = 'address_verification'
}

// ============================================================================
// Payment Metadata and Context
// ============================================================================

/**
 * Payment metadata for tracking and analysis
 */
export interface PaymentMetadata {
  // Transaction context
  sessionId?: string;
  userAgent?: string;
  ipAddress?: string;
  deviceId?: string;
  
  // Business context
  campaignId?: string;
  referralCode?: string;
  promotionCode?: string;
  
  // Integration context
  integrationId?: string;
  partnerId?: string;
  affiliateId?: string;
  
  // Custom fields
  customFields?: Record<string, any>;
  
  // Tracking
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  
  // Internal references
  orderId?: string;
  invoiceId?: string;
  subscriptionId?: string;
}

// ============================================================================
// Webhook and Event Types
// ============================================================================

/**
 * Payment webhook payload
 */
export interface PaymentWebhook {
  id: string;
  type: WebhookType;
  provider: PaymentProvider;
  paymentId: string;
  status: PaymentStatus;
  data: any;
  signature: string;
  timestamp: Date;
  
  // Processing
  processed: boolean;
  processedAt?: Date;
  retryCount: number;
  lastError?: string;
}

export enum WebhookType {
  PAYMENT_SUCCEEDED = 'payment.succeeded',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_CANCELLED = 'payment.cancelled',
  PAYMENT_REFUNDED = 'payment.refunded',
  PAYMENT_DISPUTED = 'payment.disputed',
  PAYMENT_CONFIRMED = 'payment.confirmed', // For crypto payments
  PAYMENT_PENDING = 'payment.pending'
}

export enum PaymentProvider {
  STRIPE = 'stripe',
  PAYPAL = 'paypal',
  SQUARE = 'square',
  ADYEN = 'adyen',
  BRAINTREE = 'braintree',
  COINBASE = 'coinbase',
  BITPAY = 'bitpay',
  BLOCKCHAIN_INFO = 'blockchain_info',
  CUSTOM = 'custom'
}

// ============================================================================
// Payment Analytics and Reporting
// ============================================================================

/**
 * Payment analytics data
 */
export interface PaymentAnalytics {
  timeRange: TimeRange;
  totalTransactions: number;
  totalAmount: number;
  totalCreditsIssued: number;
  
  // Success metrics
  successRate: number;
  averageProcessingTime: number;
  
  // Breakdown by method
  methodBreakdown: PaymentMethodAnalytics[];
  
  // Geographic breakdown
  geographicBreakdown: GeographicAnalytics[];
  
  // Temporal patterns
  hourlyDistribution: HourlyDistribution[];
  dailyTrends: DailyTrend[];
  
  // Risk and fraud
  fraudRate: number;
  riskDistribution: RiskDistribution[];
  
  // Revenue metrics
  totalRevenue: number;
  averageTransactionValue: number;
  revenueByMethod: RevenueByMethod[];
}

/**
 * Payment method analytics
 */
export interface PaymentMethodAnalytics {
  method: PaymentMethod;
  transactionCount: number;
  totalAmount: number;
  successRate: number;
  averageAmount: number;
  fraudRate: number;
}

/**
 * Geographic analytics
 */
export interface GeographicAnalytics {
  country: string;
  transactionCount: number;
  totalAmount: number;
  successRate: number;
  averageAmount: number;
}

/**
 * Hourly distribution
 */
export interface HourlyDistribution {
  hour: number; // 0-23
  transactionCount: number;
  totalAmount: number;
  successRate: number;
}

/**
 * Daily trend
 */
export interface DailyTrend {
  date: Date;
  transactionCount: number;
  totalAmount: number;
  successRate: number;
  newCustomers: number;
}

/**
 * Risk distribution
 */
export interface RiskDistribution {
  riskLevel: RiskLevel;
  transactionCount: number;
  percentage: number;
  successRate: number;
}

/**
 * Revenue by method
 */
export interface RevenueByMethod {
  method: PaymentMethod;
  revenue: number;
  fees: number;
  netRevenue: number;
  margin: number;
}

/**
 * Time range for analytics
 */
export interface TimeRange {
  startDate: Date;
  endDate: Date;
  granularity: TimeGranularity;
}

export enum TimeGranularity {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year'
}