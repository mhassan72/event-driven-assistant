/**
 * Payment Calculator Utilities
 * Handles pricing calculations, fee computations, and currency conversions
 */

import { PaymentFee, FeeType } from '../../../shared/types/payment-system';

export interface PricingTier {
  minCredits: number;
  maxCredits: number;
  pricePerCredit: number;
  discountPercentage: number;
  name: string;
}

export interface FeeStructure {
  stripe: {
    percentage: number;
    fixedFee: number;
    internationalPercentage: number;
  };
  paypal: {
    percentage: number;
    fixedFee: number;
    internationalPercentage: number;
  };
}

export interface CurrencyConversion {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  lastUpdated: Date;
}

export class PaymentCalculator {
  private static readonly BASE_CREDIT_PRICE = 0.024; // $0.024 per credit
  private static readonly PRICING_TIERS: PricingTier[] = [
    {
      minCredits: 1,
      maxCredits: 499,
      pricePerCredit: 0.024,
      discountPercentage: 0,
      name: 'Pay as you go'
    },
    {
      minCredits: 500,
      maxCredits: 999,
      pricePerCredit: 0.022,
      discountPercentage: 8.33,
      name: 'Starter Pack'
    },
    {
      minCredits: 1000,
      maxCredits: 2499,
      pricePerCredit: 0.020,
      discountPercentage: 16.67,
      name: 'Popular Pack'
    },
    {
      minCredits: 2500,
      maxCredits: 4999,
      pricePerCredit: 0.018,
      discountPercentage: 25,
      name: 'Power User'
    },
    {
      minCredits: 5000,
      maxCredits: Infinity,
      pricePerCredit: 0.016,
      discountPercentage: 33.33,
      name: 'Enterprise'
    }
  ];

  private static readonly FEE_STRUCTURE: FeeStructure = {
    stripe: {
      percentage: 0.029, // 2.9%
      fixedFee: 0.30,
      internationalPercentage: 0.039 // 3.9% for international cards
    },
    paypal: {
      percentage: 0.0349, // 3.49%
      fixedFee: 0.49,
      internationalPercentage: 0.0449 // 4.49% for international
    }
  };

  /**
   * Calculate the total price for a given number of credits
   */
  static calculateCreditPrice(creditAmount: number): {
    basePrice: number;
    discountedPrice: number;
    discount: number;
    pricePerCredit: number;
    tier: PricingTier;
  } {
    const tier = this.getPricingTier(creditAmount);
    const basePrice = creditAmount * this.BASE_CREDIT_PRICE;
    const discountedPrice = creditAmount * tier.pricePerCredit;
    const discount = basePrice - discountedPrice;

    return {
      basePrice,
      discountedPrice,
      discount,
      pricePerCredit: tier.pricePerCredit,
      tier
    };
  }

  /**
   * Calculate payment processing fees
   */
  static calculateProcessingFees(
    amount: number,
    provider: 'stripe' | 'paypal',
    isInternational: boolean = false
  ): PaymentFee[] {
    const fees: PaymentFee[] = [];
    const feeConfig = this.FEE_STRUCTURE[provider];
    
    const percentage = isInternational ? feeConfig.internationalPercentage : feeConfig.percentage;
    const percentageFee = amount * percentage;
    const fixedFee = feeConfig.fixedFee;
    const totalFee = percentageFee + fixedFee;

    fees.push({
      type: FeeType.PROCESSING_FEE,
      amount: totalFee,
      currency: 'USD',
      description: `${provider.charAt(0).toUpperCase() + provider.slice(1)} processing fee (${(percentage * 100).toFixed(2)}% + $${fixedFee.toFixed(2)})`,
      provider
    });

    return fees;
  }

  /**
   * Calculate the final amount including all fees
   */
  static calculateFinalAmount(
    creditAmount: number,
    provider: 'stripe' | 'paypal',
    isInternational: boolean = false
  ): {
    creditPrice: number;
    fees: PaymentFee[];
    totalFees: number;
    finalAmount: number;
    netAmount: number;
  } {
    const pricing = this.calculateCreditPrice(creditAmount);
    const fees = this.calculateProcessingFees(pricing.discountedPrice, provider, isInternational);
    const totalFees = fees.reduce((sum, fee) => sum + fee.amount, 0);
    const finalAmount = pricing.discountedPrice + totalFees;

    return {
      creditPrice: pricing.discountedPrice,
      fees,
      totalFees,
      finalAmount,
      netAmount: pricing.discountedPrice
    };
  }

  /**
   * Get the appropriate pricing tier for a credit amount
   */
  static getPricingTier(creditAmount: number): PricingTier {
    return this.PRICING_TIERS.find(tier => 
      creditAmount >= tier.minCredits && creditAmount <= tier.maxCredits
    ) || this.PRICING_TIERS[0];
  }

  /**
   * Get all available pricing tiers
   */
  static getAllPricingTiers(): PricingTier[] {
    return [...this.PRICING_TIERS];
  }

  /**
   * Calculate savings compared to base price
   */
  static calculateSavings(creditAmount: number): {
    baseAmount: number;
    discountedAmount: number;
    savings: number;
    savingsPercentage: number;
  } {
    const baseAmount = creditAmount * this.BASE_CREDIT_PRICE;
    const pricing = this.calculateCreditPrice(creditAmount);
    const savings = baseAmount - pricing.discountedPrice;
    const savingsPercentage = (savings / baseAmount) * 100;

    return {
      baseAmount,
      discountedAmount: pricing.discountedPrice,
      savings,
      savingsPercentage
    };
  }

  /**
   * Convert currency amounts (mock implementation)
   */
  static async convertCurrency(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<CurrencyConversion> {
    // Mock implementation - would integrate with actual currency API
    const mockRates: Record<string, number> = {
      'USD_EUR': 0.85,
      'USD_GBP': 0.73,
      'USD_CAD': 1.25,
      'EUR_USD': 1.18,
      'GBP_USD': 1.37,
      'CAD_USD': 0.80
    };

    const rateKey = `${fromCurrency}_${toCurrency}`;
    const rate = mockRates[rateKey] || 1.0;

    return {
      fromCurrency,
      toCurrency,
      rate,
      lastUpdated: new Date()
    };
  }

  /**
   * Calculate recommended credit package based on usage patterns
   */
  static recommendCreditPackage(
    monthlyUsage: number,
    budget: number
  ): {
    recommendedCredits: number;
    tier: PricingTier;
    reasoning: string;
    alternatives: Array<{ credits: number; tier: PricingTier; cost: number }>;
  } {
    // Calculate credits needed for monthly usage with 20% buffer
    const recommendedCredits = Math.ceil(monthlyUsage * 1.2);
    
    // Find the best tier that fits the budget
    let bestTier = this.getPricingTier(recommendedCredits);
    let bestCredits = recommendedCredits;
    
    const pricing = this.calculateCreditPrice(recommendedCredits);
    if (pricing.discountedPrice > budget) {
      // Find the largest package within budget
      for (const tier of this.PRICING_TIERS.reverse()) {
        const maxCreditsInBudget = Math.floor(budget / tier.pricePerCredit);
        if (maxCreditsInBudget >= tier.minCredits) {
          bestCredits = Math.min(maxCreditsInBudget, tier.maxCredits);
          bestTier = tier;
          break;
        }
      }
    }

    // Generate alternatives
    const alternatives = this.PRICING_TIERS
      .filter(tier => tier !== bestTier)
      .map(tier => {
        const credits = Math.min(Math.max(recommendedCredits, tier.minCredits), tier.maxCredits);
        const cost = credits * tier.pricePerCredit;
        return { credits, tier, cost };
      })
      .sort((a, b) => a.cost - b.cost)
      .slice(0, 3);

    const reasoning = pricing.discountedPrice > budget
      ? `Recommended package adjusted to fit your budget of $${budget.toFixed(2)}`
      : `Recommended package provides ${recommendedCredits} credits with ${bestTier.discountPercentage.toFixed(1)}% savings`;

    return {
      recommendedCredits: bestCredits,
      tier: bestTier,
      reasoning,
      alternatives
    };
  }

  /**
   * Validate payment amount against limits
   */
  static validateAmount(
    amount: number,
    currency: string = 'USD',
    limits: { min: number; max: number }
  ): {
    isValid: boolean;
    errors: string[];
    convertedAmount: number;
  } {
    const errors: string[] = [];
    
    if (amount <= 0) {
      errors.push('Amount must be greater than 0');
    }
    
    if (amount < limits.min) {
      errors.push(`Amount must be at least $${limits.min.toFixed(2)}`);
    }
    
    if (amount > limits.max) {
      errors.push(`Amount cannot exceed $${limits.max.toFixed(2)}`);
    }
    
    // For now, assume all amounts are in USD
    const convertedAmount = amount;
    
    return {
      isValid: errors.length === 0,
      errors,
      convertedAmount
    };
  }
}