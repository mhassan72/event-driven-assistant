/**
 * Balance Sync Service Unit Tests
 * Tests for real-time balance synchronization functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  BalanceSyncService, 
  ReservationRequest,
  ConflictResolutionStrategy 
} from '../../../../src/features/credit-system/services/balance-sync-service';
import { IMetricsCollector } from '../../../../src/shared/observability/metrics';
import { 
  CreditBalance,
  CreditReservation,
  ReservationStatus,
  AccountStatus,
  BalanceHealthStatus,
  ValidationSeverity
} from '../../../../src/shared/types/credit-system';

// Mock Firebase Admin
jest.mock('firebase-admin/firestore');
jest.mock('firebase-admin/database');

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

const mockDatabase = {
  ref: jest.fn()
};

const mockDoc = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn()
};

const mockCollection = {
  doc: jest.fn(() => mockDoc),
  where: jest.fn(() => ({
    get: jest.fn()
  })),
  get: jest.fn()
};

const mockRef = {
  set: jest.fn(),
  once: jest.fn(),
  on: jest.fn(),
  off: jest.fn()
};

mockFirestore.collection.mockReturnValue(mockCollection);
mockDatabase.ref.mockReturnValue(mockRef);

describe('BalanceSyncService', () => {
  let balanceSyncService: BalanceSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    balanceSyncService = new BalanceSyncService(mockMetrics, {
      conflictResolutionStrategy: ConflictResolutionStrategy.FIRESTORE_WINS
    });
    
    // Mock Firebase clients
    (balanceSyncService as any).firestore = mockFirestore;
    (balanceSyncService as any).database = mockDatabase;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('syncBalance', () => {
    const mockUserId = 'user-123';
    const mockFirestoreBalance: CreditBalance = {
      userId: mockUserId,
      currentBalance: 1000,
      reservedCredits: 50,
      availableBalance: 950,
      lastUpdated: new Date(),
      accountStatus: AccountStatus.ACTIVE,
      lifetimeCreditsEarned: 1000,
      lifetimeCreditsSpent: 0,
      version: 5,
      lastEventId: 'event-123',
      syncVersion: 3,
      lastSyncTimestamp: new Date(),
      pendingOperations: [],
      lastVerifiedBalance: 1000,
      lastVerificationTimestamp: new Date(),
      verificationHash: 'hash123',
      healthStatus: BalanceHealthStatus.HEALTHY,
      lastHealthCheck: new Date()
    };

    it('should sync balance successfully without conflicts', async () => {
      // Mock Firestore balance retrieval
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockFirestoreBalance
      });

      // Mock Realtime Database balance retrieval
      mockRef.once.mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          balance: 1000,
          lastUpdated: Date.now()
        })
      });

      // Mock sync metadata update
      mockDoc.update.mockResolvedValue(undefined);

      // Mock Realtime Database update
      mockRef.set.mockResolvedValue(undefined);

      const result = await balanceSyncService.syncBalance(mockUserId);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(mockUserId);
      expect(result.conflictsResolved).toBe(0);
      expect(result.errors).toHaveLength(0);

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'balance_sync.completed',
        1,
        expect.objectContaining({
          user_id: mockUserId,
          conflicts_resolved: '0'
        })
      );
    });

    it('should resolve balance conflicts using Firestore wins strategy', async () => {
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockFirestoreBalance
      });

      // Mock conflicting Realtime Database balance
      mockRef.once.mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          balance: 800, // Different from Firestore
          lastUpdated: Date.now() - 10000 // Older timestamp
        })
      });

      mockDoc.update
        .mockResolvedValueOnce(undefined) // Firestore update
        .mockResolvedValueOnce(undefined); // Sync metadata update
      
      mockRef.set.mockResolvedValue(undefined);

      const result = await balanceSyncService.syncBalance(mockUserId);

      expect(result.success).toBe(true);
      expect(result.conflictsResolved).toBe(1);

      // Should update Realtime DB with Firestore value
      expect(mockRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: 1000,
          availableBalance: 950,
          reservedCredits: 50
        })
      );
    });

    it('should handle missing Firestore balance', async () => {
      mockDoc.get.mockResolvedValueOnce({
        exists: false
      });

      const result = await balanceSyncService.syncBalance(mockUserId);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('firestore_error');
      expect(result.errors[0].message).toContain('Balance not found in Firestore');
    });

    it('should process pending operations', async () => {
      const balanceWithPendingOps = {
        ...mockFirestoreBalance,
        pendingOperations: [
          {
            id: 'op-1',
            type: 'credit_deduction' as any,
            amount: 25,
            status: 'queued' as any,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 60000),
            retryCount: 0
          }
        ]
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => balanceWithPendingOps
      });

      mockRef.once.mockResolvedValueOnce({
        exists: () => true,
        val: () => ({ balance: 1000, lastUpdated: Date.now() })
      });

      mockDoc.update.mockResolvedValue(undefined);
      mockRef.set.mockResolvedValue(undefined);

      const result = await balanceSyncService.syncBalance(mockUserId);

      expect(result.success).toBe(true);
      expect(result.operationsProcessed).toBe(1);
    });

    it('should handle Firestore errors gracefully', async () => {
      mockDoc.get.mockRejectedValue(new Error('Firestore connection failed'));

      const result = await balanceSyncService.syncBalance(mockUserId);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('firestore_error');

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'balance_sync.errors',
        1,
        expect.objectContaining({
          error_type: 'firestore_error'
        })
      );
    });
  });

  describe('reserveCredits', () => {
    const mockUserId = 'user-123';
    const mockRequest: ReservationRequest = {
      userId: mockUserId,
      amount: 100,
      reason: 'AI task reservation',
      correlationId: 'corr-123',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      metadata: { taskType: 'image_generation' }
    };

    const mockBalance: CreditBalance = {
      userId: mockUserId,
      currentBalance: 1000,
      reservedCredits: 50,
      availableBalance: 950,
      lastUpdated: new Date(),
      accountStatus: AccountStatus.ACTIVE,
      lifetimeCreditsEarned: 1000,
      lifetimeCreditsSpent: 0,
      version: 5,
      lastEventId: 'event-123',
      syncVersion: 3,
      lastSyncTimestamp: new Date(),
      pendingOperations: [],
      lastVerifiedBalance: 1000,
      lastVerificationTimestamp: new Date(),
      verificationHash: 'hash123',
      healthStatus: BalanceHealthStatus.HEALTHY,
      lastHealthCheck: new Date()
    };

    it('should reserve credits successfully', async () => {
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockBalance
      });

      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        await callback({
          update: jest.fn(),
          set: jest.fn()
        });
      });

      mockRef.set.mockResolvedValue(undefined);

      const result = await balanceSyncService.reserveCredits(mockRequest);

      expect(result).toMatchObject({
        userId: mockUserId,
        amount: 100,
        correlationId: 'corr-123',
        status: ReservationStatus.ACTIVE
      });

      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.expiresAt).toBeInstanceOf(Date);

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'credit_reservations.created',
        1,
        expect.objectContaining({
          user_id: mockUserId,
          amount_range: '51-100'
        })
      );
    });

    it('should reject reservation for insufficient balance', async () => {
      const insufficientBalance = {
        ...mockBalance,
        currentBalance: 50,
        availableBalance: 50
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => insufficientBalance
      });

      await expect(balanceSyncService.reserveCredits(mockRequest))
        .rejects.toThrow('Insufficient credits for reservation');

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'credit_reservations.errors',
        1,
        expect.objectContaining({
          error_type: 'insufficient_credits'
        })
      );
    });

    it('should reject reservation for missing user balance', async () => {
      mockDoc.get.mockResolvedValueOnce({
        exists: false
      });

      await expect(balanceSyncService.reserveCredits(mockRequest))
        .rejects.toThrow('User balance not found');
    });

    it('should update real-time balance after reservation', async () => {
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockBalance
      });

      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        await callback({
          update: jest.fn(),
          set: jest.fn()
        });
      });

      mockRef.set.mockResolvedValue(undefined);

      await balanceSyncService.reserveCredits(mockRequest);

      expect(mockRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: 1000,
          availableBalance: 850, // 950 - 100
          reservedCredits: 150   // 50 + 100
        })
      );
    });
  });

  describe('releaseReservation', () => {
    const mockUserId = 'user-123';
    const mockReservationId = 'reservation-123';

    const mockReservation: CreditReservation = {
      id: mockReservationId,
      userId: mockUserId,
      amount: 100,
      correlationId: 'corr-123',
      status: ReservationStatus.ACTIVE,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      metadata: {}
    };

    const mockBalance: CreditBalance = {
      userId: mockUserId,
      currentBalance: 1000,
      reservedCredits: 150,
      availableBalance: 850,
      lastUpdated: new Date(),
      accountStatus: AccountStatus.ACTIVE,
      lifetimeCreditsEarned: 1000,
      lifetimeCreditsSpent: 0,
      version: 5,
      lastEventId: 'event-123',
      syncVersion: 3,
      lastSyncTimestamp: new Date(),
      pendingOperations: [],
      lastVerifiedBalance: 1000,
      lastVerificationTimestamp: new Date(),
      verificationHash: 'hash123',
      healthStatus: BalanceHealthStatus.HEALTHY,
      lastHealthCheck: new Date()
    };

    it('should release reservation successfully', async () => {
      mockDoc.get
        .mockResolvedValueOnce({
          exists: true,
          data: () => mockReservation
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => mockBalance
        });

      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        await callback({
          update: jest.fn()
        });
      });

      mockRef.set.mockResolvedValue(undefined);

      await balanceSyncService.releaseReservation(mockUserId, mockReservationId);

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'credit_reservations.released',
        1,
        expect.objectContaining({
          user_id: mockUserId,
          amount_range: '51-100'
        })
      );

      // Should update real-time balance
      expect(mockRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: 1000,
          availableBalance: 950, // 850 + 100
          reservedCredits: 50    // 150 - 100
        })
      );
    });

    it('should handle missing reservation gracefully', async () => {
      mockDoc.get.mockResolvedValueOnce({
        exists: false
      });

      await expect(balanceSyncService.releaseReservation(mockUserId, mockReservationId))
        .rejects.toThrow('Reservation not found');
    });

    it('should reject release for wrong user', async () => {
      const wrongUserReservation = {
        ...mockReservation,
        userId: 'different-user'
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => wrongUserReservation
      });

      await expect(balanceSyncService.releaseReservation(mockUserId, mockReservationId))
        .rejects.toThrow('does not belong to user');
    });

    it('should handle non-active reservation gracefully', async () => {
      const releasedReservation = {
        ...mockReservation,
        status: ReservationStatus.RELEASED
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => releasedReservation
      });

      // Should not throw, just log warning and return
      await expect(balanceSyncService.releaseReservation(mockUserId, mockReservationId))
        .resolves.not.toThrow();
    });
  });

  describe('confirmReservation', () => {
    const mockUserId = 'user-123';
    const mockReservationId = 'reservation-123';

    const mockReservation: CreditReservation = {
      id: mockReservationId,
      userId: mockUserId,
      amount: 100,
      correlationId: 'corr-123',
      status: ReservationStatus.ACTIVE,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      metadata: {}
    };

    const mockBalance: CreditBalance = {
      userId: mockUserId,
      currentBalance: 1000,
      reservedCredits: 100,
      availableBalance: 900,
      lastUpdated: new Date(),
      accountStatus: AccountStatus.ACTIVE,
      lifetimeCreditsEarned: 1000,
      lifetimeCreditsSpent: 0,
      version: 5,
      lastEventId: 'event-123',
      syncVersion: 3,
      lastSyncTimestamp: new Date(),
      pendingOperations: [],
      lastVerifiedBalance: 1000,
      lastVerificationTimestamp: new Date(),
      verificationHash: 'hash123',
      healthStatus: BalanceHealthStatus.HEALTHY,
      lastHealthCheck: new Date()
    };

    it('should confirm reservation with full amount', async () => {
      mockDoc.get
        .mockResolvedValueOnce({
          exists: true,
          data: () => mockReservation
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => mockBalance
        });

      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        await callback({
          update: jest.fn()
        });
      });

      mockRef.set.mockResolvedValue(undefined);

      await balanceSyncService.confirmReservation(mockUserId, mockReservationId);

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'credit_reservations.confirmed',
        1,
        expect.objectContaining({
          user_id: mockUserId,
          amount_range: '51-100'
        })
      );

      // Should update real-time balance
      expect(mockRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: 900,        // 1000 - 100
          availableBalance: 900, // 900 - 0 (no more reserved)
          reservedCredits: 0   // 100 - 100
        })
      );
    });

    it('should confirm reservation with partial amount', async () => {
      mockDoc.get
        .mockResolvedValueOnce({
          exists: true,
          data: () => mockReservation
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => mockBalance
        });

      mockFirestore.runTransaction.mockImplementation(async (callback) => {
        await callback({
          update: jest.fn()
        });
      });

      mockRef.set.mockResolvedValue(undefined);

      const actualAmount = 75;
      await balanceSyncService.confirmReservation(mockUserId, mockReservationId, actualAmount);

      // Should update real-time balance with partial deduction
      expect(mockRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: 925,        // 1000 - 75
          availableBalance: 925, // 925 - 0 (no more reserved)
          reservedCredits: 0   // 100 - 100 (full reservation released)
        })
      );
    });

    it('should reject confirmation with amount exceeding reservation', async () => {
      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockReservation
      });

      const excessiveAmount = 150;
      await expect(balanceSyncService.confirmReservation(mockUserId, mockReservationId, excessiveAmount))
        .rejects.toThrow('Actual amount 150 exceeds reserved amount 100');
    });

    it('should reject confirmation for non-active reservation', async () => {
      const expiredReservation = {
        ...mockReservation,
        status: ReservationStatus.EXPIRED
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => expiredReservation
      });

      await expect(balanceSyncService.confirmReservation(mockUserId, mockReservationId))
        .rejects.toThrow('Cannot confirm non-active reservation');
    });
  });

  describe('validateBalance', () => {
    const mockUserId = 'user-123';

    it('should validate consistent balances', async () => {
      const mockBalance: CreditBalance = {
        userId: mockUserId,
        currentBalance: 1000,
        reservedCredits: 50,
        availableBalance: 950,
        lastUpdated: new Date(),
        accountStatus: AccountStatus.ACTIVE,
        lifetimeCreditsEarned: 1000,
        lifetimeCreditsSpent: 0,
        version: 5,
        lastEventId: 'event-123',
        syncVersion: 3,
        lastSyncTimestamp: new Date(),
        pendingOperations: [],
        lastVerifiedBalance: 1000,
        lastVerificationTimestamp: new Date(),
        verificationHash: 'hash123',
        healthStatus: BalanceHealthStatus.HEALTHY,
        lastHealthCheck: new Date()
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockBalance
      });

      mockRef.once.mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          balance: 1000,
          lastUpdated: Date.now()
        })
      });

      const result = await balanceSyncService.validateBalance(mockUserId);

      expect(result.isValid).toBe(true);
      expect(result.userId).toBe(mockUserId);
      expect(result.expectedBalance).toBe(1000);
      expect(result.actualBalance).toBe(1000);
      expect(result.discrepancy).toBe(0);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect balance mismatch', async () => {
      const mockBalance: CreditBalance = {
        userId: mockUserId,
        currentBalance: 1000,
        reservedCredits: 50,
        availableBalance: 950,
        lastUpdated: new Date(),
        accountStatus: AccountStatus.ACTIVE,
        lifetimeCreditsEarned: 1000,
        lifetimeCreditsSpent: 0,
        version: 5,
        lastEventId: 'event-123',
        syncVersion: 3,
        lastSyncTimestamp: new Date(),
        pendingOperations: [],
        lastVerifiedBalance: 1000,
        lastVerificationTimestamp: new Date(),
        verificationHash: 'hash123',
        healthStatus: BalanceHealthStatus.HEALTHY,
        lastHealthCheck: new Date()
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockBalance
      });

      mockRef.once.mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          balance: 800, // Mismatch
          lastUpdated: Date.now()
        })
      });

      const result = await balanceSyncService.validateBalance(mockUserId);

      expect(result.isValid).toBe(false);
      expect(result.discrepancy).toBe(200);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe('balance_mismatch');
      expect(result.issues[0].severity).toBe(ValidationSeverity.HIGH);
    });

    it('should detect stuck pending operations', async () => {
      const stuckOperation = {
        id: 'op-1',
        type: 'credit_deduction' as any,
        amount: 25,
        status: 'queued' as any,
        createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        expiresAt: new Date(Date.now() + 60000),
        retryCount: 0
      };

      const mockBalance: CreditBalance = {
        userId: mockUserId,
        currentBalance: 1000,
        reservedCredits: 50,
        availableBalance: 950,
        lastUpdated: new Date(),
        accountStatus: AccountStatus.ACTIVE,
        lifetimeCreditsEarned: 1000,
        lifetimeCreditsSpent: 0,
        version: 5,
        lastEventId: 'event-123',
        syncVersion: 3,
        lastSyncTimestamp: new Date(),
        pendingOperations: [stuckOperation],
        lastVerifiedBalance: 1000,
        lastVerificationTimestamp: new Date(),
        verificationHash: 'hash123',
        healthStatus: BalanceHealthStatus.HEALTHY,
        lastHealthCheck: new Date()
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockBalance
      });

      mockRef.once.mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          balance: 1000,
          lastUpdated: Date.now()
        })
      });

      const result = await balanceSyncService.validateBalance(mockUserId);

      expect(result.isValid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe('pending_operation_stuck');
      expect(result.issues[0].severity).toBe(ValidationSeverity.MEDIUM);
    });

    it('should handle missing Firestore balance', async () => {
      mockDoc.get.mockResolvedValueOnce({
        exists: false
      });

      mockRef.once.mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          balance: 500,
          lastUpdated: Date.now()
        })
      });

      const result = await balanceSyncService.validateBalance(mockUserId);

      expect(result.isValid).toBe(false);
      expect(result.expectedBalance).toBe(0);
      expect(result.actualBalance).toBe(500);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe('balance_mismatch');
      expect(result.issues[0].severity).toBe(ValidationSeverity.CRITICAL);
    });
  });

  describe('handleInsufficientCredits', () => {
    const mockUserId = 'user-123';

    it('should return payment options for insufficient credits', async () => {
      const mockBalance: CreditBalance = {
        userId: mockUserId,
        currentBalance: 100,
        reservedCredits: 0,
        availableBalance: 100,
        lastUpdated: new Date(),
        accountStatus: AccountStatus.ACTIVE,
        lifetimeCreditsEarned: 1000,
        lifetimeCreditsSpent: 900,
        version: 5,
        lastEventId: 'event-123',
        syncVersion: 3,
        lastSyncTimestamp: new Date(),
        pendingOperations: [],
        lastVerifiedBalance: 100,
        lastVerificationTimestamp: new Date(),
        verificationHash: 'hash123',
        healthStatus: BalanceHealthStatus.WARNING,
        lastHealthCheck: new Date()
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockBalance
      });

      const requiredAmount = 250;
      const result = await balanceSyncService.handleInsufficientCredits(mockUserId, requiredAmount);

      expect(result.hasInsufficientCredits).toBe(true);
      expect(result.currentBalance).toBe(100);
      expect(result.requiredAmount).toBe(250);
      expect(result.shortfall).toBe(150);
      expect(result.suggestedTopUpAmount).toBe(500); // Minimum 500
      expect(result.paymentOptions).toHaveLength(3);

      // Check payment options
      const smallTopUp = result.paymentOptions.find(p => p.id === 'small_topup');
      expect(smallTopUp?.recommended).toBe(false); // 150 shortfall > 500 credits

      const mediumTopUp = result.paymentOptions.find(p => p.id === 'medium_topup');
      expect(mediumTopUp?.recommended).toBe(false); // 150 shortfall > 1000 credits

      const largeTopUp = result.paymentOptions.find(p => p.id === 'large_topup');
      expect(largeTopUp?.recommended).toBe(true); // 150 shortfall fits in large
    });

    it('should return no shortfall for sufficient credits', async () => {
      const mockBalance: CreditBalance = {
        userId: mockUserId,
        currentBalance: 1000,
        reservedCredits: 0,
        availableBalance: 1000,
        lastUpdated: new Date(),
        accountStatus: AccountStatus.ACTIVE,
        lifetimeCreditsEarned: 1000,
        lifetimeCreditsSpent: 0,
        version: 5,
        lastEventId: 'event-123',
        syncVersion: 3,
        lastSyncTimestamp: new Date(),
        pendingOperations: [],
        lastVerifiedBalance: 1000,
        lastVerificationTimestamp: new Date(),
        verificationHash: 'hash123',
        healthStatus: BalanceHealthStatus.HEALTHY,
        lastHealthCheck: new Date()
      };

      mockDoc.get.mockResolvedValueOnce({
        exists: true,
        data: () => mockBalance
      });

      const requiredAmount = 500;
      const result = await balanceSyncService.handleInsufficientCredits(mockUserId, requiredAmount);

      expect(result.hasInsufficientCredits).toBe(false);
      expect(result.shortfall).toBe(0);
    });

    it('should handle missing balance gracefully', async () => {
      mockDoc.get.mockResolvedValueOnce({
        exists: false
      });

      const requiredAmount = 100;
      const result = await balanceSyncService.handleInsufficientCredits(mockUserId, requiredAmount);

      expect(result.hasInsufficientCredits).toBe(true);
      expect(result.currentBalance).toBe(0);
      expect(result.shortfall).toBe(100);
      expect(result.suggestedTopUpAmount).toBe(500);
    });
  });

  describe('subscribeToBalanceChanges', () => {
    const mockUserId = 'user-123';

    it('should set up real-time subscription', async () => {
      const mockCallback = jest.fn();
      const mockListener = jest.fn();

      mockRef.on.mockReturnValue(mockListener);

      // Mock Firestore balance for callback
      mockDoc.get.mockResolvedValue({
        exists: true,
        data: () => ({
          userId: mockUserId,
          currentBalance: 1000
        })
      });

      const unsubscribe = await balanceSyncService.subscribeToBalanceChanges(mockUserId, mockCallback);

      expect(mockRef.on).toHaveBeenCalledWith('value', expect.any(Function));
      expect(typeof unsubscribe).toBe('function');

      // Test unsubscribe
      unsubscribe();
      expect(mockRef.off).toHaveBeenCalledWith('value', mockListener);
    });

    it('should handle subscription errors', async () => {
      const mockCallback = jest.fn();

      mockRef.on.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await expect(balanceSyncService.subscribeToBalanceChanges(mockUserId, mockCallback))
        .rejects.toThrow('Database connection failed');
    });
  });

  describe('broadcastBalanceUpdate', () => {
    const mockUserId = 'user-123';
    const mockBalance: CreditBalance = {
      userId: mockUserId,
      currentBalance: 1000,
      reservedCredits: 50,
      availableBalance: 950,
      lastUpdated: new Date(),
      accountStatus: AccountStatus.ACTIVE,
      lifetimeCreditsEarned: 1000,
      lifetimeCreditsSpent: 0,
      version: 5,
      lastEventId: 'event-123',
      syncVersion: 3,
      lastSyncTimestamp: new Date(),
      pendingOperations: [],
      lastVerifiedBalance: 1000,
      lastVerificationTimestamp: new Date(),
      verificationHash: 'hash123',
      healthStatus: BalanceHealthStatus.HEALTHY,
      lastHealthCheck: new Date()
    };

    it('should broadcast balance update successfully', async () => {
      mockRef.set.mockResolvedValue(undefined);

      await balanceSyncService.broadcastBalanceUpdate(mockUserId, mockBalance);

      expect(mockRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: 1000,
          availableBalance: 950,
          reservedCredits: 50,
          version: 5,
          healthStatus: BalanceHealthStatus.HEALTHY
        })
      );

      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'balance_sync.broadcasts',
        1,
        expect.objectContaining({
          user_id: mockUserId
        })
      );
    });

    it('should handle broadcast errors gracefully', async () => {
      mockRef.set.mockRejectedValue(new Error('Database write failed'));

      // Should not throw
      await expect(balanceSyncService.broadcastBalanceUpdate(mockUserId, mockBalance))
        .resolves.not.toThrow();
    });
  });

  describe('health monitoring', () => {
    it('should start health monitoring', async () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      await balanceSyncService.startHealthMonitoring();

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        60000 // 1 minute interval
      );

      setIntervalSpy.mockRestore();
    });

    it('should stop health monitoring', async () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      // Start monitoring first
      await balanceSyncService.startHealthMonitoring();
      await balanceSyncService.stopHealthMonitoring();

      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });

    it('should not start monitoring if already running', async () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      await balanceSyncService.startHealthMonitoring();
      await balanceSyncService.startHealthMonitoring(); // Second call

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);

      setIntervalSpy.mockRestore();
    });
  });
});