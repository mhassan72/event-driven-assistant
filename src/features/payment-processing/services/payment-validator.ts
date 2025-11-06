/**
 * Payment Validator Service
 * Validates payment requests, performs fraud detection, and risk assessment
 */

import { 
  TraditionalPaymentRequest,
  Web3PaymentRequest,
  PaymentRequest,
  RiskAssessment,
  RiskLevel,
  RiskFactor,
  RiskFactorType,
  RiskRecommendation,
  RiskAction,
  PaymentError,
  PaymentErrorType
} from '../../../shared/types/payment-system';
import { IStructuredLogger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';

export interface IPaymentValidator {
  // Request validation
  validatePaymentRequest(request: PaymentRequest): Promise<ValidationResult>;
  validateTraditionalPayment(request: TraditionalPaymentRequest): Promise<ValidationResult>;
  validateWeb3Payment(request: Web3PaymentRequest): Promise<ValidationResult>;
  
  // Risk assessment
  assessRisk(request: PaymentRequest): Promise<RiskAssessment>;
  calculateFraudScore(request: PaymentRequest): Promise<number>;
  
  // Compliance checks
  checkComplianceRequirements(request: PaymentRequest): Promise<ComplianceResult>;
  validateKYC(userId: string): Promise<KYCResult>;
  
  // Amount validation
  validateAmount(amount: number, currency: string): Promise<AmountValidationResult>;
  checkDailyLimits(userId: string, amount: number): Promise<LimitCheckResult>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: PaymentError[];
  warnings: string[];
  riskAssessment: RiskAssessment;
  recommendedAction: RiskAction;
  processingTime: number;
}

export interface ComplianceResult {
  isCompliant: boolean;
  requiredActions: string[];
  kycRequired: boolean;
  additionalVerification: string[];
  restrictions: PaymentRestriction[];
}

export interface KYCResult {
  isVerified: boolean;
  level: string;
  requiredDocuments: string[];
  expiresAt?: Date;
}

export interface AmountValidationResult {
  isValid: boolean;
  convertedAmount: number;
  exchangeRate?: number;
  fees: number;
  minimumAmount: number;
  maximumAmount: number;
}

export interface LimitCheckResult {
  withinLimits: boolean;
  dailyUsed: number;
  dailyLimit: number;
  remainingLimit: number;
  resetTime: Date;
}

export interface PaymentRestriction {
  type: string;
  description: string;
  severity: 'warning' | 'error';
  canOverride: boolean;
}

export class PaymentValidator implements IPaymentValidator {
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  private fraudThreshold: number = 75; // Fraud score threshold (0-100)
  private maxDailyAmount: number = 10000; // Maximum daily amount in USD

  constructor(
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ) {
    this.logger = logger;
    this.metrics = metrics;
  }

  async validatePaymentRequest(request: PaymentRequest): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Validating payment request', {
        userId: request.userId,
        amount: request.amount,
        paymentMethod: request.paymentMethod,
        correlationId: request.correlationId
      });

      const errors: PaymentError[] = [];
      const warnings: string[] = [];

      // Basic validation
      await this.validateBasicFields(request, errors);
      
      // Amount validation
      const amountValidation = await this.validateAmount(request.amount, request.currency);
      if (!amountValidation.isValid) {
        errors.push({
          code: 'INVALID_AMOUNT',
          message: `Amount must be between $${amountValidation.minimumAmount} and $${amountValidation.maximumAmount}`,
          type: PaymentErrorType.VALIDATION_ERROR,
          retryable: false
        });
      }

      // Daily limits check
      const limitCheck = await this.checkDailyLimits(request.userId, request.amount);
      if (!limitCheck.withinLimits) {
        errors.push({
          code: 'DAILY_LIMIT_EXCEEDED',
          message: `Daily limit exceeded. Used: $${limitCheck.dailyUsed}, Limit: $${limitCheck.dailyLimit}`,
          type: PaymentErrorType.VALIDATION_ERROR,
          retryable: false
        });
      }

      // Risk assessment
      const riskAssessment = await this.assessRisk(request);
      
      // Add warnings based on risk level
      if (riskAssessment.overallRisk === RiskLevel.HIGH) {
        warnings.push('High risk transaction detected - additional verification may be required');
      } else if (riskAssessment.overallRisk === RiskLevel.MEDIUM) {
        warnings.push('Medium risk transaction - monitoring enabled');
      }

      // Compliance checks
      const complianceResult = await this.checkComplianceRequirements(request);
      if (!complianceResult.isCompliant) {
        complianceResult.requiredActions.forEach(action => {
          errors.push({
            code: 'COMPLIANCE_REQUIRED',
            message: action,
            type: PaymentErrorType.COMPLIANCE_ERROR,
            retryable: false
          });
        });
      }

      const result: ValidationResult = {
        isValid: errors.length === 0,
        errors,
        warnings,
        riskAssessment,
        recommendedAction: this.determineRecommendedAction(riskAssessment, errors),
        processingTime: Date.now() - startTime
      };

      this.metrics.incrementCounter('payment_validation_completed', {
        userId: request.userId,
        isValid: result.isValid.toString(),
        riskLevel: riskAssessment.overallRisk,
        errorCount: errors.length.toString()
      });

      this.logger.info('Payment request validation completed', {
        userId: request.userId,
        isValid: result.isValid,
        errorCount: errors.length,
        warningCount: warnings.length,
        riskLevel: riskAssessment.overallRisk,
        processingTime: result.processingTime
      });

      return result;

    } catch (error) {
      this.logger.error('Payment validation failed', {
        userId: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });

      this.metrics.incrementCounter('payment_validation_failed', {
        userId: request.userId,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      });

      throw error;
    }
  }

  async validateTraditionalPayment(request: TraditionalPaymentRequest): Promise<ValidationResult> {
    // First run general validation
    const baseValidation = await this.validatePaymentRequest(request);
    
    // Add traditional payment specific validations
    const errors = [...baseValidation.errors];
    const warnings = [...baseValidation.warnings];

    // Validate card details if present
    if (request.cardToken && request.cardLast4) {
      if (request.cardLast4.length !== 4 || !/^\d{4}$/.test(request.cardLast4)) {
        errors.push({
          code: 'INVALID_CARD_LAST4',
          message: 'Invalid card last 4 digits',
          type: PaymentErrorType.VALIDATION_ERROR,
          retryable: false
        });
      }
    }

    // Validate billing address if present
    if (request.billingAddress) {
      if (!request.billingAddress.country || request.billingAddress.country.length !== 2) {
        errors.push({
          code: 'INVALID_BILLING_COUNTRY',
          message: 'Invalid billing country code',
          type: PaymentErrorType.VALIDATION_ERROR,
          retryable: false
        });
      }
    }

    return {
      ...baseValidation,
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  async validateWeb3Payment(request: Web3PaymentRequest): Promise<ValidationResult> {
    // First run general validation
    const baseValidation = await this.validatePaymentRequest(request);
    
    // Add Web3 payment specific validations
    const errors = [...baseValidation.errors];
    const warnings = [...baseValidation.warnings];

    // Validate wallet address
    if (!this.isValidWalletAddress(request.walletAddress, request.blockchain)) {
      errors.push({
        code: 'INVALID_WALLET_ADDRESS',
        message: 'Invalid wallet address for the specified blockchain',
        type: PaymentErrorType.VALIDATION_ERROR,
        retryable: false
      });
    }

    // Validate crypto amount
    if (request.cryptoAmount <= 0) {
      errors.push({
        code: 'INVALID_CRYPTO_AMOUNT',
        message: 'Crypto amount must be greater than 0',
        type: PaymentErrorType.VALIDATION_ERROR,
        retryable: false
      });
    }

    // Validate gas estimate
    if (!request.gasEstimate || request.gasEstimate.gasLimit <= 0) {
      errors.push({
        code: 'INVALID_GAS_ESTIMATE',
        message: 'Valid gas estimate is required',
        type: PaymentErrorType.VALIDATION_ERROR,
        retryable: false
      });
    }

    // Check if gas fees are reasonable
    if (request.gasEstimate && request.gasEstimate.estimatedCostUSD > request.amount * 0.1) {
      warnings.push('Gas fees are high relative to transaction amount');
    }

    return {
      ...baseValidation,
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  async assessRisk(request: PaymentRequest): Promise<RiskAssessment> {
    const startTime = Date.now();
    
    try {
      const riskFactors: RiskFactor[] = [];
      
      // Velocity risk - check recent transaction frequency
      const velocityScore = await this.calculateVelocityRisk(request.userId);
      riskFactors.push({
        type: RiskFactorType.VELOCITY,
        score: velocityScore,
        weight: 0.25,
        description: 'Transaction frequency analysis',
        evidence: { recentTransactionCount: velocityScore }
      });

      // Amount risk - unusual amounts
      const amountScore = this.calculateAmountRisk(request.amount);
      riskFactors.push({
        type: RiskFactorType.TRANSACTION_AMOUNT,
        score: amountScore,
        weight: 0.20,
        description: 'Transaction amount analysis',
        evidence: { amount: request.amount, isUnusual: amountScore > 50 }
      });

      // Device fingerprint risk
      const deviceScore = await this.calculateDeviceRisk(request.deviceFingerprint);
      riskFactors.push({
        type: RiskFactorType.DEVICE_FINGERPRINT,
        score: deviceScore,
        weight: 0.15,
        description: 'Device fingerprint analysis',
        evidence: { deviceFingerprint: request.deviceFingerprint }
      });

      // Account age risk
      const accountAgeScore = await this.calculateAccountAgeRisk(request.userId);
      riskFactors.push({
        type: RiskFactorType.ACCOUNT_AGE,
        score: accountAgeScore,
        weight: 0.15,
        description: 'Account age analysis',
        evidence: { accountAgeScore }
      });

      // Time of day risk
      const timeScore = this.calculateTimeRisk();
      riskFactors.push({
        type: RiskFactorType.TIME_OF_DAY,
        score: timeScore,
        weight: 0.10,
        description: 'Time of day analysis',
        evidence: { hour: new Date().getHours() }
      });

      // Payment history risk
      const historyScore = await this.calculatePaymentHistoryRisk(request.userId);
      riskFactors.push({
        type: RiskFactorType.PAYMENT_HISTORY,
        score: historyScore,
        weight: 0.15,
        description: 'Payment history analysis',
        evidence: { historyScore }
      });

      // Calculate overall risk score
      const overallScore = riskFactors.reduce((sum: any, factor) => 
        sum + (factor.score * factor.weight), 0
      );

      // Determine risk level
      let overallRisk: RiskLevel;
      if (overallScore >= 80) overallRisk = RiskLevel.CRITICAL;
      else if (overallScore >= 60) overallRisk = RiskLevel.HIGH;
      else if (overallScore >= 40) overallRisk = RiskLevel.MEDIUM;
      else overallRisk = RiskLevel.LOW;

      // Generate recommendations
      const recommendations = this.generateRiskRecommendations(overallRisk, overallScore, riskFactors);

      const riskAssessment: RiskAssessment = {
        overallRisk,
        riskScore: overallScore,
        factors: riskFactors,
        recommendations,
        assessedAt: new Date(),
        assessedBy: 'automated_risk_engine'
      };

      this.metrics.incrementCounter('risk_assessment_completed', {
        userId: request.userId,
        riskLevel: overallRisk,
        riskScore: Math.round(overallScore).toString()
      });

      return riskAssessment;

    } catch (error) {
      this.logger.error('Risk assessment failed', {
        userId: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Return default low risk assessment on error
      return {
        overallRisk: RiskLevel.LOW,
        riskScore: 0,
        factors: [],
        recommendations: [],
        assessedAt: new Date(),
        assessedBy: 'automated_risk_engine'
      };
    }
  }

  async calculateFraudScore(request: PaymentRequest): Promise<number> {
    const riskAssessment = await this.assessRisk(request);
    return riskAssessment.riskScore;
  }

  async checkComplianceRequirements(request: PaymentRequest): Promise<ComplianceResult> {
    const requiredActions: string[] = [];
    const restrictions: PaymentRestriction[] = [];
    
    // Check KYC requirements
    const kycResult = await this.validateKYC(request.userId);
    const kycRequired = !kycResult.isVerified && request.amount > 100; // Require KYC for amounts > $100

    if (kycRequired) {
      requiredActions.push('Complete KYC verification for transactions over $100');
    }

    // Check amount limits
    if (request.amount > 5000 && !kycResult.isVerified) {
      restrictions.push({
        type: 'amount_limit',
        description: 'Transactions over $5000 require KYC verification',
        severity: 'error',
        canOverride: false
      });
    }

    // Check geographic restrictions (mock implementation)
    if (request.metadata?.ipAddress && this.isRestrictedRegion(request.metadata.ipAddress)) {
      restrictions.push({
        type: 'geographic_restriction',
        description: 'Payments not available in this region',
        severity: 'error',
        canOverride: false
      });
    }

    return {
      isCompliant: requiredActions.length === 0 && restrictions.filter(r => r.severity === 'error').length === 0,
      requiredActions,
      kycRequired,
      additionalVerification: kycRequired ? ['identity_verification'] : [],
      restrictions
    };
  }

  async validateKYC(userId: string): Promise<KYCResult> {
    // Mock KYC validation - would integrate with actual KYC provider
    return {
      isVerified: false, // Default to not verified
      level: 'basic',
      requiredDocuments: ['government_id', 'proof_of_address'],
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    };
  }

  async validateAmount(amount: number, currency: string): Promise<AmountValidationResult> {
    const minimumAmount = 0.50; // $0.50 minimum
    const maximumAmount = 10000; // $10,000 maximum
    
    return {
      isValid: amount >= minimumAmount && amount <= maximumAmount,
      convertedAmount: amount, // Assume USD for now
      fees: amount * 0.029 + 0.30, // Example fee structure
      minimumAmount,
      maximumAmount
    };
  }

  async checkDailyLimits(userId: string, amount: number): Promise<LimitCheckResult> {
    // Mock daily limit check - would query actual usage from database
    const dailyUsed = 0; // Would be fetched from database
    const dailyLimit = this.maxDailyAmount;
    
    return {
      withinLimits: (dailyUsed + amount) <= dailyLimit,
      dailyUsed,
      dailyLimit,
      remainingLimit: Math.max(0, dailyLimit - dailyUsed),
      resetTime: new Date(new Date().setHours(24, 0, 0, 0)) // Next midnight
    };
  }

  private async validateBasicFields(request: PaymentRequest, errors: PaymentError[]): Promise<void> {
    if (!request.userId || request.userId.trim().length === 0) {
      errors.push({
        code: 'MISSING_USER_ID',
        message: 'User ID is required',
        type: PaymentErrorType.VALIDATION_ERROR,
        retryable: false
      });
    }

    if (!request.amount || request.amount <= 0) {
      errors.push({
        code: 'INVALID_AMOUNT',
        message: 'Amount must be greater than 0',
        type: PaymentErrorType.VALIDATION_ERROR,
        retryable: false
      });
    }

    if (!request.currency || request.currency.length !== 3) {
      errors.push({
        code: 'INVALID_CURRENCY',
        message: 'Valid 3-letter currency code is required',
        type: PaymentErrorType.VALIDATION_ERROR,
        retryable: false
      });
    }

    if (!request.correlationId || request.correlationId.trim().length === 0) {
      errors.push({
        code: 'MISSING_CORRELATION_ID',
        message: 'Correlation ID is required',
        type: PaymentErrorType.VALIDATION_ERROR,
        retryable: false
      });
    }

    if (!request.idempotencyKey || request.idempotencyKey.trim().length === 0) {
      errors.push({
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency key is required',
        type: PaymentErrorType.VALIDATION_ERROR,
        retryable: false
      });
    }
  }

  private isValidWalletAddress(address: string, blockchain: string): boolean {
    // Mock wallet address validation - would use actual blockchain validation
    return address && address.length > 20 && address.startsWith('0x');
  }

  private async calculateVelocityRisk(userId: string): Promise<number> {
    // Mock velocity calculation - would query recent transactions
    return Math.random() * 50; // Random score for demo
  }

  private calculateAmountRisk(amount: number): number {
    // Higher risk for very small or very large amounts
    if (amount < 1 || amount > 5000) return 70;
    if (amount < 5 || amount > 1000) return 40;
    return 10;
  }

  private async calculateDeviceRisk(deviceFingerprint?: string): Promise<number> {
    // Mock device risk calculation
    return deviceFingerprint ? 20 : 50; // Higher risk if no fingerprint
  }

  private async calculateAccountAgeRisk(userId: string): Promise<number> {
    // Mock account age calculation - newer accounts are higher risk
    return Math.random() * 60; // Random score for demo
  }

  private calculateTimeRisk(): number {
    const hour = new Date().getHours();
    // Higher risk during unusual hours (2 AM - 6 AM)
    if (hour >= 2 && hour <= 6) return 60;
    if (hour >= 22 || hour <= 1) return 30;
    return 10;
  }

  private async calculatePaymentHistoryRisk(userId: string): Promise<number> {
    // Mock payment history risk - users with no history are higher risk
    return Math.random() * 40; // Random score for demo
  }

  private generateRiskRecommendations(
    riskLevel: RiskLevel, 
    riskScore: number, 
    factors: RiskFactor[]
  ): RiskRecommendation[] {
    const recommendations: RiskRecommendation[] = [];

    if (riskLevel === RiskLevel.CRITICAL) {
      recommendations.push({
        action: RiskAction.DECLINE,
        reason: 'Critical risk level detected',
        confidence: 0.95,
        additionalVerification: ['identity_verification', 'phone_verification']
      });
    } else if (riskLevel === RiskLevel.HIGH) {
      recommendations.push({
        action: RiskAction.REQUIRE_VERIFICATION,
        reason: 'High risk transaction requires additional verification',
        confidence: 0.85,
        additionalVerification: ['two_factor_auth', 'email_verification']
      });
    } else if (riskLevel === RiskLevel.MEDIUM) {
      recommendations.push({
        action: RiskAction.REVIEW,
        reason: 'Medium risk transaction should be monitored',
        confidence: 0.70
      });
    } else {
      recommendations.push({
        action: RiskAction.APPROVE,
        reason: 'Low risk transaction can proceed',
        confidence: 0.90
      });
    }

    return recommendations;
  }

  private determineRecommendedAction(riskAssessment: RiskAssessment, errors: PaymentError[]): RiskAction {
    if (errors.length > 0) return RiskAction.DECLINE;
    
    const primaryRecommendation = riskAssessment.recommendations[0];
    return primaryRecommendation ? primaryRecommendation.action : RiskAction.REVIEW;
  }

  private isRestrictedRegion(ipAddress: string): boolean {
    // Mock geographic restriction check
    return false; // No restrictions for demo
  }
}