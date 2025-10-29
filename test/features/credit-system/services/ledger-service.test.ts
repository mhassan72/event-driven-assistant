/**
 * Ledger Service Unit Tests
 * Tests for blockchain-style ledger functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { LedgerService, CryptoUtils } from '../../../../src/features/credit-system/services/ledger-service';
import { IMetricsCollector } from '../../../../src/shared/observability/metrics';
import { 
  CreditTransaction,
  LedgerEntry,
  TransactionType,
  CreditSource,
  TransactionStatus,
  ChainValidationResult,
  ChainErrorType
} from '../../../../src/shared/types/credit-system';

// Mock Firebase Admin
jest.mock('firebase-admin/firestore');

// Mock dependencies
const mockMetrics: IMetricsCollector = {
  increment: jest.fn(),
  histogram: jest.fn(),
  gauge: jest.fn()
};

const mockFirestore = {
  collection: jest.fn(),
  runTransaction: jest.fn()
};

const mockDoc = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn()
};

const mockCollection = {
  doc: jest.fn(() => mockDoc),
  where: jest.fn(() => ({
    orderBy: jest.fn(() => ({
      get: jest.fn(),
      limit: jest.fn(() => ({
        get: jest.fn()
      }))
    })),
    get: jest.fn()
  })),
  get: jest.fn()
};

mockFirestore.collection.mockReturnValue(mockCollection);

describe('LedgerService', () => {
  let ledgerService: LedgerService;
  let cryptoUtils: CryptoUtils;

  beforeEach(() => {
    jest.clearAllMocks();
    
    cryptoUtils = new CryptoUtils();
    ledgerService = new LedgerService(mockMetrics, cryptoUtils);
    
    // Mock Firestore
    (ledgerService as any).firestore = mockFirestore;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('CryptoUtils', () => {
    const mockTransaction: CreditTransaction = {
      id: 'trans-123',
      userId: 'user-123',
      type: TransactionType.CREDIT_DEDUCTION,
      amount: -25,
      balanceBefore: 100,
      balanceAfter: 75,
      status: TransactionStatus.COMPLETED,
      source: CreditSource.AI_USAGE,
      reason: 'AI interaction',
      metadata: {},
      timestamp: new Date('2024-01-15T10:00:00Z'),
      eventId: 'event-123',
      version: 1,
      transactionHash: '',
      previousTransactionHash: '',
      signature: '',
      blockIndex: 0,
      correlationId: 'corr-123',
      idempotencyKey: 'idem-123',
      processingDuration: 0,
      retryCount: 0
    };

    describe('generateTransactionHash', () => {
      it('should generate consistent hash for same transaction', () => {
        const previousHash = 'prev-hash-123';
        
        const hash1 = cryptoUtils.generateTransactionHash(mockTransaction, previousHash);
        const hash2 = cryptoUtils.generateTransactionHash(mockTransaction, previousHash);
        
        expect(hash1).toBe(hash2);
        expect(hash1).toHaveLength(64); // SHA-256 hex string
        expect(typeof hash1).toBe('string');
      });

      it('should generate different hashes for different transactions', () => {
        const previousHash = 'prev-hash-123';
        const modifiedTransaction = { ...mockTransaction, amount: -50 };
        
        const hash1 = cryptoUtils.generateTransactionHash(mockTransaction, previousHash);
        const hash2 = cryptoUtils.generateTransactionHash(modifiedTransaction, previousHash);
        
        expect(hash1).not.toBe(hash2);
      });

      it('should generate different hashes for different previous hashes', () => {
        const hash1 = cryptoUtils.generateTransactionHash(mockTransaction, 'prev-hash-1');
        const hash2 = cryptoUtils.generateTransactionHash(mockTransaction, 'prev-hash-2');
        
        expect(hash1).not.toBe(hash2);
      });
    });

    describe('signTransaction', () => {
      it('should generate consistent signature for same transaction and key', async () => {
        const signingKey = 'test-signing-key';
        
        const signature1 = await cryptoUtils.signTransaction(mockTransaction, signingKey);
        const signature2 = await cryptoUtils.signTransaction(mockTransaction, signingKey);
        
        expect(signature1).toBe(signature2);
        expect(signature1).toHaveLength(64); // HMAC-SHA256 hex string
      });

      it('should generate different signatures for different keys', async () => {
        const signature1 = await cryptoUtils.signTransaction(mockTransaction, 'key-1');
        const signature2 = await cryptoUtils.signTransaction(mockTransaction, 'key-2');
        
        expect(signature1).not.toBe(signature2);
      });
    });

    describe('verifyTransactionSignature', () => {
      it('should verify valid signature', async () => {
        const signingKey = 'test-signing-key';
        const signature = await cryptoUtils.signTransaction(mockTransaction, signingKey);
        
        const isValid = await cryptoUtils.verifyTransactionSignature(
          mockTransaction, 
          signature, 
          signingKey
        );
        
        expect(isValid).toBe(true);
      });

      it('should reject invalid signature', async () => {
        const signingKey = 'test-signing-key';
        const invalidSignature = 'invalid-signature';
        
        const isValid = await cryptoUtils.verifyTransactionSignature(
          mockTransaction, 
          invalidSignature, 
          signingKey
        );
        
        expect(isValid).toBe(false);
      });

      it('should handle verification errors gracefully', async () => {
        const signingKey = 'test-signing-key';
        const signature = 'valid-looking-signature-but-wrong-format';
        
        const isValid = await cryptoUtils.verifyTransactionSignature(
          mockTransaction, 
          signature, 
          signingKey
        );
        
        expect(isValid).toBe(false);
      });
    });

    describe('generateKeyPair', () => {
      it('should generate unique key pairs', async () => {
        const keyPair1 = await cryptoUtils.generateKeyPair();
        const keyPair2 = await cryptoUtils.generateKeyPair();
        
        expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
        expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
        expect(keyPair1.privateKey).toHaveLength(64);
        expect(keyPair1.publicKey).toHaveLength(64);
      });
    });
  });

  describe('recordTransaction', () => {
    const mockTransaction: CreditTransaction = {
      id: 'trans-123',
      userId: 'user-123',
      type: TransactionType.CREDIT_DEDUCTION,
      amount: -25,
      balanceBefore: 100,
      balanceAfter: 75,
      status: TransactionStatus.COMPLETED,
      source: CreditSource.AI_USAGE,
      reason: 'AI interaction',
      metadata: {},
      timestamp: new Date(),
      eventId: 'event-123',
      version: 1,
      transactionHash: '',
      previousTransactionHash: '',
      signature: '',
      blockIndex: 0,
      correlationId: 'corr-123',
      idempotencyKey: 'idem-123',
      processingDuration: 0,
      retryCount: 0
    };

    it('should record transaction in ledger successfully', async () => {
      // Mock getting last ledger entry (first transaction)
      mockCollection.where.mockReturnValueOnce({
        orderBy: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] })
          })
        })
      });

      // Mock chain validation
      mockCollection.where.mockReturnValueOnce({
        orderBy: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ docs: [] })
        })
      });

      // Mock transaction execution
      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        await callback({
          set: jest.fn(),
          update: jest.fn()
        });
      });

      // Mock event recording
      mockDoc.set.mockResolvedValue(undefined);

      const result = await ledgerService.recordTransaction(mockTransaction);

      expect(result).toMatchObject({
        userId: mockTransaction.userId,
        transactionId: mockTransaction.id,
        blockIndex: 1,
        isValid: true,
        previousHash: '0' // First transaction
      });

      expect(result.transactionHash).toHaveLength(64);
      expect(result.signature).toHaveLength(64);
      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'ledger.transactions.recorded',
        1,
        expect.objectContaining({
          user_id: mockTransaction.userId,
          transaction_type: mockTransaction.type
        })
      );
    });

    it('should handle chain validation failure', async () => {
      // Mock getting last ledger entry
      const mockPreviousEntry: LedgerEntry = {
        id: 'prev-entry',
        userId: 'user-123',
        transactionId: 'prev-trans',
        transactionHash: 'prev-hash',
        previousHash: '0',
        signature: 'prev-sig',
        timestamp: new Date(),
        blockIndex: 1,
        correlationId: 'prev-corr',
        isValid: true
      };

      mockCollection.where.mockReturnValueOnce({
        orderBy: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              empty: false,
              docs: [{ data: () => mockPreviousEntry }]
            })
          })
        })
      });

      // Mock broken chain validation
      mockCollection.where.mockReturnValueOnce({
        orderBy: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            docs: [
              { data: () => ({ ...mockPreviousEntry, transactionHash: 'corrupted-hash' }) }
            ]
          })
        })
      });

      // Mock transaction retrieval for validation
      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => mockTransaction
      });

      await expect(ledgerService.recordTransaction(mockTransaction))
        .rejects.toThrow('Hash chain broken');

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'ledger.transactions.errors',
        1,
        expect.objectContaining({
          error_type: 'chain_error'
        })
      );
    });

    it('should handle sequential transactions correctly', async () => {
      const firstTransaction = { ...mockTransaction, id: 'trans-1' };
      const secondTransaction = { ...mockTransaction, id: 'trans-2' };

      // First transaction - no previous entry
      mockCollection.where.mockReturnValueOnce({
        orderBy: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] })
          })
        })
      });

      mockCollection.where.mockReturnValueOnce({
        orderBy: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ docs: [] })
        })
      });

      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        await callback({ set: jest.fn(), update: jest.fn() });
      });

      mockDoc.set.mockResolvedValue(undefined);

      const firstResult = await ledgerService.recordTransaction(firstTransaction);

      // Second transaction - has previous entry
      mockCollection.where.mockReturnValueOnce({
        orderBy: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              empty: false,
              docs: [{ data: () => firstResult }]
            })
          })
        })
      });

      mockCollection.where.mockReturnValueOnce({
        orderBy: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            docs: [{ data: () => firstResult }]
          })
        })
      });

      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => secondTransaction
      });

      const secondResult = await ledgerService.recordTransaction(secondTransaction);

      expect(firstResult.blockIndex).toBe(1);
      expect(firstResult.previousHash).toBe('0');
      
      expect(secondResult.blockIndex).toBe(2);
      expect(secondResult.previousHash).toBe(firstResult.transactionHash);
    });
  });

  describe('validateHashChain', () => {
    const mockUserId = 'user-123';

    it('should validate empty chain as valid', async () => {
      mockCollection.where.mockReturnValueOnce({
        orderBy: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ docs: [] })
        })
      });

      const result = await ledgerService.validateHashChain(mockUserId);

      expect(result).toMatchObject({
        isValid: true,
        userId: mockUserId,
        totalTransactions: 0,
        validatedTransactions: 0,
        errors: []
      });
    });

    it('should validate correct chain', async () => {
      const mockEntries: LedgerEntry[] = [
        {
          id: 'entry-1',
          userId: mockUserId,
          transactionId: 'trans-1',
          transactionHash: 'hash-1',
          previousHash: '0',
          signature: 'sig-1',
          timestamp: new Date(),
          blockIndex: 1,
          correlationId: 'corr-1',
          isValid: true
        },
        {
          id: 'entry-2',
          userId: mockUserId,
          transactionId: 'trans-2',
          transactionHash: 'hash-2',
          previousHash: 'hash-1',
          signature: 'sig-2',
          timestamp: new Date(),
          blockIndex: 2,
          correlationId: 'corr-2',
          isValid: true
        }
      ];

      mockCollection.where.mockReturnValueOnce({
        orderBy: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            docs: mockEntries.map(entry => ({ data: () => entry }))
          })
        })
      });

      // Mock transaction retrieval for hash validation
      mockDoc.get
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            id: 'trans-1',
            userId: mockUserId,
            timestamp: new Date(),
            type: TransactionType.CREDIT_ADDITION,
            amount: 100
          })
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            id: 'trans-2',
            userId: mockUserId,
            timestamp: new Date(),
            type: TransactionType.CREDIT_DEDUCTION,
            amount: -25
          })
        });

      const result = await ledgerService.validateHashChain(mockUserId);

      expect(result.isValid).toBe(true);
      expect(result.totalTransactions).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect hash chain break', async () => {
      const mockEntries: LedgerEntry[] = [
        {
          id: 'entry-1',
          userId: mockUserId,
          transactionId: 'trans-1',
          transactionHash: 'hash-1',
          previousHash: '0',
          signature: 'sig-1',
          timestamp: new Date(),
          blockIndex: 1,
          correlationId: 'corr-1',
          isValid: true
        },
        {
          id: 'entry-2',
          userId: mockUserId,
          transactionId: 'trans-2',
          transactionHash: 'hash-2',
          previousHash: 'wrong-hash', // Should be 'hash-1'
          signature: 'sig-2',
          timestamp: new Date(),
          blockIndex: 2,
          correlationId: 'corr-2',
          isValid: true
        }
      ];

      mockCollection.where.mockReturnValueOnce({
        orderBy: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            docs: mockEntries.map(entry => ({ data: () => entry }))
          })
        })
      });

      mockDoc.get
        .mockResolvedValueOnce({ exists: true, data: () => ({}) })
        .mockResolvedValueOnce({ exists: true, data: () => ({}) });

      const result = await ledgerService.validateHashChain(mockUserId);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        blockIndex: 2,
        errorType: ChainErrorType.HASH_MISMATCH,
        expectedHash: 'hash-1',
        actualHash: 'wrong-hash'
      });
      expect(result.brokenAt).toBe(2);
    });

    it('should detect missing transactions', async () => {
      const mockEntries: LedgerEntry[] = [
        {
          id: 'entry-1',
          userId: mockUserId,
          transactionId: 'trans-1',
          transactionHash: 'hash-1',
          previousHash: '0',
          signature: 'sig-1',
          timestamp: new Date(),
          blockIndex: 1,
          correlationId: 'corr-1',
          isValid: true
        }
      ];

      mockCollection.where.mockReturnValueOnce({
        orderBy: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            docs: mockEntries.map(entry => ({ data: () => entry }))
          })
        })
      });

      // Mock missing transaction
      mockDoc.get.mockResolvedValue({ exists: false });

      const result = await ledgerService.validateHashChain(mockUserId);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        blockIndex: 1,
        errorType: ChainErrorType.MISSING_TRANSACTION
      });
    });

    it('should detect block index sequence errors', async () => {
      const mockEntries: LedgerEntry[] = [
        {
          id: 'entry-1',
          userId: mockUserId,
          transactionId: 'trans-1',
          transactionHash: 'hash-1',
          previousHash: '0',
          signature: 'sig-1',
          timestamp: new Date(),
          blockIndex: 1,
          correlationId: 'corr-1',
          isValid: true
        },
        {
          id: 'entry-2',
          userId: mockUserId,
          transactionId: 'trans-2',
          transactionHash: 'hash-2',
          previousHash: 'hash-1',
          signature: 'sig-2',
          timestamp: new Date(),
          blockIndex: 3, // Should be 2
          correlationId: 'corr-2',
          isValid: true
        }
      ];

      mockCollection.where.mockReturnValueOnce({
        orderBy: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            docs: mockEntries.map(entry => ({ data: () => entry }))
          })
        })
      });

      mockDoc.get
        .mockResolvedValueOnce({ exists: true, data: () => ({}) })
        .mockResolvedValueOnce({ exists: true, data: () => ({}) });

      const result = await ledgerService.validateHashChain(mockUserId);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        blockIndex: 3,
        errorType: ChainErrorType.BROKEN_CHAIN
      });
    });
  });

  describe('validateTransactionIntegrity', () => {
    const mockTransactionId = 'trans-123';

    it('should validate transaction with correct integrity', async () => {
      const mockLedgerEntry: LedgerEntry = {
        id: 'entry-123',
        userId: 'user-123',
        transactionId: mockTransactionId,
        transactionHash: 'correct-hash',
        previousHash: 'prev-hash',
        signature: 'correct-signature',
        timestamp: new Date(),
        blockIndex: 1,
        correlationId: 'corr-123',
        isValid: true
      };

      const mockTransaction: CreditTransaction = {
        id: mockTransactionId,
        userId: 'user-123',
        type: TransactionType.CREDIT_DEDUCTION,
        amount: -25,
        balanceBefore: 100,
        balanceAfter: 75,
        status: TransactionStatus.COMPLETED,
        source: CreditSource.AI_USAGE,
        reason: 'AI interaction',
        metadata: {},
        timestamp: mockLedgerEntry.timestamp,
        eventId: 'event-123',
        version: 1,
        transactionHash: '',
        previousTransactionHash: '',
        signature: '',
        blockIndex: 0,
        correlationId: 'corr-123',
        idempotencyKey: 'idem-123',
        processingDuration: 0,
        retryCount: 0
      };

      // Mock ledger entry retrieval
      mockCollection.where.mockReturnValueOnce({
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{ data: () => mockLedgerEntry }]
        })
      });

      // Mock transaction retrieval
      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => mockTransaction
      });

      // Mock crypto utils to return valid results
      const mockCryptoUtils = {
        generateTransactionHash: jest.fn().mockReturnValue('correct-hash'),
        verifyTransactionSignature: jest.fn().mockResolvedValue(true)
      };

      const ledgerServiceWithMockCrypto = new LedgerService(mockMetrics, mockCryptoUtils as any);
      (ledgerServiceWithMockCrypto as any).firestore = mockFirestore;

      const result = await ledgerServiceWithMockCrypto.validateTransactionIntegrity(mockTransactionId);

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect hash mismatch', async () => {
      const mockLedgerEntry: LedgerEntry = {
        id: 'entry-123',
        userId: 'user-123',
        transactionId: mockTransactionId,
        transactionHash: 'wrong-hash',
        previousHash: 'prev-hash',
        signature: 'signature',
        timestamp: new Date(),
        blockIndex: 1,
        correlationId: 'corr-123',
        isValid: true
      };

      mockCollection.where.mockReturnValueOnce({
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{ data: () => mockLedgerEntry }]
        })
      });

      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({})
      });

      const mockCryptoUtils = {
        generateTransactionHash: jest.fn().mockReturnValue('correct-hash'),
        verifyTransactionSignature: jest.fn().mockResolvedValue(true)
      };

      const ledgerServiceWithMockCrypto = new LedgerService(mockMetrics, mockCryptoUtils as any);
      (ledgerServiceWithMockCrypto as any).firestore = mockFirestore;

      const result = await ledgerServiceWithMockCrypto.validateTransactionIntegrity(mockTransactionId);

      expect(result.isValid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe('hash_mismatch');
    });

    it('should detect invalid signature', async () => {
      const mockLedgerEntry: LedgerEntry = {
        id: 'entry-123',
        userId: 'user-123',
        transactionId: mockTransactionId,
        transactionHash: 'correct-hash',
        previousHash: 'prev-hash',
        signature: 'invalid-signature',
        timestamp: new Date(),
        blockIndex: 1,
        correlationId: 'corr-123',
        isValid: true
      };

      mockCollection.where.mockReturnValueOnce({
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{ data: () => mockLedgerEntry }]
        })
      });

      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({})
      });

      const mockCryptoUtils = {
        generateTransactionHash: jest.fn().mockReturnValue('correct-hash'),
        verifyTransactionSignature: jest.fn().mockResolvedValue(false)
      };

      const ledgerServiceWithMockCrypto = new LedgerService(mockMetrics, mockCryptoUtils as any);
      (ledgerServiceWithMockCrypto as any).firestore = mockFirestore;

      const result = await ledgerServiceWithMockCrypto.validateTransactionIntegrity(mockTransactionId);

      expect(result.isValid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe('signature_invalid');
    });

    it('should handle missing ledger entry', async () => {
      mockCollection.where.mockReturnValueOnce({
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] })
      });

      const result = await ledgerService.validateTransactionIntegrity(mockTransactionId);

      expect(result.isValid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe('data_corruption');
      expect(result.issues[0].description).toContain('Ledger entry not found');
    });

    it('should handle missing transaction data', async () => {
      const mockLedgerEntry: LedgerEntry = {
        id: 'entry-123',
        userId: 'user-123',
        transactionId: mockTransactionId,
        transactionHash: 'hash',
        previousHash: 'prev-hash',
        signature: 'signature',
        timestamp: new Date(),
        blockIndex: 1,
        correlationId: 'corr-123',
        isValid: true
      };

      mockCollection.where.mockReturnValueOnce({
        get: jest.fn().mockResolvedValue({
          empty: false,
          docs: [{ data: () => mockLedgerEntry }]
        })
      });

      mockDoc.get.mockResolvedValue({ exists: false });

      const result = await ledgerService.validateTransactionIntegrity(mockTransactionId);

      expect(result.isValid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe('data_corruption');
      expect(result.issues[0].description).toContain('Original transaction data not found');
    });
  });

  describe('error handling', () => {
    it('should handle Firestore errors gracefully', async () => {
      const mockTransaction: CreditTransaction = {
        id: 'trans-123',
        userId: 'user-123',
        type: TransactionType.CREDIT_DEDUCTION,
        amount: -25,
        balanceBefore: 100,
        balanceAfter: 75,
        status: TransactionStatus.COMPLETED,
        source: CreditSource.AI_USAGE,
        reason: 'AI interaction',
        metadata: {},
        timestamp: new Date(),
        eventId: 'event-123',
        version: 1,
        transactionHash: '',
        previousTransactionHash: '',
        signature: '',
        blockIndex: 0,
        correlationId: 'corr-123',
        idempotencyKey: 'idem-123',
        processingDuration: 0,
        retryCount: 0
      };

      mockCollection.where.mockImplementation(() => {
        throw new Error('Firestore connection error');
      });

      await expect(ledgerService.recordTransaction(mockTransaction))
        .rejects.toThrow('Firestore connection error');

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'ledger.transactions.errors',
        1,
        expect.objectContaining({
          error_type: 'unknown_error'
        })
      );
    });

    it('should categorize errors correctly', async () => {
      const mockTransaction: CreditTransaction = {
        id: 'trans-123',
        userId: 'user-123',
        type: TransactionType.CREDIT_DEDUCTION,
        amount: -25,
        balanceBefore: 100,
        balanceAfter: 75,
        status: TransactionStatus.COMPLETED,
        source: CreditSource.AI_USAGE,
        reason: 'AI interaction',
        metadata: {},
        timestamp: new Date(),
        eventId: 'event-123',
        version: 1,
        transactionHash: '',
        previousTransactionHash: '',
        signature: '',
        blockIndex: 0,
        correlationId: 'corr-123',
        idempotencyKey: 'idem-123',
        processingDuration: 0,
        retryCount: 0
      };

      mockCollection.where.mockImplementation(() => {
        throw new Error('hash validation failed');
      });

      await expect(ledgerService.recordTransaction(mockTransaction))
        .rejects.toThrow('hash validation failed');

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'ledger.transactions.errors',
        1,
        expect.objectContaining({
          error_type: 'hash_error'
        })
      );
    });
  });
});