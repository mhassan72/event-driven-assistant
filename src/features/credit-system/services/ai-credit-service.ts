/**
 * AI-Specific Credit Service
 * Manages credit deduction for AI interactions with dynamic pricing
 */

import { logger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';
import { CreditService } from './credit-service';
import { ILedgerService, LedgerService } from './ledger-service';
import { IBalanceSyncService, BalanceSyncService } from './balance-sync-service';
import { 
  ICreditService,
  CreditBalance,
  CreditTransaction,
  TransactionType,
  CreditSource,
  TransactionMetadata,
  LowBalanceAlert,
  AlertLevel,
  CreditUsageAnalytics,
  TimeRange
} from '../../../shared/types/credit-system';
import {
  TaskType
} from '../../../shared/types/ai-assistant';
// Firebase instances should be injected via constructor
import { v4 as uuidv4 } from 'uuid';

/**
 * AI interaction request for credit deduction
 */
export interface AIInteractionRequest {
  conversationId: string;
  messageLength: number;
  aiModel: string;
  taskType: TaskType;
  estimatedCost: number;
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  metadata?: Record<string, any>;
}

/**
 * AI usage analytics specific to AI interactions
 */
export interface AIUsageAnalytics extends CreditUsageAnalytics {
  // AI-specific metrics
  totalAIInteractions: number;
  averageCreditsPerInteraction: number;
  mostUsedModel: string;
  taskTypeBreakdown: TaskTypeUsage[];
  modelEfficiencyMetrics: ModelEfficiencyMetric[];
  conversationMetrics: ConversationMetrics;
}

export interface TaskTypeUsage {
  taskType: TaskType;
  interactionCount: number;
  creditsUsed: number;
  averageCreditsPerInteraction: number;
  percentage: number;
}

export interface ModelEfficiencyMetric {
  modelId: string;
  modelName: string;
  interactionCount: number;
  totalCreditsUsed: number;
  averageCreditsPerInteraction: number;
  averageTokensPerCredit: number;
  costEfficiencyScore: number; // 1-10
}

export interface ConversationMetrics {
  totalConversations: number;
  averageMessagesPerConversation: number;
  averageCreditsPerConversation: number;
  longestConversation: number;
  mostActiveDay: Date;
}

/**
 * Welcome bonus configuration
 */
export interface WelcomeBonusConfig {
  amount: number;
  eligibilityRules: EligibilityRule[];
  trackingMethods: TrackingMethod[];
}

export interface EligibilityRule {
  type: 'email_verification' | 'device_fingerprint' | 'phone_verification';
  required: boolean;
  description: string;
}

export enum TrackingMethod {
  EMAIL = 'email',
  DEVICE_FINGERPRINT = 'device_fingerprint',
  IP_ADDRESS = 'ip_address',
  PHONE_NUMBER = 'phone_number'
}

/**
 * Low balance notification configuration
 */
export interface LowBalanceConfig {
  thresholds: {
    warning: number;    // 100 credits
    critical: number;   // 50 credits
    urgent: number;     // 10 credits
  };
  notifications: {
    email: boolean;
    push: boolean;
    realtime: boolean;
  };
  estimatedDaysCalculation: boolean;
}

/**
 * AI-specific credit service interface
 */
export interface IAICreditService extends ICreditService {
  // AI interaction credit management
  deductCreditsForAIInteraction(userId: string, request: AIInteractionRequest): Promise<CreditTransaction>;
  estimateAIInteractionCost(request: Partial<AIInteractionRequest>): Promise<number>;
  
  // Welcome bonus management
  grantWelcomeBonus(userId: string, deviceFingerprint?: string): Promise<CreditTransaction>;
  checkWelcomeBonusEligibility(userId: string, email: string, deviceFingerprint?: string): Promise<boolean>;
  
  // Usage tracking and analytics
  getAIUsageAnalytics(userId: string, timeRange: TimeRange): Promise<AIUsageAnalytics>;
  trackModelUsage(userId: string, modelId: string, creditsUsed: number, tokensUsed: number): Promise<void>;
  
  // Low balance detection and notifications
  checkLowBalanceThreshold(userId: string): Promise<LowBalanceAlert | null>;
  updateLowBalanceThresholds(userId: string, thresholds: Partial<LowBalanceConfig['thresholds']>): Promise<void>;
  
  // Real-time balance subscriptions
  subscribeToBalanceUpdates(userId: string, callback: (balance: CreditBalance) => void): Promise<() => void>;
  broadcastBalanceUpdate(userId: string, balance: CreditBalance): Promise<void>;
}

/**
 * AI-specific credit service implementation
 */
export class AICreditService extends CreditService implements IAICreditService {
  private firestore = getFirestore();
  private ledgerService: ILedgerService;
  private balanceSyncService: IBalanceSyncService;
  private welcomeBonusConfig: WelcomeBonusConfig;
  private lowBalanceConfig: LowBalanceConfig;

  constructor(metrics: IMetricsCollector, config?: {
    welcomeBonus?: Partial<WelcomeBonusConfig>;
    lowBalance?: Partial<LowBalanceConfig>;
    ledgerService?: ILedgerService;
    balanceSyncService?: IBalanceSyncService;
  }) {
    super(metrics);
    
    // Initialize services
    this.ledgerService = config?.ledgerService || new LedgerService(metrics);
    this.balanceSyncService = config?.balanceSyncService || new BalanceSyncService(metrics);
    
    // Configure welcome bonus
    this.welcomeBonusConfig = {
      amount: 1000,
      eligibilityRules: [
        { type: 'email_verification', required: true, description: 'Email must be verified' },
        { type: 'device_fingerprint', required: false, description: 'Device fingerprint for duplicate detection' }
      ],
      trackingMethods: [TrackingMethod.EMAIL, TrackingMethod.DEVICE_FINGERPRINT],
      ...config?.welcomeBonus
    };

    // Configure low balance alerts
    this.lowBalanceConfig = {
      thresholds: {
        warning: 100,
        critical: 50,
        urgent: 10
      },
      notifications: {
        email: true,
        push: true,
        realtime: true
      },
      estimatedDaysCalculation: true,
      ...config?.lowBalance
    };
  }

  /**
   * Deduct credits for AI interaction with dynamic pricing
   */
  async deductCreditsForAIInteraction(
    userId: string, 
    request: AIInteractionRequest
  ): Promise<CreditTransaction> {
    const correlationId = uuidv4();
    
    try {
      // Validate sufficient balance
      const hasBalance = await this.validateBalance(userId, request.estimatedCost);
      if (!hasBalance) {
        throw new Error(`Insufficient credits for AI interaction. Required: ${request.estimatedCost}`);
      }

      // Create AI-specific metadata
      const metadata: TransactionMetadata = {
        conversationId: request.conversationId,
        messageLength: request.messageLength,
        aiModel: request.aiModel,
        taskType: request.taskType,
        inputTokens: request.inputTokens,
        outputTokens: request.outputTokens,
        imageCount: request.imageCount,
        featureId: 'ai-assistant',
        ...request.metadata
      };

      // Deduct credits using base service
      const transaction = await this.deductCredits(
        userId,
        request.estimatedCost,
        correlationId,
        {
          ...metadata,
          reason: `AI ${request.taskType} interaction`
        }
      );

      // Record transaction in blockchain ledger
      await this.ledgerService.recordTransaction(transaction);

      // Track AI-specific usage
      await this.trackAIInteraction(userId, request, transaction);

      // Check for low balance and send alerts
      await this.checkAndSendLowBalanceAlert(userId);

      // Record AI-specific metrics
      this.metrics.increment('ai.credits.deducted', 1, {
        task_type: request.taskType,
        model: request.aiModel,
        cost_range: this.getAICostRange(request.estimatedCost)
      });

      this.metrics.histogram('ai.credits.interaction_cost', request.estimatedCost, {
        task_type: request.taskType,
        model: request.aiModel
      });

      logger.info('AI interaction credits deducted', {
        userId,
        transactionId: transaction.id,
        taskType: request.taskType,
        model: request.aiModel,
        creditsUsed: request.estimatedCost,
        correlationId
      });

      return transaction;

    } catch (error) {
      logger.error('Failed to deduct credits for AI interaction', {
        userId,
        taskType: request.taskType,
        model: request.aiModel,
        estimatedCost: request.estimatedCost,
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      this.metrics.increment('ai.credits.deduction_errors', 1, {
        task_type: request.taskType,
        model: request.aiModel,
        error_type: this.categorizeError(error)
      });

      throw error;
    }
  }

  /**
   * Estimate cost for AI interaction
   */
  async estimateAIInteractionCost(request: Partial<AIInteractionRequest>): Promise<number> {
    try {
      // Base cost calculation based on task type
      let baseCost = this.getBaseCostForTaskType(request.taskType || TaskType.QUICK_CHAT);

      // Adjust for message length
      if (request.messageLength) {
        const lengthMultiplier = Math.max(1, Math.ceil(request.messageLength / 1000));
        baseCost *= lengthMultiplier;
      }

      // Adjust for token usage if provided
      if (request.inputTokens && request.outputTokens) {
        const tokenCost = this.calculateTokenCost(
          request.inputTokens,
          request.outputTokens,
          request.aiModel
        );
        baseCost = Math.max(baseCost, tokenCost);
      }

      // Adjust for image generation
      if (request.imageCount && request.imageCount > 0) {
        baseCost += request.imageCount * this.getImageGenerationCost();
      }

      // Apply model-specific multipliers
      if (request.aiModel) {
        const modelMultiplier = await this.getModelCostMultiplier(request.aiModel);
        baseCost *= modelMultiplier;
      }

      return Math.ceil(baseCost);

    } catch (error) {
      logger.error('Failed to estimate AI interaction cost', {
        request,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Return default cost on error
      return this.getBaseCostForTaskType(request.taskType || TaskType.QUICK_CHAT);
    }
  }

  /**
   * Grant welcome bonus to new users
   */
  async grantWelcomeBonus(
    userId: string, 
    deviceFingerprint?: string
  ): Promise<CreditTransaction> {
    try {
      // Check eligibility
      const user = await this.firestore.collection('users').doc(userId).get();
      if (!user.exists) {
        throw new Error('User not found');
      }

      const userData = user.data();
      const isEligible = await this.checkWelcomeBonusEligibility(
        userId,
        userData?.email,
        deviceFingerprint
      );

      if (!isEligible) {
        throw new Error('User not eligible for welcome bonus');
      }

      // Grant welcome bonus
      const transaction = await this.addCredits(
        userId,
        this.welcomeBonusConfig.amount,
        CreditSource.WELCOME_BONUS,
        'Welcome bonus for new AI assistant user',
        {
          deviceFingerprint,
          grantedAt: new Date().toISOString(),
          eligibilityChecked: true
        }
      );

      // Record welcome bonus in blockchain ledger
      await this.ledgerService.recordTransaction(transaction);

      // Mark user as having received welcome bonus
      await this.firestore.collection('users').doc(userId).update({
        welcomeBonusGranted: true,
        welcomeBonusGrantedAt: new Date(),
        welcomeBonusTransactionId: transaction.id
      });

      // Track welcome bonus in separate collection for audit
      await this.firestore.collection('welcome_bonus_grants').doc(transaction.id).set({
        userId,
        transactionId: transaction.id,
        amount: this.welcomeBonusConfig.amount,
        deviceFingerprint,
        grantedAt: new Date(),
        eligibilityRules: this.welcomeBonusConfig.eligibilityRules
      });

      this.metrics.increment('ai.welcome_bonus.granted', 1);

      logger.info('Welcome bonus granted', {
        userId,
        transactionId: transaction.id,
        amount: this.welcomeBonusConfig.amount,
        deviceFingerprint
      });

      return transaction;

    } catch (error) {
      logger.error('Failed to grant welcome bonus', {
        userId,
        deviceFingerprint,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      this.metrics.increment('ai.welcome_bonus.errors', 1, {
        error_type: this.categorizeError(error)
      });

      throw error;
    }
  }

  /**
   * Check welcome bonus eligibility
   */
  async checkWelcomeBonusEligibility(
    userId: string, 
    email: string, 
    deviceFingerprint?: string
  ): Promise<boolean> {
    try {
      // Check if user already received welcome bonus
      const user = await this.firestore.collection('users').doc(userId).get();
      if (user.exists && user.data()?.welcomeBonusGranted) {
        return false;
      }

      // Check email-based eligibility
      if (email) {
        const emailQuery = await this.firestore
          .collection('welcome_bonus_grants')
          .where('userId', '!=', userId)
          .get();

        for (const doc of emailQuery.docs) {
          const grantData = doc.data();
          const grantUser = await this.firestore.collection('users').doc(grantData.userId).get();
          if (grantUser.exists && grantUser.data()?.email === email) {
            logger.warn('Welcome bonus eligibility failed: email already used', {
              userId,
              email,
              previousUserId: grantData.userId
            });
            return false;
          }
        }
      }

      // Check device fingerprint if provided
      if (deviceFingerprint) {
        const fingerprintQuery = await this.firestore
          .collection('welcome_bonus_grants')
          .where('deviceFingerprint', '==', deviceFingerprint)
          .get();

        if (!fingerprintQuery.empty) {
          logger.warn('Welcome bonus eligibility failed: device fingerprint already used', {
            userId,
            deviceFingerprint,
            previousGrants: fingerprintQuery.docs.length
          });
          return false;
        }
      }

      return true;

    } catch (error) {
      logger.error('Failed to check welcome bonus eligibility', {
        userId,
        email,
        deviceFingerprint,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Get AI usage analytics
   */
  async getAIUsageAnalytics(userId: string, timeRange: TimeRange): Promise<AIUsageAnalytics> {
    try {
      // Get base analytics from parent class
      const baseAnalytics = await this.getUserUsageAnalytics(userId, timeRange);

      // Get AI-specific transaction data
      const aiTransactions = await this.firestore
        .collection('credit_transactions')
        .where('userId', '==', userId)
        .where('source', '==', CreditSource.AI_USAGE)
        .where('timestamp', '>=', timeRange.startDate)
        .where('timestamp', '<=', timeRange.endDate)
        .get();

      const transactions = aiTransactions.docs.map(doc => doc.data());

      // Calculate AI-specific metrics
      const totalAIInteractions = transactions.length;
      const totalCreditsUsed = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const averageCreditsPerInteraction = totalAIInteractions > 0 ? totalCreditsUsed / totalAIInteractions : 0;

      // Task type breakdown
      const taskTypeMap = new Map<TaskType, { count: number; credits: number }>();
      transactions.forEach(t => {
        const taskType = t.metadata?.taskType as TaskType || TaskType.QUICK_CHAT;
        const current = taskTypeMap.get(taskType) || { count: 0, credits: 0 };
        taskTypeMap.set(taskType, {
          count: current.count + 1,
          credits: current.credits + Math.abs(t.amount)
        });
      });

      const taskTypeBreakdown: TaskTypeUsage[] = Array.from(taskTypeMap.entries()).map(([taskType, data]) => ({
        taskType,
        interactionCount: data.count,
        creditsUsed: data.credits,
        averageCreditsPerInteraction: data.count > 0 ? data.credits / data.count : 0,
        percentage: totalCreditsUsed > 0 ? (data.credits / totalCreditsUsed) * 100 : 0
      }));

      // Model efficiency metrics
      const modelMap = new Map<string, { count: number; credits: number; tokens: number }>();
      transactions.forEach(t => {
        const model = t.metadata?.aiModel || 'unknown';
        const tokens = (t.metadata?.inputTokens || 0) + (t.metadata?.outputTokens || 0);
        const current = modelMap.get(model) || { count: 0, credits: 0, tokens: 0 };
        modelMap.set(model, {
          count: current.count + 1,
          credits: current.credits + Math.abs(t.amount),
          tokens: current.tokens + tokens
        });
      });

      const modelEfficiencyMetrics: ModelEfficiencyMetric[] = Array.from(modelMap.entries()).map(([modelId, data]) => ({
        modelId,
        modelName: modelId, // TODO: Get actual model name from model registry
        interactionCount: data.count,
        totalCreditsUsed: data.credits,
        averageCreditsPerInteraction: data.count > 0 ? data.credits / data.count : 0,
        averageTokensPerCredit: data.credits > 0 ? data.tokens / data.credits : 0,
        costEfficiencyScore: this.calculateCostEfficiencyScore(data.credits, data.tokens, data.count)
      }));

      // Conversation metrics
      const conversationIds = new Set(transactions.map(t => t.metadata?.conversationId).filter(Boolean));
      const conversationMetrics: ConversationMetrics = {
        totalConversations: conversationIds.size,
        averageMessagesPerConversation: conversationIds.size > 0 ? totalAIInteractions / conversationIds.size : 0,
        averageCreditsPerConversation: conversationIds.size > 0 ? totalCreditsUsed / conversationIds.size : 0,
        longestConversation: 0, // TODO: Calculate from conversation data
        mostActiveDay: new Date() // TODO: Calculate from daily usage
      };

      // Find most used model
      const mostUsedModel = modelEfficiencyMetrics.reduce((prev, current) => 
        current.interactionCount > prev.interactionCount ? current : prev,
        modelEfficiencyMetrics[0]
      )?.modelId || 'none';

      return {
        ...baseAnalytics,
        totalAIInteractions,
        averageCreditsPerInteraction,
        mostUsedModel,
        taskTypeBreakdown,
        modelEfficiencyMetrics,
        conversationMetrics
      };

    } catch (error) {
      logger.error('Failed to get AI usage analytics', {
        userId,
        timeRange,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Check low balance threshold and return alert if needed
   */
  async checkLowBalanceThreshold(userId: string): Promise<LowBalanceAlert | null> {
    try {
      const balance = await this.getBalance(userId);
      const thresholds = this.lowBalanceConfig.thresholds;

      let alertLevel: AlertLevel | null = null;
      let threshold = 0;

      if (balance.currentBalance <= thresholds.urgent) {
        alertLevel = AlertLevel.URGENT;
        threshold = thresholds.urgent;
      } else if (balance.currentBalance <= thresholds.critical) {
        alertLevel = AlertLevel.CRITICAL;
        threshold = thresholds.critical;
      } else if (balance.currentBalance <= thresholds.warning) {
        alertLevel = AlertLevel.WARNING;
        threshold = thresholds.warning;
      }

      if (!alertLevel) {
        return null;
      }

      // Calculate estimated days remaining
      let estimatedDaysRemaining = 0;
      if (this.lowBalanceConfig.estimatedDaysCalculation) {
        estimatedDaysRemaining = await this.calculateEstimatedDaysRemaining(userId, balance.currentBalance);
      }

      const alert: LowBalanceAlert = {
        userId,
        currentBalance: balance.currentBalance,
        threshold,
        alertLevel,
        message: this.generateLowBalanceMessage(alertLevel, balance.currentBalance, threshold),
        recommendedAction: this.getRecommendedAction(alertLevel, balance.currentBalance),
        estimatedDaysRemaining
      };

      // Record alert metrics
      this.metrics.increment('ai.low_balance.alerts', 1, {
        alert_level: alertLevel,
        balance_range: this.getBalanceRange(balance.currentBalance)
      });

      return alert;

    } catch (error) {
      logger.error('Failed to check low balance threshold', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Subscribe to real-time balance updates
   */
  async subscribeToBalanceUpdates(
    userId: string, 
    callback: (balance: CreditBalance) => void
  ): Promise<() => void> {
    return await this.balanceSyncService.subscribeToBalanceChanges(userId, (balance, changeType) => {
      callback(balance);
    });
  }

  /**
   * Broadcast balance update to all subscribers
   */
  async broadcastBalanceUpdate(userId: string, balance: CreditBalance): Promise<void> {
    await this.balanceSyncService.broadcastBalanceUpdate(userId, balance);
  }

  // Private helper methods

  private async trackAIInteraction(
    userId: string, 
    request: AIInteractionRequest, 
    transaction: CreditTransaction
  ): Promise<void> {
    try {
      await this.firestore.collection('ai_interactions').doc(transaction.id).set({
        userId,
        transactionId: transaction.id,
        conversationId: request.conversationId,
        taskType: request.taskType,
        model: request.aiModel,
        creditsUsed: request.estimatedCost,
        inputTokens: request.inputTokens || 0,
        outputTokens: request.outputTokens || 0,
        messageLength: request.messageLength,
        timestamp: new Date(),
        metadata: request.metadata || {}
      });
    } catch (error) {
      logger.error('Failed to track AI interaction', {
        userId,
        transactionId: transaction.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw - this is not critical for the main operation
    }
  }

  private async checkAndSendLowBalanceAlert(userId: string): Promise<void> {
    try {
      const alert = await this.checkLowBalanceThreshold(userId);
      if (alert) {
        // Store alert for notification system to pick up
        await this.firestore.collection('low_balance_alerts').doc(`${userId}_${Date.now()}`).set({
          ...alert,
          createdAt: new Date(),
          processed: false
        });

        logger.info('Low balance alert created', {
          userId,
          alertLevel: alert.alertLevel,
          currentBalance: alert.currentBalance,
          threshold: alert.threshold
        });
      }
    } catch (error) {
      logger.error('Failed to check and send low balance alert', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw - this is not critical
    }
  }

  private getBaseCostForTaskType(taskType: TaskType): number {
    const baseCosts = {
      [TaskType.QUICK_CHAT]: 5,
      [TaskType.IMAGE_GENERATION]: 50,
      [TaskType.RESEARCH_TASK]: 25,
      [TaskType.CODE_GENERATION]: 15,
      [TaskType.DATA_ANALYSIS]: 20,
      [TaskType.LONG_FORM_WRITING]: 30,
      [TaskType.MULTI_STEP_WORKFLOW]: 40,
      [TaskType.VISION_ANALYSIS]: 35
    };
    return baseCosts[taskType] || 10;
  }

  private calculateTokenCost(inputTokens: number, outputTokens: number, model?: string): number {
    // Base token costs (credits per 1k tokens)
    const inputCostPer1k = 2;
    const outputCostPer1k = 4;
    
    const inputCost = (inputTokens / 1000) * inputCostPer1k;
    const outputCost = (outputTokens / 1000) * outputCostPer1k;
    
    return Math.ceil(inputCost + outputCost);
  }

  private getImageGenerationCost(): number {
    return 50; // Base cost per image
  }

  private async getModelCostMultiplier(modelId: string): Promise<number> {
    try {
      const modelDoc = await this.firestore.collection('available_models').doc(modelId).get();
      if (modelDoc.exists) {
        const modelData = modelDoc.data();
        return modelData?.pricing?.costMultiplier || 1.0;
      }
    } catch (error) {
      logger.warn('Failed to get model cost multiplier', { modelId, error });
    }
    return 1.0; // Default multiplier
  }

  private calculateCostEfficiencyScore(credits: number, tokens: number, interactions: number): number {
    if (credits === 0 || tokens === 0 || interactions === 0) return 0;
    
    const tokensPerCredit = tokens / credits;
    const creditsPerInteraction = credits / interactions;
    
    // Higher tokens per credit and lower credits per interaction = better efficiency
    // Normalize to 1-10 scale
    const efficiency = (tokensPerCredit / creditsPerInteraction) * 10;
    return Math.min(10, Math.max(1, Math.round(efficiency)));
  }

  private async calculateEstimatedDaysRemaining(userId: string, currentBalance: number): Promise<number> {
    try {
      // Get usage from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentTransactions = await this.firestore
        .collection('credit_transactions')
        .where('userId', '==', userId)
        .where('type', '==', TransactionType.CREDIT_DEDUCTION)
        .where('timestamp', '>=', thirtyDaysAgo)
        .get();

      if (recentTransactions.empty) {
        return 999; // No recent usage, return high number
      }

      const totalUsed = recentTransactions.docs.reduce((sum, doc) => 
        sum + Math.abs(doc.data().amount), 0
      );
      
      const dailyAverage = totalUsed / 30;
      
      if (dailyAverage <= 0) {
        return 999;
      }

      return Math.floor(currentBalance / dailyAverage);

    } catch (error) {
      logger.error('Failed to calculate estimated days remaining', {
        userId,
        currentBalance,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }

  private generateLowBalanceMessage(level: AlertLevel, balance: number, threshold: number): string {
    switch (level) {
      case AlertLevel.URGENT:
        return `Critical: Only ${balance} credits remaining! Your account will be unable to use AI features soon.`;
      case AlertLevel.CRITICAL:
        return `Warning: Low credit balance of ${balance}. Consider topping up to continue using AI features.`;
      case AlertLevel.WARNING:
        return `Notice: Your credit balance (${balance}) is below the warning threshold of ${threshold}.`;
      default:
        return `Your credit balance is ${balance}.`;
    }
  }

  private getRecommendedAction(level: AlertLevel, balance: number): string {
    switch (level) {
      case AlertLevel.URGENT:
        return 'Add credits immediately to avoid service interruption';
      case AlertLevel.CRITICAL:
        return 'Add credits soon to ensure continued AI assistant access';
      case AlertLevel.WARNING:
        return 'Consider adding credits when convenient';
      default:
        return 'Monitor usage and add credits as needed';
    }
  }

  private getAICostRange(cost: number): string {
    if (cost <= 5) return '1-5';
    if (cost <= 15) return '6-15';
    if (cost <= 30) return '16-30';
    if (cost <= 50) return '31-50';
    return '50+';
  }

  private getBalanceRange(balance: number): string {
    if (balance <= 10) return '0-10';
    if (balance <= 50) return '11-50';
    if (balance <= 100) return '51-100';
    if (balance <= 500) return '101-500';
    return '500+';
  }

  private categorizeError(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('insufficient')) return 'insufficient_credits';
      if (error.message.includes('not found')) return 'not_found';
      if (error.message.includes('validation')) return 'validation_error';
      if (error.message.includes('timeout')) return 'timeout';
      if (error.message.includes('eligibility')) return 'eligibility_error';
    }
    return 'unknown_error';
  }
}