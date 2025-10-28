/**
 * Environment Configuration Loader
 * Centralized configuration management with validation
 */

interface FirebaseConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  databaseUrl: string;
  storageBucket: string;
}

interface AIConfig {
  nebiusApiKey: string;
  nebiusApiUrl: string;
  openaiApiKey?: string;
}

interface PaymentConfig {
  stripe: {
    secretKey: string;
    webhookSecret: string;
    publishableKey: string;
  };
  web3: {
    providerUrl: string;
    ethereumPrivateKey?: string;
    bitcoinNetwork: 'mainnet' | 'testnet';
  };
}

interface CreditConfig {
  welcomeBonusCredits: number;
  minimumPurchaseUsd: number;
  creditsPerUsd: number;
  defaultCreditCostPerToken: number;
}

interface AppConfig {
  nodeEnv: string;
  frontendUrl: string;
  apiBaseUrl: string;
  logLevel: string;
  metricsEnabled: boolean;
}

class EnvironmentLoader {
  private static instance: EnvironmentLoader;
  private config: {
    firebase: FirebaseConfig;
    ai: AIConfig;
    payment: PaymentConfig;
    credit: CreditConfig;
    app: AppConfig;
  } | null = null;

  private constructor() {}

  static getInstance(): EnvironmentLoader {
    if (!EnvironmentLoader.instance) {
      EnvironmentLoader.instance = new EnvironmentLoader();
    }
    return EnvironmentLoader.instance;
  }

  loadConfig() {
    if (this.config) {
      return this.config;
    }

    // Validate required environment variables
    const requiredVars = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
      'FIREBASE_DATABASE_URL',
      'FIREBASE_STORAGE_BUCKET'
    ];

    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new Error(`Required environment variable ${varName} is not set`);
      }
    }

    this.config = {
      firebase: {
        projectId: process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
        databaseUrl: process.env.FIREBASE_DATABASE_URL!,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET!
      },
      ai: {
        nebiusApiKey: process.env.NEBIUS_API_KEY || '',
        nebiusApiUrl: process.env.NEBIUS_API_URL || 'https://api.studio.nebius.com/v1',
        openaiApiKey: process.env.OPENAI_API_KEY
      },
      payment: {
        stripe: {
          secretKey: process.env.STRIPE_SECRET_KEY || '',
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
          publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
        },
        web3: {
          providerUrl: process.env.WEB3_PROVIDER_URL || '',
          ethereumPrivateKey: process.env.ETHEREUM_PRIVATE_KEY,
          bitcoinNetwork: (process.env.BITCOIN_NETWORK as 'mainnet' | 'testnet') || 'testnet'
        }
      },
      credit: {
        welcomeBonusCredits: parseInt(process.env.WELCOME_BONUS_CREDITS || '1000'),
        minimumPurchaseUsd: parseFloat(process.env.MINIMUM_PURCHASE_USD || '0.50'),
        creditsPerUsd: parseInt(process.env.CREDITS_PER_USD || '42'),
        defaultCreditCostPerToken: parseFloat(process.env.DEFAULT_CREDIT_COST_PER_TOKEN || '0.1')
      },
      app: {
        nodeEnv: process.env.NODE_ENV || 'development',
        frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
        apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:5001',
        logLevel: process.env.LOG_LEVEL || 'info',
        metricsEnabled: process.env.METRICS_ENABLED === 'true'
      }
    };

    return this.config;
  }

  getFirebaseConfig(): FirebaseConfig {
    return this.loadConfig().firebase;
  }

  getAIConfig(): AIConfig {
    return this.loadConfig().ai;
  }

  getPaymentConfig(): PaymentConfig {
    return this.loadConfig().payment;
  }

  getCreditConfig(): CreditConfig {
    return this.loadConfig().credit;
  }

  getAppConfig(): AppConfig {
    return this.loadConfig().app;
  }

  isDevelopment(): boolean {
    return this.getAppConfig().nodeEnv === 'development';
  }

  isProduction(): boolean {
    return this.getAppConfig().nodeEnv === 'production';
  }
}

export const environmentLoader = EnvironmentLoader.getInstance();