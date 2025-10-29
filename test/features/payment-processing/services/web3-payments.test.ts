/**
 * Web3 Payment Service Unit Tests
 * Tests for Web3 cryptocurrency payment functionality
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { Web3PaymentService } from '../../../../src/features/payment-processing/services/web3-payments';
import { 
  Web3PaymentRequest, 
  PaymentMethod, 
  CryptoCurrency, 
  BlockchainNetwork, 
  WalletType 
} from '../../../../src/shared/types/payment-system';
import { StructuredLogger } from '../../../../src/shared/observability/logger';
import { MetricsCollector } from '../../../../src/shared/observability/metrics';

describe('Web3PaymentService', () => {
  let web3PaymentService: Web3PaymentService;
  let logger: StructuredLogger;
  let metrics: MetricsCollector;

  beforeEach(() => {
    logger = new StructuredLogger('Web3PaymentServiceTest');
    metrics = new MetricsCollector();
    web3PaymentService = new Web3PaymentService(logger, metrics);
  });

  describe('connectWallet', () => {
    it('should connect MetaMask wallet successfully', async () => {
      // Arrange
      const walletAddress = '0x742d35Cc6634C0532925a3b8D4C2C2C2C2C2C2C2';
      const walletType = WalletType.METAMASK;
      const signature = 'mock_signature_0x123456789abcdef';

      // Act
      const result = await web3PaymentService.connectWallet(walletAddress, walletType, signature);

      // Assert
      expect(result.isConnected).toBe(true);
      expect(result.walletAddress).toBe(walletAddress);
      expect(result.walletType).toBe(walletType);
      expect(result.blockchain).toBe(BlockchainNetwork.ETHEREUM);
      expect(result.balance).toBeDefined();
      expect(result.balance).toBeGreaterThanOrEqual(0);
    });

    it('should reject invalid wallet address', async () => {
      // Arrange
      const invalidAddress = 'invalid_address';
      const walletType = WalletType.METAMASK;
      const signature = 'mock_signature';

      // Act
      const result = await web3PaymentService.connectWallet(invalidAddress, walletType, signature);

      // Assert
      expect(result.isConnected).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid');
    });

    it('should reject invalid signature', async () => {
      // Arrange
      const walletAddress = '0x742d35Cc6634C0532925a3b8D4C2C2C2C2C2C2C2';
      const walletType = WalletType.METAMASK;
      const invalidSignature = '';

      // Act
      const result = await web3PaymentService.connectWallet(walletAddress, walletType, invalidSignature);

      // Assert
      expect(result.isConnected).toBe(false);
      expect(result.error).toBe('Invalid wallet signature');
    });
  });

  describe('validateWalletAddress', () => {
    it('should validate Ethereum addresses correctly', async () => {
      // Test cases for Ethereum addresses
      const testCases = [
        { address: '0x742d35Cc6634C0532925a3b8D4C2C2C2C2C2C2C2', valid: true },
        { address: '0x0000000000000000000000000000000000000000', valid: true },
        { address: '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', valid: true },
        { address: 'invalid_address', valid: false },
        { address: '0x742d35Cc6634C0532925a3b8D4C2C2C2C2C2C2', valid: false }, // Too short
        { address: '', valid: false }
      ];

      for (const testCase of testCases) {
        // Act
        const result = await web3PaymentService.validateWalletAddress(
          testCase.address,
          BlockchainNetwork.ETHEREUM
        );

        // Assert
        expect(result.isValid).toBe(testCase.valid);
        expect(result.blockchain).toBe(BlockchainNetwork.ETHEREUM);
        
        if (!testCase.valid) {
          expect(result.errors.length).toBeGreaterThan(0);
        }
      }
    });

    it('should validate Bitcoin addresses correctly', async () => {
      // Test cases for Bitcoin addresses
      const testCases = [
        { address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', valid: true }, // Legacy
        { address: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', valid: true }, // P2SH
        { address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', valid: true }, // Bech32
        { address: 'invalid_bitcoin_address', valid: false },
        { address: '', valid: false }
      ];

      for (const testCase of testCases) {
        // Act
        const result = await web3PaymentService.validateWalletAddress(
          testCase.address,
          BlockchainNetwork.BITCOIN
        );

        // Assert
        expect(result.isValid).toBe(testCase.valid);
        expect(result.blockchain).toBe(BlockchainNetwork.BITCOIN);
        
        if (!testCase.valid) {
          expect(result.errors.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('createPaymentSession', () => {
    it('should create Ethereum payment session successfully', async () => {
      // Arrange
      const request: Web3PaymentRequest = {
        id: 'req_web3_test_001',
        userId: 'user_web3_test_001',
        amount: 24.00,
        currency: CryptoCurrency.ETHEREUM,
        creditAmount: 1000,
        paymentMethod: PaymentMethod.ETHEREUM,
        metadata: {},
        correlationId: 'corr_web3_test_001',
        idempotencyKey: 'idem_web3_test_001',
        riskAssessment: {
          overallRisk: 'medium' as any,
          riskScore: 35,
          factors: [],
          recommendations: [],
          assessedAt: new Date(),
          assessedBy: 'test_system'
        },
        fraudScore: 35,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        walletAddress: '0x742d35Cc6634C0532925a3b8D4C2C2C2C2C2C2C2',
        walletType: WalletType.METAMASK,
        blockchain: BlockchainNetwork.ETHEREUM,
        cryptoAmount: 0.0096,
        exchangeRate: 2500,
        gasEstimate: {
          gasLimit: 21000,
          gasPrice: 20000000000,
          estimatedCost: 0.00042,
          estimatedCostUSD: 1.05,
          confidence: 'medium' as any
        }
      };

      // Act
      const session = await web3PaymentService.createPaymentSession(request);

      // Assert
      expect(session.id).toBeDefined();
      expect(session.userId).toBe(request.userId);
      expect(session.currency).toBe(CryptoCurrency.ETHEREUM);
      expect(session.usdAmount).toBe(24.00);
      expect(session.cryptoAmount).toBeGreaterThan(0);
      expect(session.exchangeRate).toBeGreaterThan(0);
      expect(session.walletAddress).toBe(request.walletAddress);
      expect(session.gasEstimate).toBeDefined();
      expect(session.paymentAddress).toBeDefined();
      expect(session.qrCode).toBeDefined();
      expect(session.paymentUri).toBeDefined();
      expect(session.status).toBe('pending');
      expect(session.confirmationTarget).toBe(3);
    });

    it('should handle unsupported currency', async () => {
      // Arrange
      const request: Web3PaymentRequest = {
        id: 'req_web3_test_002',
        userId: 'user_web3_test_002',
        amount: 24.00,
        currency: CryptoCurrency.ETHEREUM,
        creditAmount: 1000,
        paymentMethod: PaymentMethod.ETHEREUM,
        metadata: {},
        correlationId: 'corr_web3_test_002',
        idempotencyKey: 'idem_web3_test_002',
        riskAssessment: {
          overallRisk: 'low' as any,
          riskScore: 10,
          factors: [],
          recommendations: [],
          assessedAt: new Date(),
          assessedBy: 'test_system'
        },
        fraudScore: 10,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        walletAddress: '0x742d35Cc6634C0532925a3b8D4C2C2C2C2C2C2C2',
        walletType: WalletType.METAMASK,
        blockchain: BlockchainNetwork.ETHEREUM,
        cryptoAmount: 0.0096,
        exchangeRate: 2500,
        gasEstimate: {
          gasLimit: 21000,
          gasPrice: 20000000000,
          estimatedCost: 0.00042,
          estimatedCostUSD: 1.05,
          confidence: 'medium' as any
        }
      };

      // Modify to use unsupported currency
      (request as any).currency = 'UNSUPPORTED' as CryptoCurrency;

      // Act & Assert
      await expect(web3PaymentService.createPaymentSession(request)).rejects.toThrow();
    });
  });

  describe('estimateGasFees', () => {
    it('should estimate gas fees for Ethereum', async () => {
      // Act
      const gasEstimate = await web3PaymentService.estimateGasFees(
        BlockchainNetwork.ETHEREUM,
        'payment',
        0.01
      );

      // Assert
      expect(gasEstimate.gasLimit).toBeGreaterThan(0);
      expect(gasEstimate.gasPrice).toBeGreaterThan(0);
      expect(gasEstimate.estimatedCost).toBeGreaterThan(0);
      expect(gasEstimate.estimatedCostUSD).toBeGreaterThan(0);
      expect(gasEstimate.maxFeePerGas).toBeDefined();
      expect(gasEstimate.maxPriorityFeePerGas).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(gasEstimate.confidence);
    });

    it('should estimate gas fees for Polygon', async () => {
      // Act
      const gasEstimate = await web3PaymentService.estimateGasFees(
        BlockchainNetwork.POLYGON,
        'payment',
        0.01
      );

      // Assert
      expect(gasEstimate.gasLimit).toBeGreaterThan(0);
      expect(gasEstimate.gasPrice).toBeGreaterThan(0);
      expect(gasEstimate.estimatedCost).toBeGreaterThan(0);
      expect(gasEstimate.estimatedCostUSD).toBeGreaterThan(0);
    });

    it('should return conservative estimate on error', async () => {
      // Act - Use invalid blockchain to trigger error path
      const gasEstimate = await web3PaymentService.estimateGasFees(
        'invalid_blockchain' as any,
        'payment',
        0.01
      );

      // Assert - Should return conservative fallback
      expect(gasEstimate.gasLimit).toBe(21000);
      expect(gasEstimate.gasPrice).toBe(20000000000);
      expect(gasEstimate.confidence).toBe('low');
    });
  });

  describe('getCryptoExchangeRates', () => {
    it('should get exchange rates for supported currencies', async () => {
      // Arrange
      const currencies = [CryptoCurrency.BITCOIN, CryptoCurrency.ETHEREUM, CryptoCurrency.USDC];

      // Act
      const rates = await web3PaymentService.getCryptoExchangeRates(currencies);

      // Assert
      expect(rates.length).toBe(3);
      
      rates.forEach(rate => {
        expect(currencies).toContain(rate.currency);
        expect(rate.usdPrice).toBeGreaterThan(0);
        expect(rate.lastUpdated).toBeDefined();
        expect(rate.source).toBe('mock_api');
      });

      // Check specific currencies
      const btcRate = rates.find(r => r.currency === CryptoCurrency.BITCOIN);
      const ethRate = rates.find(r => r.currency === CryptoCurrency.ETHEREUM);
      const usdcRate = rates.find(r => r.currency === CryptoCurrency.USDC);

      expect(btcRate?.usdPrice).toBe(45000);
      expect(ethRate?.usdPrice).toBe(2500);
      expect(usdcRate?.usdPrice).toBe(1.00);
    });
  });

  describe('convertUSDToCrypto', () => {
    it('should convert USD to Bitcoin correctly', async () => {
      // Arrange
      const usdAmount = 450; // $450
      const currency = CryptoCurrency.BITCOIN;

      // Act
      const result = await web3PaymentService.convertUSDToCrypto(usdAmount, currency);

      // Assert
      expect(result.usdAmount).toBe(usdAmount);
      expect(result.currency).toBe(currency);
      expect(result.cryptoAmount).toBe(0.01); // $450 / $45000 = 0.01 BTC
      expect(result.exchangeRate).toBe(45000);
      expect(result.fees).toBeDefined();
      expect(result.totalCryptoAmount).toBeGreaterThan(result.cryptoAmount);
    });

    it('should convert USD to Ethereum correctly', async () => {
      // Arrange
      const usdAmount = 2500; // $2500
      const currency = CryptoCurrency.ETHEREUM;

      // Act
      const result = await web3PaymentService.convertUSDToCrypto(usdAmount, currency);

      // Assert
      expect(result.usdAmount).toBe(usdAmount);
      expect(result.currency).toBe(currency);
      expect(result.cryptoAmount).toBe(1.0); // $2500 / $2500 = 1.0 ETH
      expect(result.exchangeRate).toBe(2500);
    });

    it('should convert USD to stablecoin correctly', async () => {
      // Arrange
      const usdAmount = 100; // $100
      const currency = CryptoCurrency.USDC;

      // Act
      const result = await web3PaymentService.convertUSDToCrypto(usdAmount, currency);

      // Assert
      expect(result.usdAmount).toBe(usdAmount);
      expect(result.currency).toBe(currency);
      expect(result.cryptoAmount).toBe(100); // $100 / $1.00 = 100 USDC
      expect(result.exchangeRate).toBe(1.00);
    });
  });

  describe('processWeb3Payment', () => {
    it('should process Ethereum payment successfully', async () => {
      // Arrange
      const request: Web3PaymentRequest = {
        id: 'req_web3_process_001',
        userId: 'user_web3_process_001',
        amount: 24.00,
        currency: CryptoCurrency.ETHEREUM,
        creditAmount: 1000,
        paymentMethod: PaymentMethod.ETHEREUM,
        metadata: {},
        correlationId: 'corr_web3_process_001',
        idempotencyKey: 'idem_web3_process_001',
        riskAssessment: {
          overallRisk: 'low' as any,
          riskScore: 20,
          factors: [],
          recommendations: [],
          assessedAt: new Date(),
          assessedBy: 'test_system'
        },
        fraudScore: 20,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        walletAddress: '0x742d35Cc6634C0532925a3b8D4C2C2C2C2C2C2C2',
        walletType: WalletType.METAMASK,
        blockchain: BlockchainNetwork.ETHEREUM,
        cryptoAmount: 0.0096,
        exchangeRate: 2500,
        gasEstimate: {
          gasLimit: 21000,
          gasPrice: 20000000000,
          estimatedCost: 0.00042,
          estimatedCostUSD: 1.05,
          confidence: 'medium' as any
        }
      };

      // Act
      const result = await web3PaymentService.processWeb3Payment(request);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^0x[a-fA-F0-9]{64}$/); // Transaction hash format
      expect(result.requestId).toBe(request.id);
      expect(result.userId).toBe(request.userId);
      expect(result.status).toBe('processing');
      expect(result.amount).toBe(24.00);
      expect(result.creditAmount).toBe(1000);
      expect(result.transactionHash).toBeDefined();
      expect(result.confirmations).toBe(0);
      expect(result.fees).toBeDefined();
      expect(result.exchangeRate).toBe(2500);
    });
  });

  describe('monitorTransaction', () => {
    it('should monitor transaction status', async () => {
      // Arrange
      const transactionHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const blockchain = BlockchainNetwork.ETHEREUM;

      // Act
      const status = await web3PaymentService.monitorTransaction(transactionHash, blockchain);

      // Assert
      expect(status.hash).toBe(transactionHash);
      expect(['pending', 'confirmed', 'failed']).toContain(status.status);
      expect(status.confirmations).toBeGreaterThanOrEqual(0);
      expect(status.blockNumber).toBeDefined();
      expect(status.gasUsed).toBeDefined();
      expect(status.actualFee).toBeDefined();
      expect(status.timestamp).toBeDefined();
    });
  });

  describe('confirmTransaction', () => {
    it('should confirm transaction with sufficient confirmations', async () => {
      // Arrange
      const transactionHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const requiredConfirmations = 3;

      // Act
      const confirmation = await web3PaymentService.confirmTransaction(
        transactionHash,
        requiredConfirmations
      );

      // Assert
      expect(confirmation.hash).toBe(transactionHash);
      expect(confirmation.requiredConfirmations).toBe(requiredConfirmations);
      expect(confirmation.confirmations).toBeGreaterThanOrEqual(0);
      expect(confirmation.blockNumber).toBeGreaterThan(0);
      
      if (confirmation.isConfirmed) {
        expect(confirmation.finalizedAt).toBeDefined();
      }
    });
  });

  describe('getSupportedCurrencies', () => {
    it('should return list of supported cryptocurrencies', async () => {
      // Act
      const currencies = await web3PaymentService.getSupportedCurrencies();

      // Assert
      expect(currencies.length).toBeGreaterThan(0);
      
      currencies.forEach(currency => {
        expect(currency.currency).toBeDefined();
        expect(currency.name).toBeDefined();
        expect(currency.symbol).toBeDefined();
        expect(currency.blockchain).toBeDefined();
        expect(currency.decimals).toBeGreaterThan(0);
        expect(currency.minimumAmount).toBeGreaterThan(0);
        expect(currency.maximumAmount).toBeGreaterThan(currency.minimumAmount);
        expect(currency.isActive).toBe(true);
      });

      // Check for specific currencies
      const btc = currencies.find(c => c.currency === CryptoCurrency.BITCOIN);
      const eth = currencies.find(c => c.currency === CryptoCurrency.ETHEREUM);
      const usdc = currencies.find(c => c.currency === CryptoCurrency.USDC);

      expect(btc).toBeDefined();
      expect(eth).toBeDefined();
      expect(usdc).toBeDefined();

      expect(btc?.blockchain).toBe(BlockchainNetwork.BITCOIN);
      expect(eth?.blockchain).toBe(BlockchainNetwork.ETHEREUM);
      expect(usdc?.contractAddress).toBeDefined();
    });
  });

  describe('getNetworkStatus', () => {
    it('should return network status for Ethereum', async () => {
      // Act
      const status = await web3PaymentService.getNetworkStatus(BlockchainNetwork.ETHEREUM);

      // Assert
      expect(status.blockchain).toBe(BlockchainNetwork.ETHEREUM);
      expect(status.isOnline).toBe(true);
      expect(status.blockHeight).toBeGreaterThan(0);
      expect(status.averageBlockTime).toBe(12);
      expect(['low', 'medium', 'high']).toContain(status.networkCongestion);
      expect(status.recommendedGasPrice).toBeGreaterThan(0);
    });

    it('should return network status for Bitcoin', async () => {
      // Act
      const status = await web3PaymentService.getNetworkStatus(BlockchainNetwork.BITCOIN);

      // Assert
      expect(status.blockchain).toBe(BlockchainNetwork.BITCOIN);
      expect(status.isOnline).toBe(true);
      expect(status.blockHeight).toBeGreaterThan(0);
      expect(status.averageBlockTime).toBe(600);
    });
  });
});