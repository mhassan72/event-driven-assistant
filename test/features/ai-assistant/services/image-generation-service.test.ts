/**
 * Image Generation Service Tests
 */

import { ImageGenerationService } from '../../../../src/features/ai-assistant/services/image-generation-service';
import { CreditService } from '../../../../src/features/credit-system/services/credit-service';
import { 
  ImageGenerationRequest,
  ImageModel,
  ImageSize,
  ImageQuality,
  GenerationPriority,
  StorageProvider,
  GenerationStatus
} from '../../../../src/shared/types/image-generation';
import { 
  ReservationStatus,
  TransactionType,
  TransactionStatus,
  CreditSource
} from '../../../../src/shared/types/credit-system';
import { IMetricsCollector } from '../../../../src/shared/observability/metrics';

// Mock Firebase Admin
jest.mock('firebase-admin/storage', () => ({
  getStorage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      file: jest.fn(() => ({
        save: jest.fn(),
        makePublic: jest.fn()
      }))
    }))
  }))
}));

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn()
      }))
    })),
    runTransaction: jest.fn()
  }))
}));

jest.mock('firebase-admin/database', () => ({
  getDatabase: jest.fn(() => ({
    ref: jest.fn(() => ({
      set: jest.fn(),
      once: jest.fn()
    }))
  }))
}));

// Mock fetch
global.fetch = jest.fn();

describe('ImageGenerationService', () => {
  let imageService: ImageGenerationService;
  let mockMetrics: IMetricsCollector;
  let mockCreditService: jest.Mocked<CreditService>;

  beforeEach(() => {
    // Create mock metrics
    mockMetrics = {
      increment: jest.fn(),
      histogram: jest.fn(),
      gauge: jest.fn(),
      recordHttpRequest: jest.fn(),
      recordCreditOperation: jest.fn(),
      recordPayment: jest.fn(),
      getMetrics: jest.fn(() => []),
      clearMetrics: jest.fn()
    };

    // Create mock credit service
    mockCreditService = {
      reserveCredits: jest.fn(),
      deductCredits: jest.fn(),
      releaseReservedCredits: jest.fn()
    } as any;

    const config = {
      nebiusApiKey: 'test-api-key',
      nebiusBaseUrl: 'https://api.test.com',
      defaultTimeout: 30000,
      maxRetries: 3,
      storageProvider: StorageProvider.FIREBASE_STORAGE,
      storageBucket: 'test-bucket'
    };

    imageService = new ImageGenerationService(config, mockMetrics, mockCreditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateImages', () => {
    const mockRequest: ImageGenerationRequest = {
      userId: 'test-user-123',
      prompt: 'A beautiful sunset over mountains',
      model: ImageModel.FLUX_SCHNELL,
      size: ImageSize.SQUARE_1024,
      quality: ImageQuality.STANDARD,
      count: 1,
      safetyFilter: true,
      priority: GenerationPriority.NORMAL,
      metadata: {},
      correlationId: 'test-correlation-123',
      idempotencyKey: 'test-idempotency-123'
    };

    it('should validate request parameters', async () => {
      const invalidRequest = {
        ...mockRequest,
        userId: '', // Invalid empty userId
      };

      const result = await imageService.generateImages(invalidRequest);
      
      expect(result.status).toBe(GenerationStatus.FAILED);
      expect(result.error?.message).toContain('User ID is required');
    });

    it('should validate prompt length', async () => {
      const invalidRequest = {
        ...mockRequest,
        prompt: 'a'.repeat(1001), // Too long
      };

      const result = await imageService.generateImages(invalidRequest);
      
      expect(result.status).toBe(GenerationStatus.FAILED);
      expect(result.error?.message).toContain('Prompt is too long');
    });

    it('should validate image count', async () => {
      const invalidRequest = {
        ...mockRequest,
        count: 5, // Too many
      };

      const result = await imageService.generateImages(invalidRequest);
      
      expect(result.status).toBe(GenerationStatus.FAILED);
      expect(result.error?.message).toContain('Image count must be between 1 and 4');
    });

    it('should handle FLUX API errors gracefully', async () => {
      // Mock credit reservation
      mockCreditService.reserveCredits.mockResolvedValue({
        id: 'reservation-123',
        userId: 'test-user-123',
        amount: 20,
        correlationId: 'test-correlation-123',
        status: ReservationStatus.ACTIVE,
        createdAt: new Date(),
        expiresAt: new Date()
      });

      // Mock failed FLUX API response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ message: 'API temporarily unavailable' })
      });

      const result = await imageService.generateImages(mockRequest);

      expect(result.status).toBe(GenerationStatus.FAILED);
      expect(result.error?.message).toContain('FLUX API error');
      expect(result.error?.retryable).toBe(true);

      // Verify credits were released on failure
      expect(mockCreditService.releaseReservedCredits).toHaveBeenCalledWith(
        'test-user-123',
        20,
        'test-correlation-123'
      );
    });
  });

  describe('cost calculation', () => {
    it('should calculate different costs for different models', () => {
      const baseRequest: ImageGenerationRequest = {
        userId: 'test-user',
        prompt: 'test prompt',
        model: ImageModel.FLUX_SCHNELL,
        size: ImageSize.SQUARE_512,
        quality: ImageQuality.STANDARD,
        count: 1,
        priority: GenerationPriority.NORMAL,
        metadata: {},
        correlationId: 'test',
        idempotencyKey: 'test'
      };

      // Test different models (using private method via any cast for testing)
      const fluxSchnellCost = (imageService as any).calculateCost({
        ...baseRequest,
        model: ImageModel.FLUX_SCHNELL
      });

      const fluxDevCost = (imageService as any).calculateCost({
        ...baseRequest,
        model: ImageModel.FLUX_DEV
      });

      expect(fluxDevCost).toBeGreaterThan(fluxSchnellCost);
    });

    it('should apply size multipliers correctly', () => {
      const baseRequest: ImageGenerationRequest = {
        userId: 'test-user',
        prompt: 'test prompt',
        model: ImageModel.FLUX_SCHNELL,
        size: ImageSize.SQUARE_512,
        quality: ImageQuality.STANDARD,
        count: 1,
        priority: GenerationPriority.NORMAL,
        metadata: {},
        correlationId: 'test',
        idempotencyKey: 'test'
      };

      const smallCost = (imageService as any).calculateCost({
        ...baseRequest,
        size: ImageSize.SQUARE_512
      });

      const largeCost = (imageService as any).calculateCost({
        ...baseRequest,
        size: ImageSize.SQUARE_1024
      });

      expect(largeCost).toBeGreaterThan(smallCost);
    });
  });
});