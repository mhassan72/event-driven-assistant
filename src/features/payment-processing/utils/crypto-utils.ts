/**
 * Cryptocurrency Utilities
 * Utilities for Web3 payments, wallet validation, and blockchain operations
 */

import { 
  CryptoCurrency, 
  BlockchainNetwork, 
  WalletType,
  GasEstimate 
} from '../../../shared/types/payment-system';

export interface WalletValidationResult {
  isValid: boolean;
  walletType: WalletType;
  blockchain: BlockchainNetwork;
  errors: string[];
}

export interface CryptoExchangeRate {
  symbol: CryptoCurrency;
  usdPrice: number;
  change24h: number;
  lastUpdated: Date;
  source: string;
}

export interface BlockchainInfo {
  network: BlockchainNetwork;
  name: string;
  nativeCurrency: CryptoCurrency;
  chainId: number;
  rpcUrls: string[];
  blockExplorerUrls: string[];
  averageBlockTime: number; // in seconds
}

export class CryptoUtils {
  private static readonly BLOCKCHAIN_INFO: Record<BlockchainNetwork, BlockchainInfo> = {
    [BlockchainNetwork.ETHEREUM]: {
      network: BlockchainNetwork.ETHEREUM,
      name: 'Ethereum Mainnet',
      nativeCurrency: CryptoCurrency.ETHEREUM,
      chainId: 1,
      rpcUrls: ['https://mainnet.infura.io/v3/', 'https://eth-mainnet.alchemyapi.io/v2/'],
      blockExplorerUrls: ['https://etherscan.io'],
      averageBlockTime: 12
    },
    [BlockchainNetwork.POLYGON]: {
      network: BlockchainNetwork.POLYGON,
      name: 'Polygon Mainnet',
      nativeCurrency: CryptoCurrency.MATIC,
      chainId: 137,
      rpcUrls: ['https://polygon-rpc.com/', 'https://rpc-mainnet.matic.network'],
      blockExplorerUrls: ['https://polygonscan.com'],
      averageBlockTime: 2
    },
    [BlockchainNetwork.BINANCE_SMART_CHAIN]: {
      network: BlockchainNetwork.BINANCE_SMART_CHAIN,
      name: 'Binance Smart Chain',
      nativeCurrency: CryptoCurrency.BNB,
      chainId: 56,
      rpcUrls: ['https://bsc-dataseed.binance.org/', 'https://bsc-dataseed1.defibit.io/'],
      blockExplorerUrls: ['https://bscscan.com'],
      averageBlockTime: 3
    },
    [BlockchainNetwork.BITCOIN]: {
      network: BlockchainNetwork.BITCOIN,
      name: 'Bitcoin Mainnet',
      nativeCurrency: CryptoCurrency.BITCOIN,
      chainId: 0, // Bitcoin doesn't use chain IDs
      rpcUrls: ['https://bitcoin-mainnet.public.blastapi.io'],
      blockExplorerUrls: ['https://blockstream.info'],
      averageBlockTime: 600
    },
    [BlockchainNetwork.ARBITRUM]: {
      network: BlockchainNetwork.ARBITRUM,
      name: 'Arbitrum One',
      nativeCurrency: CryptoCurrency.ETHEREUM,
      chainId: 42161,
      rpcUrls: ['https://arb1.arbitrum.io/rpc'],
      blockExplorerUrls: ['https://arbiscan.io'],
      averageBlockTime: 1
    },
    [BlockchainNetwork.OPTIMISM]: {
      network: BlockchainNetwork.OPTIMISM,
      name: 'Optimism Mainnet',
      nativeCurrency: CryptoCurrency.ETHEREUM,
      chainId: 10,
      rpcUrls: ['https://mainnet.optimism.io'],
      blockExplorerUrls: ['https://optimistic.etherscan.io'],
      averageBlockTime: 2
    },
    [BlockchainNetwork.AVALANCHE]: {
      network: BlockchainNetwork.AVALANCHE,
      name: 'Avalanche C-Chain',
      nativeCurrency: CryptoCurrency.ETHEREUM, // AVAX would be added to enum
      chainId: 43114,
      rpcUrls: ['https://api.avax.network/ext/bc/C/rpc'],
      blockExplorerUrls: ['https://snowtrace.io'],
      averageBlockTime: 2
    }
  };

  /**
   * Validate wallet address for different blockchains
   */
  static validateWalletAddress(address: string, blockchain: BlockchainNetwork): WalletValidationResult {
    const errors: string[] = [];
    
    try {
      if (!address || address.trim().length === 0) {
        errors.push('Wallet address is required');
        return {
          isValid: false,
          walletType: WalletType.METAMASK,
          blockchain,
          errors
        };
      }

      let isValid = false;
      let detectedWalletType = WalletType.METAMASK;

      switch (blockchain) {
        case BlockchainNetwork.ETHEREUM:
        case BlockchainNetwork.POLYGON:
        case BlockchainNetwork.BINANCE_SMART_CHAIN:
        case BlockchainNetwork.ARBITRUM:
        case BlockchainNetwork.OPTIMISM:
        case BlockchainNetwork.AVALANCHE:
          isValid = this.isValidEthereumAddress(address);
          detectedWalletType = this.detectEthereumWalletType(address);
          if (!isValid) {
            errors.push('Invalid Ethereum-compatible address format');
          }
          break;

        case BlockchainNetwork.BITCOIN:
          isValid = this.isValidBitcoinAddress(address);
          detectedWalletType = this.detectBitcoinWalletType(address);
          if (!isValid) {
            errors.push('Invalid Bitcoin address format');
          }
          break;

        default:
          errors.push(`Unsupported blockchain: ${blockchain}`);
      }

      return {
        isValid: isValid && errors.length === 0,
        walletType: detectedWalletType,
        blockchain,
        errors
      };

    } catch (error) {
      return {
        isValid: false,
        walletType: WalletType.METAMASK,
        blockchain,
        errors: [error instanceof Error ? error.message : 'Validation error']
      };
    }
  }

  /**
   * Estimate gas fees for blockchain transactions
   */
  static async estimateGasFees(
    blockchain: BlockchainNetwork,
    transactionType: string,
    amount: number
  ): Promise<GasEstimate> {
    try {
      const blockchainInfo = this.BLOCKCHAIN_INFO[blockchain];
      if (!blockchainInfo) {
        throw new Error(`Unsupported blockchain: ${blockchain}`);
      }

      // Get base gas limit for transaction type
      const baseGasLimit = this.getBaseGasLimit(blockchain, transactionType);
      
      // Get current network gas price (mock implementation)
      const currentGasPrice = await this.getCurrentGasPrice(blockchain);
      
      // Calculate gas limit with buffer
      const gasLimit = Math.ceil(baseGasLimit * 1.2); // 20% buffer
      
      // Calculate costs
      const estimatedCost = this.calculateGasCost(gasLimit, currentGasPrice, blockchain);
      const nativeCurrencyPrice = await this.getNativeCurrencyPrice(blockchainInfo.nativeCurrency);
      const estimatedCostUSD = estimatedCost * nativeCurrencyPrice;

      // EIP-1559 support for Ethereum-compatible chains
      const supportsEIP1559 = this.supportsEIP1559(blockchain);
      
      return {
        gasLimit,
        gasPrice: currentGasPrice,
        maxFeePerGas: supportsEIP1559 ? Math.floor(currentGasPrice * 1.5) : undefined,
        maxPriorityFeePerGas: supportsEIP1559 ? Math.floor(currentGasPrice * 0.1) : undefined,
        estimatedCost,
        estimatedCostUSD,
        confidence: 'medium' as any
      };

    } catch (error) {
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

  /**
   * Get current cryptocurrency exchange rates
   */
  static async getCryptoExchangeRates(symbols: CryptoCurrency[]): Promise<CryptoExchangeRate[]> {
    try {
      // Mock implementation - would integrate with actual price APIs like CoinGecko, CoinMarketCap
      const mockPrices: Record<CryptoCurrency, { price: number; change24h: number }> = {
        [CryptoCurrency.BITCOIN]: { price: 45000, change24h: 2.5 },
        [CryptoCurrency.ETHEREUM]: { price: 2500, change24h: -1.2 },
        [CryptoCurrency.USDC]: { price: 1.00, change24h: 0.01 },
        [CryptoCurrency.USDT]: { price: 1.00, change24h: -0.02 },
        [CryptoCurrency.MATIC]: { price: 0.80, change24h: 5.3 },
        [CryptoCurrency.BNB]: { price: 300, change24h: 1.8 },
        [CryptoCurrency.LITECOIN]: { price: 100, change24h: -0.5 },
        [CryptoCurrency.BITCOIN_CASH]: { price: 250, change24h: 3.2 },
        [CryptoCurrency.DOGECOIN]: { price: 0.08, change24h: 8.7 }
      };

      return symbols.map(symbol => ({
        symbol,
        usdPrice: mockPrices[symbol]?.price || 1,
        change24h: mockPrices[symbol]?.change24h || 0,
        lastUpdated: new Date(),
        source: 'mock_api'
      }));

    } catch (error) {
      // Return default rates on error
      return symbols.map(symbol => ({
        symbol,
        usdPrice: 1,
        change24h: 0,
        lastUpdated: new Date(),
        source: 'fallback'
      }));
    }
  }

  /**
   * Convert USD amount to cryptocurrency amount
   */
  static async convertUSDToCrypto(
    usdAmount: number,
    cryptoSymbol: CryptoCurrency
  ): Promise<{ cryptoAmount: number; exchangeRate: number }> {
    try {
      const rates = await this.getCryptoExchangeRates([cryptoSymbol]);
      const rate = rates[0];
      
      if (!rate) {
        throw new Error(`Exchange rate not available for ${cryptoSymbol}`);
      }

      const cryptoAmount = usdAmount / rate.usdPrice;
      
      return {
        cryptoAmount,
        exchangeRate: rate.usdPrice
      };

    } catch (error) {
      throw new Error(`Failed to convert USD to ${cryptoSymbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate payment QR code data for cryptocurrency payments
   */
  static generatePaymentQRCode(
    walletAddress: string,
    amount: number,
    cryptoSymbol: CryptoCurrency,
    blockchain: BlockchainNetwork
  ): string {
    try {
      // Generate blockchain-specific payment URI
      let paymentUri: string;

      switch (blockchain) {
        case BlockchainNetwork.BITCOIN:
          paymentUri = `bitcoin:${walletAddress}?amount=${amount}&label=AI Credits Purchase`;
          break;
          
        case BlockchainNetwork.ETHEREUM:
        case BlockchainNetwork.POLYGON:
        case BlockchainNetwork.BINANCE_SMART_CHAIN:
          // For Ethereum-compatible chains, use EIP-681 format
          const weiAmount = Math.floor(amount * Math.pow(10, 18));
          paymentUri = `ethereum:${walletAddress}?value=${weiAmount}&gas=21000`;
          break;
          
        default:
          paymentUri = `${cryptoSymbol.toLowerCase()}:${walletAddress}?amount=${amount}`;
      }

      // In a real implementation, this would generate an actual QR code image
      // For now, return the payment URI that would be encoded in the QR code
      return paymentUri;

    } catch (error) {
      throw new Error(`Failed to generate QR code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Monitor blockchain transaction status
   */
  static async monitorTransaction(
    transactionHash: string,
    blockchain: BlockchainNetwork
  ): Promise<{
    status: string;
    confirmations: number;
    blockNumber?: number;
    gasUsed?: number;
  }> {
    try {
      // Mock implementation - would integrate with blockchain APIs
      const blockchainInfo = this.BLOCKCHAIN_INFO[blockchain];
      if (!blockchainInfo) {
        throw new Error(`Unsupported blockchain: ${blockchain}`);
      }

      // Simulate transaction status based on time
      const mockConfirmations = Math.floor(Math.random() * 10);
      const requiredConfirmations = this.getRequiredConfirmations(blockchain);
      
      return {
        status: mockConfirmations >= requiredConfirmations ? 'confirmed' : 'pending',
        confirmations: mockConfirmations,
        blockNumber: Math.floor(Math.random() * 1000000) + 18000000,
        gasUsed: 21000
      };

    } catch (error) {
      return {
        status: 'failed',
        confirmations: 0
      };
    }
  }

  /**
   * Get blockchain information
   */
  static getBlockchainInfo(blockchain: BlockchainNetwork): BlockchainInfo {
    const info = this.BLOCKCHAIN_INFO[blockchain];
    if (!info) {
      throw new Error(`Unsupported blockchain: ${blockchain}`);
    }
    return info;
  }

  /**
   * Get supported blockchains
   */
  static getSupportedBlockchains(): BlockchainNetwork[] {
    return Object.keys(this.BLOCKCHAIN_INFO) as BlockchainNetwork[];
  }

  /**
   * Check if blockchain supports EIP-1559 (London hard fork)
   */
  static supportsEIP1559(blockchain: BlockchainNetwork): boolean {
    return [
      BlockchainNetwork.ETHEREUM,
      BlockchainNetwork.POLYGON,
      BlockchainNetwork.ARBITRUM,
      BlockchainNetwork.OPTIMISM
    ].includes(blockchain);
  }

  // Private helper methods

  private static isValidEthereumAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  private static isValidBitcoinAddress(address: string): boolean {
    // Legacy P2PKH addresses (1...)
    if (/^[1][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true;
    
    // P2SH addresses (3...)
    if (/^[3][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true;
    
    // Bech32 addresses (bc1...)
    if (/^bc1[a-z0-9]{39,59}$/.test(address)) return true;
    
    return false;
  }

  private static detectEthereumWalletType(address: string): WalletType {
    // Simple detection - in reality would need more sophisticated detection
    return WalletType.METAMASK;
  }

  private static detectBitcoinWalletType(address: string): WalletType {
    // Bitcoin wallets don't have specific address formats per wallet
    return WalletType.LEDGER; // Default to hardware wallet for Bitcoin
  }

  private static getBaseGasLimit(blockchain: BlockchainNetwork, transactionType: string): number {
    switch (blockchain) {
      case BlockchainNetwork.ETHEREUM:
        switch (transactionType) {
          case 'transfer': return 21000;
          case 'erc20_transfer': return 65000;
          case 'contract_interaction': return 100000;
          default: return 21000;
        }
      case BlockchainNetwork.POLYGON:
        return 21000; // Lower gas costs on Polygon
      case BlockchainNetwork.BINANCE_SMART_CHAIN:
        return 21000;
      case BlockchainNetwork.BITCOIN:
        return 250; // Bitcoin uses different fee structure (bytes, not gas)
      default:
        return 21000;
    }
  }

  private static async getCurrentGasPrice(blockchain: BlockchainNetwork): Promise<number> {
    // Mock gas prices - would query actual blockchain APIs
    const mockGasPrices: Record<BlockchainNetwork, number> = {
      [BlockchainNetwork.ETHEREUM]: 20000000000, // 20 gwei
      [BlockchainNetwork.POLYGON]: 30000000000, // 30 gwei
      [BlockchainNetwork.BINANCE_SMART_CHAIN]: 5000000000, // 5 gwei
      [BlockchainNetwork.ARBITRUM]: 1000000000, // 1 gwei
      [BlockchainNetwork.OPTIMISM]: 1000000000, // 1 gwei
      [BlockchainNetwork.AVALANCHE]: 25000000000, // 25 gwei
      [BlockchainNetwork.BITCOIN]: 10 // 10 sat/byte
    };

    return mockGasPrices[blockchain] || 20000000000;
  }

  private static calculateGasCost(gasLimit: number, gasPrice: number, blockchain: BlockchainNetwork): number {
    switch (blockchain) {
      case BlockchainNetwork.BITCOIN:
        // Bitcoin uses sat/byte, not gas
        return (gasLimit * gasPrice) / 100000000; // Convert satoshis to BTC
      default:
        // Ethereum-compatible chains use wei
        return (gasLimit * gasPrice) / Math.pow(10, 18); // Convert wei to ETH
    }
  }

  private static async getNativeCurrencyPrice(currency: CryptoCurrency): Promise<number> {
    const rates = await this.getCryptoExchangeRates([currency]);
    return rates[0]?.usdPrice || 1;
  }

  private static getRequiredConfirmations(blockchain: BlockchainNetwork): number {
    switch (blockchain) {
      case BlockchainNetwork.BITCOIN:
        return 6; // Bitcoin requires more confirmations
      case BlockchainNetwork.ETHEREUM:
        return 12; // Ethereum finality
      case BlockchainNetwork.POLYGON:
        return 128; // Polygon checkpoint
      default:
        return 3; // Default for most chains
    }
  }
}