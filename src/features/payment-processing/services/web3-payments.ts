/**
 * Web3 Payment Service
 * Handles cryptocurrency payments, wallet connections, and blockchain transactions
 */

import { 
  Web3PaymentRequest, 
  PaymentResult, 
  PaymentStatus,
  CryptoCurrency,
  BlockchainNetwork,
  WalletType,
  GasEstimate,
  PaymentFee,
  FeeType,
  PaymentProvider,
  CryptoPaymentSession,
  PaymentSessionStatus
} from '../../../shared/types/payment-system';
import { IStructuredLogger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';

export interface IWeb3PaymentService {
  // Wallet connection and validation
  connectWallet(walletAddress: string, walletType: WalletType, signature: string): Promise<WalletConnectionResult>;
  validateWalletAddress(address: string, blockchain: BlockchainNetwork): Promise<WalletValidationResult>;
  
  // Payment session management
  createPaymentSession(request: Web3PaymentRequest): Promise<CryptoPaymentSession>;
  getPaymentSession(sessionId: string): Promise<CryptoPaymentSession>;
  updatePaymentSession(sessionId: string, updates: Partial<CryptoPaymentSession>): Promise<CryptoPaymentSession>;
  
  // Gas estimation and pricing
  estimateGasFees(blockchain: BlockchainNetwork, transactionType: string, amount: number): Promise<GasEstimate>;
  getCryptoExchangeRates(currencies: CryptoCurrency[]): Promise<ExchangeRateResult[]>;
  convertUSDToCrypto(usdAmount: number, currency: CryptoCurrency): Promise<CryptoConversionResult>;
  
  // Transaction processing
  processWeb3Payment(request: Web3PaymentRequest): Promise<PaymentResult>;
  monitorTransaction(transactionHash: string, blockchain: BlockchainNetwork): Promise<TransactionStatus>;
  confirmTransaction(transactionHash: string, requiredConfirmations: number): Promise<TransactionConfirmation>;
  
  // Multi-currency support
  getSupportedCurrencies(): Promise<SupportedCurrency[]>;
  getNetworkStatus(blockchain: BlockchainNetwork): Promise<NetworkStatus>;
  
  // Payment utilities
  generatePaymentQRCode(session: CryptoPaymentSession): Promise<string>;
  generatePaymentURI(session: CryptoPaymentSession): Promise<string>;
}

export interface WalletConnectionResult {
  isConnected: boolean;
  walletAddress: string;
  walletType: WalletType;
  blockchain: BlockchainNetwork;
  balance?: number;
  error?: string;
}

export interface WalletValidationResult {
  isValid: boolean;
  walletType: WalletType;
  blockchain: BlockchainNetwork;
  errors: string[];
}

export interface ExchangeRateResult {
  currency: CryptoCurrency;
  usdPrice: number;
  change24h: number;
  lastUpdated: Date;
  source: string;
}

export interface CryptoConversionResult {
  usdAmount: number;
  cryptoAmount: number;
  currency: CryptoCurrency;
  exchangeRate: number;
  fees: PaymentFee[];
  totalCryptoAmount: number;
}

export interface TransactionStatus {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  confirmations: number;
  blockNumber?: number;
  gasUsed?: number;
  actualFee?: number;
  timestamp?: Date;
}

export interface TransactionConfirmation {
  hash: string;
  isConfirmed: boolean;
  confirmations: number;
  requiredConfirmations: number;
  blockNumber: number;
  finalizedAt?: Date;
}

export interface SupportedCurrency {
  currency: CryptoCurrency;
  name: string;
  symbol: string;
  blockchain: BlockchainNetwork;
  decimals: number;
  contractAddress?: string;
  minimumAmount: number;
  maximumAmount: number;
  isActive: boolean;
}

export interface NetworkStatus {
  blockchain: BlockchainNetwork;
  isOnline: boolean;
  blockHeight: number;
  averageBlockTime: number;
  networkCongestion: 'low' | 'medium' | 'high';
  recommendedGasPrice: number;
}

export class Web3PaymentService implements IWeb3PaymentService {
  private logger: IStructuredLogger;
  private _metrics: IMetricsCollector;
  private exchangeRateCache: Map<string, ExchangeRateResult> = new Map();
  private sessionCache: Map<string, CryptoPaymentSession> = new Map();

  constructor(
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ) {
    this.logger = logger;
    this._metrics = metrics;
  }

  async connectWallet(walletAddress: string, walletType: WalletType, signature: string): Promise<WalletConnectionResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Connecting Web3 wallet', {
        walletAddress: this.maskAddress(walletAddress),
        walletType
      });

      // Validate wallet address format
      const validation = await this.validateWalletAddress(walletAddress, this.getBlockchainForWallet(walletType));
      if (!validation.isValid) {
        return {
          isConnected: false,
          walletAddress,
          walletType,
          blockchain: validation.blockchain,
          error: validation.errors.join(', ')
        };
      }

      // Verify wallet signature (mock implementation)
      const isSignatureValid = await this.verifyWalletSignature(walletAddress, signature, walletType);
      if (!isSignatureValid) {
        return {
          isConnected: false,
          walletAddress,
          walletType,
          blockchain: validation.blockchain,
          error: 'Invalid wallet signature'
        };
      }

      // Get wallet balance (mock implementation)
      const balance = await this.getWalletBalance(walletAddress, validation.blockchain);

      const result: WalletConnectionResult = {
        isConnected: true,
        walletAddress,
        walletType,
        blockchain: validation.blockchain,
        balance
      };

      this._metrics.incrementCounter('web3_wallet_connected', {
        walletType,
        blockchain: validation.blockchain
      });

      this.logger.info('Web3 wallet connected successfully', {
        walletAddress: this.maskAddress(walletAddress),
        walletType,
        blockchain: validation.blockchain,
        processingTime: Date.now() - startTime
      });

      return result;

    } catch (error) {
      this.logger.error('Web3 wallet connection failed', {
        walletAddress: this.maskAddress(walletAddress),
        walletType,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });

      this._metrics.incrementCounter('web3_wallet_connection_failed', {
        walletType,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      });

      return {
        isConnected: false,
        walletAddress,
        walletType,
        blockchain: BlockchainNetwork.ETHEREUM, // Default
        error: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  async validateWalletAddress(address: string, blockchain: BlockchainNetwork): Promise<WalletValidationResult> {
    const errors: string[] = [];
    
    try {
      // Basic format validation
      if (!address || address.trim().length === 0) {
        errors.push('Wallet address is required');
      }

      // Blockchain-specific validation
      switch (blockchain) {
        case BlockchainNetwork.ETHEREUM:
        case BlockchainNetwork.POLYGON:
        case BlockchainNetwork.BINANCE_SMART_CHAIN:
          if (!this.isValidEthereumAddress(address)) {
            errors.push('Invalid Ethereum-compatible address format');
          }
          break;
        case BlockchainNetwork.BITCOIN:
          if (!this.isValidBitcoinAddress(address)) {
            errors.push('Invalid Bitcoin address format');
          }
          break;
        default:
          errors.push(`Unsupported blockchain: ${blockchain}`);
      }

      return {
        isValid: errors.length === 0,
        walletType: this.detectWalletType(address, blockchain),
        blockchain,
        errors
      };

    } catch (error) {
      return {
        isValid: false,
        walletType: WalletType.METAMASK, // Default
        blockchain,
        errors: [error instanceof Error ? error.message : 'Validation error']
      };
    }
  }

  async createPaymentSession(request: Web3PaymentRequest): Promise<CryptoPaymentSession> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Creating Web3 payment session', {
        userId: request.userId,
        currency: request.currency,
        usdAmount: request.amount,
        walletAddress: this.maskAddress(request.walletAddress)
      });

      // Get current exchange rate
      const exchangeRates = await this.getCryptoExchangeRates([request.currency]);
      const exchangeRate = exchangeRates[0];
      
      if (!exchangeRate) {
        throw new Error(`Exchange rate not available for ${request.currency}`);
      }

      // Calculate crypto amount
      const cryptoAmount = request.amount / exchangeRate.usdPrice;

      // Estimate gas fees
      const gasEstimate = await this.estimateGasFees(
        request.blockchain,
        'payment',
        cryptoAmount
      );

      // Generate session
      const session: CryptoPaymentSession = {
        id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: request.userId,
        currency: request.currency,
        usdAmount: request.amount,
        cryptoAmount,
        exchangeRate: exchangeRate.usdPrice,
        walletAddress: request.walletAddress,
        gasEstimate,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        status: PaymentSessionStatus.PENDING,
        correlationId: request.correlationId,
        createdAt: new Date(),
        confirmationTarget: 3, // 3 confirmations required
        paymentAddress: await this.generatePaymentAddress(request.blockchain),
        qrCode: '', // Will be generated
        paymentUri: '' // Will be generated
      };

      // Generate QR code and payment URI
      session.qrCode = await this.generatePaymentQRCode(session);
      session.paymentUri = await this.generatePaymentURI(session);

      // Cache session
      this.sessionCache.set(session.id, session);

      this._metrics.incrementCounter('web3_payment_session_created', {
        currency: request.currency,
        blockchain: request.blockchain,
        userId: request.userId
      });

      this.logger.info('Web3 payment session created successfully', {
        sessionId: session.id,
        userId: request.userId,
        currency: request.currency,
        cryptoAmount,
        processingTime: Date.now() - startTime
      });

      return session;

    } catch (error) {
      this.logger.error('Failed to create Web3 payment session', {
        userId: request.userId,
        currency: request.currency,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });

      this._metrics.incrementCounter('web3_payment_session_creation_failed', {
        currency: request.currency,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      });

      throw error;
    }
  }

  async getPaymentSession(sessionId: string): Promise<CryptoPaymentSession> {
    const session = this.sessionCache.get(sessionId);
    if (!session) {
      throw new Error(`Payment session not found: ${sessionId}`);
    }
    return session;
  }

  async updatePaymentSession(sessionId: string, updates: Partial<CryptoPaymentSession>): Promise<CryptoPaymentSession> {
    const session = await this.getPaymentSession(sessionId);
    const updatedSession = { ...session, ...updates };
    this.sessionCache.set(sessionId, updatedSession);
    return updatedSession;
  }

  async estimateGasFees(blockchain: BlockchainNetwork, transactionType: string, amount: number): Promise<GasEstimate> {
    try {
      // Mock gas estimation - would integrate with actual blockchain APIs
      const baseGasLimit = this.getBaseGasLimit(blockchain, transactionType);
      const currentGasPrice = await this.getCurrentGasPrice(blockchain);
      
      const gasLimit = Math.ceil(baseGasLimit * 1.2); // 20% buffer
      const estimatedCost = (gasLimit * currentGasPrice) / Math.pow(10, 18); // Convert from wei
      const estimatedCostUSD = estimatedCost * await this.getNativeCurrencyPrice(blockchain);

      return {
        gasLimit,
        gasPrice: currentGasPrice,
        maxFeePerGas: currentGasPrice * 1.5, // 50% higher for EIP-1559
        maxPriorityFeePerGas: currentGasPrice * 0.1, // 10% tip
        estimatedCost,
        estimatedCostUSD,
        confidence: 'medium' as any
      };

    } catch (error) {
      this.logger.error('Gas estimation failed', {
        blockchain,
        transactionType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Return conservative estimate on error
      return {
        gasLimit: 21000,
        gasPrice: 20000000000, // 20 gwei
        estimatedCost: 0.001,
        estimatedCostUSD: 2.50,
        confidence: 'low' as any
      };
    }
  }

  async getCryptoExchangeRates(currencies: CryptoCurrency[]): Promise<ExchangeRateResult[]> {
    const results: ExchangeRateResult[] = [];
    
    for (const currency of currencies) {
      const cacheKey = `rate_${currency}`;
      let rate = this.exchangeRateCache.get(cacheKey);
      
      // Check if cached rate is still valid (5 minutes)
      if (!rate || Date.now() - rate.lastUpdated.getTime() > 5 * 60 * 1000) {
        rate = await this.fetchExchangeRate(currency);
        this.exchangeRateCache.set(cacheKey, rate);
      }
      
      results.push(rate);
    }
    
    return results;
  }

  async convertUSDToCrypto(usdAmount: number, currency: CryptoCurrency): Promise<CryptoConversionResult> {
    const exchangeRates = await this.getCryptoExchangeRates([currency]);
    const rate = exchangeRates[0];
    
    if (!rate) {
      throw new Error(`Exchange rate not available for ${currency}`);
    }

    const cryptoAmount = usdAmount / rate.usdPrice;
    
    // Calculate network fees
    const fees: PaymentFee[] = [
      {
        type: FeeType.NETWORK_FEE,
        amount: 0.001, // Mock network fee in crypto
        currency: currency,
        description: `${currency} network fee`,
        provider: 'blockchain'
      }
    ];

    const totalFees = fees.reduce((sum: any, fee) => sum + fee.amount, 0);
    const totalCryptoAmount = cryptoAmount + totalFees;

    return {
      usdAmount,
      cryptoAmount,
      currency,
      exchangeRate: rate.usdPrice,
      fees,
      totalCryptoAmount
    };
  }

  async processWeb3Payment(request: Web3PaymentRequest): Promise<PaymentResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Processing Web3 payment', {
        userId: request.userId,
        currency: request.currency,
        amount: request.amount,
        walletAddress: this.maskAddress(request.walletAddress)
      });

      // Create payment session
      const session = await this.createPaymentSession(request);

      // Mock transaction submission - would integrate with actual blockchain
      const transactionHash = await this.submitTransaction(request, session);

      // Create payment result
      const result: PaymentResult = {
        id: transactionHash,
        requestId: request.id,
        userId: request.userId,
        status: PaymentStatus.PROCESSING,
        amount: request.amount,
        creditAmount: request.creditAmount,
        paymentMethod: request.paymentMethod,
        providerId: PaymentProvider.BLOCKCHAIN_INFO,
        providerTransactionId: transactionHash,
        providerResponse: { sessionId: session.id, transactionHash },
        transactionHash,
        blockNumber: undefined, // Will be set when confirmed
        confirmations: 0,
        processedAt: new Date(),
        retryCount: 0,
        processingDuration: Date.now() - startTime,
        providerLatency: 2000, // Mock latency
        fees: [
          {
            type: FeeType.NETWORK_FEE,
            amount: session.gasEstimate.estimatedCostUSD,
            currency: 'USD',
            description: 'Blockchain network fee',
            provider: 'blockchain'
          }
        ],
        netAmount: request.amount - session.gasEstimate.estimatedCostUSD,
        exchangeRate: session.exchangeRate
      };

      this._metrics.incrementCounter('web3_payment_processed', {
        currency: request.currency,
        blockchain: request.blockchain,
        amount: request.amount.toString()
      });

      this.logger.info('Web3 payment processed successfully', {
        transactionHash,
        userId: request.userId,
        currency: request.currency,
        amount: request.amount,
        processingTime: result.processingDuration
      });

      return result;

    } catch (error) {
      this.logger.error('Web3 payment processing failed', {
        userId: request.userId,
        currency: request.currency,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });

      this._metrics.incrementCounter('web3_payment_processing_failed', {
        currency: request.currency,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError'
      });

      throw error;
    }
  }

  async monitorTransaction(transactionHash: string, blockchain: BlockchainNetwork): Promise<TransactionStatus> {
    try {
      // Mock transaction monitoring - would integrate with blockchain APIs
      const mockStatus: TransactionStatus = {
        hash: transactionHash,
        status: 'pending',
        confirmations: Math.floor(Math.random() * 3), // Random confirmations for demo
        blockNumber: Math.floor(Math.random() * 1000000) + 18000000,
        gasUsed: 21000,
        actualFee: 0.001,
        timestamp: new Date()
      };

      // Simulate confirmation over time
      if (mockStatus.confirmations >= 3) {
        mockStatus.status = 'confirmed';
      }

      return mockStatus;

    } catch (error) {
      this.logger.error('Transaction monitoring failed', {
        transactionHash,
        blockchain,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        hash: transactionHash,
        status: 'failed',
        confirmations: 0
      };
    }
  }

  async confirmTransaction(transactionHash: string, requiredConfirmations: number): Promise<TransactionConfirmation> {
    const status = await this.monitorTransaction(transactionHash, BlockchainNetwork.ETHEREUM);
    
    return {
      hash: transactionHash,
      isConfirmed: status.confirmations >= requiredConfirmations,
      confirmations: status.confirmations,
      requiredConfirmations,
      blockNumber: status.blockNumber || 0,
      finalizedAt: status.confirmations >= requiredConfirmations ? new Date() : undefined
    };
  }

  async getSupportedCurrencies(): Promise<SupportedCurrency[]> {
    return [
      {
        currency: CryptoCurrency.BITCOIN,
        name: 'Bitcoin',
        symbol: 'BTC',
        blockchain: BlockchainNetwork.BITCOIN,
        decimals: 8,
        minimumAmount: 0.0001,
        maximumAmount: 10,
        isActive: true
      },
      {
        currency: CryptoCurrency.ETHEREUM,
        name: 'Ethereum',
        symbol: 'ETH',
        blockchain: BlockchainNetwork.ETHEREUM,
        decimals: 18,
        minimumAmount: 0.001,
        maximumAmount: 100,
        isActive: true
      },
      {
        currency: CryptoCurrency.USDC,
        name: 'USD Coin',
        symbol: 'USDC',
        blockchain: BlockchainNetwork.ETHEREUM,
        decimals: 6,
        contractAddress: '0xA0b86a33E6441c8C673f4c8b0b8e8c6B8b8e8c6B',
        minimumAmount: 1,
        maximumAmount: 50000,
        isActive: true
      },
      {
        currency: CryptoCurrency.USDT,
        name: 'Tether USD',
        symbol: 'USDT',
        blockchain: BlockchainNetwork.ETHEREUM,
        decimals: 6,
        contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        minimumAmount: 1,
        maximumAmount: 50000,
        isActive: true
      }
    ];
  }

  async getNetworkStatus(blockchain: BlockchainNetwork): Promise<NetworkStatus> {
    // Mock network status - would integrate with actual blockchain APIs
    return {
      blockchain,
      isOnline: true,
      blockHeight: Math.floor(Math.random() * 1000000) + 18000000,
      averageBlockTime: blockchain === BlockchainNetwork.ETHEREUM ? 12 : 600, // seconds
      networkCongestion: 'medium',
      recommendedGasPrice: 20000000000 // 20 gwei
    };
  }

  async generatePaymentQRCode(session: CryptoPaymentSession): Promise<string> {
    // Mock QR code generation - would use actual QR code library
    return `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`;
  }

  async generatePaymentURI(session: CryptoPaymentSession): Promise<string> {
    // Generate blockchain-specific payment URI
    switch (session.currency) {
      case CryptoCurrency.BITCOIN:
        return `bitcoin:${session.paymentAddress}?amount=${session.cryptoAmount}&label=AI Credits Purchase`;
      case CryptoCurrency.ETHEREUM:
        return `ethereum:${session.paymentAddress}?value=${session.cryptoAmount * Math.pow(10, 18)}`;
      default:
        return `${session.currency.toLowerCase()}:${session.paymentAddress}?amount=${session.cryptoAmount}`;
    }
  }

  // Private helper methods

  private maskAddress(address: string): string {
    if (address.length <= 8) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }

  private getBlockchainForWallet(walletType: WalletType): BlockchainNetwork {
    switch (walletType) {
      case WalletType.METAMASK:
      case WalletType.WALLET_CONNECT:
      case WalletType.COINBASE_WALLET:
        return BlockchainNetwork.ETHEREUM;
      default:
        return BlockchainNetwork.ETHEREUM;
    }
  }

  private async verifyWalletSignature(address: string, signature: string, walletType: WalletType): Promise<boolean> {
    // Mock signature verification - would use actual cryptographic verification
    return signature.length > 0;
  }

  private async getWalletBalance(address: string, blockchain: BlockchainNetwork): Promise<number> {
    // Mock balance retrieval - would query actual blockchain
    return Math.random() * 10; // Random balance for demo
  }

  private isValidEthereumAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  private isValidBitcoinAddress(address: string): boolean {
    // Simplified Bitcoin address validation
    return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) || /^bc1[a-z0-9]{39,59}$/.test(address);
  }

  private detectWalletType(address: string, blockchain: BlockchainNetwork): WalletType {
    // Simple detection based on address format
    return WalletType.METAMASK; // Default
  }

  private getBaseGasLimit(blockchain: BlockchainNetwork, transactionType: string): number {
    switch (blockchain) {
      case BlockchainNetwork.ETHEREUM:
        return transactionType === 'payment' ? 21000 : 50000;
      case BlockchainNetwork.POLYGON:
        return 21000;
      default:
        return 21000;
    }
  }

  private async getCurrentGasPrice(blockchain: BlockchainNetwork): Promise<number> {
    // Mock gas price - would query actual blockchain
    switch (blockchain) {
      case BlockchainNetwork.ETHEREUM:
        return 20000000000; // 20 gwei
      case BlockchainNetwork.POLYGON:
        return 30000000000; // 30 gwei
      default:
        return 20000000000;
    }
  }

  private async getNativeCurrencyPrice(blockchain: BlockchainNetwork): Promise<number> {
    // Mock native currency prices
    switch (blockchain) {
      case BlockchainNetwork.ETHEREUM:
        return 2500; // ETH price in USD
      case BlockchainNetwork.POLYGON:
        return 0.80; // MATIC price in USD
      default:
        return 1;
    }
  }

  private async fetchExchangeRate(currency: CryptoCurrency): Promise<ExchangeRateResult> {
    // Mock exchange rate fetching - would integrate with price APIs
    const mockPrices: Record<CryptoCurrency, number> = {
      [CryptoCurrency.BITCOIN]: 45000,
      [CryptoCurrency.ETHEREUM]: 2500,
      [CryptoCurrency.USDC]: 1.00,
      [CryptoCurrency.USDT]: 1.00,
      [CryptoCurrency.MATIC]: 0.80,
      [CryptoCurrency.BNB]: 300,
      [CryptoCurrency.LITECOIN]: 100,
      [CryptoCurrency.BITCOIN_CASH]: 250,
      [CryptoCurrency.DOGECOIN]: 0.08
    };

    return {
      currency,
      usdPrice: mockPrices[currency] || 1,
      change24h: (Math.random() - 0.5) * 10, // Random change
      lastUpdated: new Date(),
      source: 'mock_api'
    };
  }

  private async generatePaymentAddress(blockchain: BlockchainNetwork): Promise<string> {
    // Mock payment address generation - would generate actual addresses
    switch (blockchain) {
      case BlockchainNetwork.ETHEREUM:
        return '0x' + Math.random().toString(16).substring(2, 42).padStart(40, '0');
      case BlockchainNetwork.BITCOIN:
        return 'bc1' + Math.random().toString(36).substring(2, 42);
      default:
        return '0x' + Math.random().toString(16).substring(2, 42).padStart(40, '0');
    }
  }

  private async submitTransaction(request: Web3PaymentRequest, session: CryptoPaymentSession): Promise<string> {
    // Mock transaction submission - would submit to actual blockchain
    return '0x' + Math.random().toString(16).substring(2, 66).padStart(64, '0');
  }
}