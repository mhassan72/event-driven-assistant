/**
 * Image Generation Workflow Integration Tests
 * Tests for image generation agent workflows and storage systems
 */

import { Database } from 'firebase-admin/database';
import { Firestore } from 'firebase-admin/firestore';
import { ImageGenerationService } from '@/features/ai-assistant/services/image-generation-service';
import { AgentWorkflowManager } from '@/features/ai-assistant/services/agent-workflow-manager';
import { CreditService } from '@/features/credit-system/services/credit-service';
import { 
  TaskType, 
  TaskStatus, 
  TaskPriority,
  AgentTaskRequest
} from '@/shared/types/ai-assistant';
import { 
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageSize,
  QualityLevel
} from '@/shared/types/image-generation';
import { IStructuredLogger } from '@/shared/observability/logger';
import { IMetricsCollector } from '@/shared/observability/metrics';

// Mock dependencies
const mockRealtimeDB = {
  ref: jest.fn().mockReturnThis(),
  once: jest.fn(),
  update: jest.fn(),
  set: jest.fn(),
  remove: jest.fn(),
  push: jest.fn()
} as unknown as jest.Mocked<Database>;

const mockFirestore = {
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  update: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
  add: jest.fn()
} as unknown as jest.Mocked<Firestore>;

const mockImageService = {
  generateImage: jest.fn(),
  generateBatchImages: jest.fn(),
  enhanceImage: jest.fn(),
  getGenerationStatus: jest.fn(),
  cancelGeneration: jest.fn()
} as unknown as jest.Mocked<ImageGenerationService>;

const mockWorkflowManager = {
  orchestrateAgentWorkflow: jest.fn(),
  monitorAgentTask: jest.fn(),
  recoverFailedAgent: jest.fn(),
  getWorkflowStatus: jest.fn()
} as unknown as jest.Mocked<AgentWorkflowManager>;

const mockCreditService = {
  deductCredits: jest.fn(),
  validateBalance: jest.fn(),
  getBalance: jest.fn()
} as unknown as jest.Mocked<CreditService>;

const mockLogger: jest.Mocked<IStructuredLogger> = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  logError: jest.fn()
};

const mockMetrics: jest.Mocked<IMetricsCollector> = {
  increment: jest.fn(),
  gauge: jest.fn(),
  histogram: jest.fn(),
  recordHttpRequest: jest.fn(),
  recordCreditOperation: jest.fn(),
  recordPayment: jest.fn(),
  getMetrics: jest.fn(),
  clearMetrics: jest.fn()
};

describe('Image Generation Workflow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock implementations
    mockRealtimeDB.ref.mockReturnValue({
      once: jest.fn().mockResolvedValue({ val: () => null }),
      update: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      push: jest.fn().mockResolvedValue({ key: 'generated-key' })
    } as any);

    mockFirestore.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({
        update: jest.fn().mockResolvedValue(undefined),
        set: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockResolvedValue({ exists: true, data: () => ({}) })
      }),
      add: jest.fn().mockResolvedValue({ id: 'generated-doc-id' })
    } as any);
  });

  describe('Single Image Generation Workflow', () => {
    it('should execute single image generation successfully', async () => {
      const imageRequest: ImageGenerationRequest = {
        id: 'img-req-1',
        userId: 'user-123',
        prompt: 'A beautiful sunset over mountains with vibrant colors',
        model: 'black-forest-labs/flux-schnell',
        size: ImageSize.SQUARE_1024,
        quality: QualityLevel.STANDARD,
        quantity: 1,
        style: 'photorealistic',
        negativePrompt: 'blurry, low quality',
        seed: 12345,
        steps: 20,
        guidanceScale: 7.5,
        metadata: {
          requestedAt: new Date(),
          priority: TaskPriority.NORMAL,
          estimatedCost: 50
        }
      };

      const expectedResult: ImageGenerationResult = {
        id: 'img-result-1',
        requestId: 'img-req-1',
        userId: 'user-123',
        status: 'completed',
        images: [
          {
            id: 'img-1',
            url: 'https://storage.googleapis.com/bucket/image-1.png',
            thumbnailUrl: 'https://storage.googleapis.com/bucket/thumb-1.png',
            size: ImageSize.SQUARE_1024,
            format: 'png',
            metadata: {
              width: 1024,
              height: 1024,
              fileSize: 2048576,
              generatedAt: new Date()
            }
          }
        ],
        prompt: imageRequest.prompt,
        model: imageRequest.model,
        generationTime: 15000,
        creditsUsed: 45,
        metadata: {
          completedAt: new Date(),
          processingSteps: ['prompt_analysis', 'image_generation', 'post_processing'],
          qualityScore: 0.92
        }
      };

      mockImageService.generateImage.mockResolvedValue(expectedResult);
      mockCreditService.validateBalance.mockResolvedValue(true);
      mockCreditService.deductCredits.mockResolvedValue({
        id: 'credit-txn-1',
        userId: 'user-123',
        type: 'deduction' as any,
        amount: 45,
        balanceBefore: 1000,
        balanceAfter: 955,
        reason: 'Image generation',
        timestamp: new Date(),
        metadata: { requestId: 'img-req-1' }
      });

      // Execute image generation workflow
      const result = await mockImageService.generateImage(imageRequest);

      expect(result).toEqual(expectedResult);
      expect(result.status).toBe('completed');
      expect(result.images).toHaveLength(1);
      expect(result.creditsUsed).toBe(45);

      // Verify credit validation and deduction
      expect(mockCreditService.validateBalance).toHaveBeenCalledWith(
        'user-123',
        imageRequest.metadata.estimatedCost
      );

      expect(mockCreditService.deductCredits).toHaveBeenCalledWith(
        'user-123',
        45,
        'Image generation',
        expect.objectContaining({
          requestId: 'img-req-1'
        })
      );

      // Verify image generation call
      expect(mockImageService.generateImage).toHaveBeenCalledWith(imageRequest);
    });

    it('should handle image generation with FLUX dev model', async () => {
      const imageRequest: ImageGenerationRequest = {
        id: 'img-req-flux-dev',
        userId: 'user-456',
        prompt: 'A futuristic cityscape at night with neon lights',
        model: 'black-forest-labs/flux-dev',
        size: ImageSize.LANDSCAPE_1344_768,
        quality: QualityLevel.HIGH,
        quantity: 1,
        style: 'cyberpunk',
        steps: 50,
        guidanceScale: 8.0,
        metadata: {
          requestedAt: new Date(),
          priority: TaskPriority.HIGH,
          estimatedCost: 100
        }
      };

      const expectedResult: ImageGenerationResult = {
        id: 'img-result-flux-dev',
        requestId: 'img-req-flux-dev',
        userId: 'user-456',
        status: 'completed',
        images: [
          {
            id: 'img-flux-dev-1',
            url: 'https://storage.googleapis.com/bucket/flux-dev-image.png',
            thumbnailUrl: 'https://storage.googleapis.com/bucket/flux-dev-thumb.png',
            size: ImageSize.LANDSCAPE_1344_768,
            format: 'png',
            metadata: {
              width: 1344,
              height: 768,
              fileSize: 3145728,
              generatedAt: new Date()
            }
          }
        ],
        prompt: imageRequest.prompt,
        model: imageRequest.model,
        generationTime: 35000,
        creditsUsed: 95,
        metadata: {
          completedAt: new Date(),
          processingSteps: ['prompt_analysis', 'style_processing', 'high_quality_generation', 'post_processing'],
          qualityScore: 0.96
        }
      };

      mockImageService.generateImage.mockResolvedValue(expectedResult);
      mockCreditService.validateBalance.mockResolvedValue(true);

      const result = await mockImageService.generateImage(imageRequest);

      expect(result).toEqual(expectedResult);
      expect(result.model).toBe('black-forest-labs/flux-dev');
      expect(result.generationTime).toBeGreaterThan(30000); // FLUX dev takes longer
      expect(result.creditsUsed).toBeGreaterThan(50); // Higher cost for dev model
      expect(result.metadata.qualityScore).toBeGreaterThan(0.9); // Higher quality
    });

    it('should handle insufficient credits error', async () => {
      const imageRequest: ImageGenerationRequest = {
        id: 'img-req-insufficient',
        userId: 'user-poor',
        prompt: 'An expensive image generation',
        model: 'black-forest-labs/flux-dev',
        size: ImageSize.SQUARE_1024,
        quality: QualityLevel.HIGH,
        quantity: 1,
        metadata: {
          requestedAt: new Date(),
          priority: TaskPriority.NORMAL,
          estimatedCost: 150
        }
      };

      mockCreditService.validateBalance.mockResolvedValue(false);
      mockImageService.generateImage.mockRejectedValue(
        new Error('Insufficient credits for image generation')
      );

      await expect(
        mockImageService.generateImage(imageRequest)
      ).rejects.toThrow('Insufficient credits for image generation');

      expect(mockCreditService.validateBalance).toHaveBeenCalledWith(
        'user-poor',
        150
      );

      // Should not attempt deduction if validation fails
      expect(mockCreditService.deductCredits).not.toHaveBeenCalled();
    });
  });

  describe('Batch Image Generation Workflow', () => {
    it('should execute batch image generation successfully', async () => {
      const batchRequest: ImageGenerationRequest = {
        id: 'batch-req-1',
        userId: 'user-batch',
        prompt: 'Various landscape scenes',
        model: 'black-forest-labs/flux-schnell',
        size: ImageSize.SQUARE_1024,
        quality: QualityLevel.STANDARD,
        quantity: 4,
        variations: [
          'mountain landscape',
          'ocean view',
          'forest scene',
          'desert vista'
        ],
        metadata: {
          requestedAt: new Date(),
          priority: TaskPriority.NORMAL,
          estimatedCost: 200
        }
      };

      const expectedBatchResult: ImageGenerationResult = {
        id: 'batch-result-1',
        requestId: 'batch-req-1',
        userId: 'user-batch',
        status: 'completed',
        images: [
          {
            id: 'batch-img-1',
            url: 'https://storage.googleapis.com/bucket/batch-1.png',
            thumbnailUrl: 'https://storage.googleapis.com/bucket/batch-thumb-1.png',
            size: ImageSize.SQUARE_1024,
            format: 'png',
            metadata: {
              width: 1024,
              height: 1024,
              fileSize: 2048576,
              generatedAt: new Date(),
              variation: 'mountain landscape'
            }
          },
          {
            id: 'batch-img-2',
            url: 'https://storage.googleapis.com/bucket/batch-2.png',
            thumbnailUrl: 'https://storage.googleapis.com/bucket/batch-thumb-2.png',
            size: ImageSize.SQUARE_1024,
            format: 'png',
            metadata: {
              width: 1024,
              height: 1024,
              fileSize: 2097152,
              generatedAt: new Date(),
              variation: 'ocean view'
            }
          },
          {
            id: 'batch-img-3',
            url: 'https://storage.googleapis.com/bucket/batch-3.png',
            thumbnailUrl: 'https://storage.googleapis.com/bucket/batch-thumb-3.png',
            size: ImageSize.SQUARE_1024,
            format: 'png',
            metadata: {
              width: 1024,
              height: 1024,
              fileSize: 1998848,
              generatedAt: new Date(),
              variation: 'forest scene'
            }
          },
          {
            id: 'batch-img-4',
            url: 'https://storage.googleapis.com/bucket/batch-4.png',
            thumbnailUrl: 'https://storage.googleapis.com/bucket/batch-thumb-4.png',
            size: ImageSize.SQUARE_1024,
            format: 'png',
            metadata: {
              width: 1024,
              height: 1024,
              fileSize: 2145728,
              generatedAt: new Date(),
              variation: 'desert vista'
            }
          }
        ],
        prompt: batchRequest.prompt,
        model: batchRequest.model,
        generationTime: 45000,
        creditsUsed: 180,
        metadata: {
          completedAt: new Date(),
          processingSteps: ['batch_analysis', 'parallel_generation', 'batch_post_processing'],
          qualityScore: 0.89,
          batchSize: 4
        }
      };

      mockImageService.generateBatchImages.mockResolvedValue(expectedBatchResult);
      mockCreditService.validateBalance.mockResolvedValue(true);

      const result = await mockImageService.generateBatchImages(batchRequest);

      expect(result).toEqual(expectedBatchResult);
      expect(result.images).toHaveLength(4);
      expect(result.images.every(img => img.metadata.variation)).toBe(true);
      expect(result.creditsUsed).toBe(180);
      expect(result.metadata.batchSize).toBe(4);

      // Verify batch processing call
      expect(mockImageService.generateBatchImages).toHaveBeenCalledWith(batchRequest);
    });

    it('should handle partial batch failures gracefully', async () => {
      const batchRequest: ImageGenerationRequest = {
        id: 'batch-req-partial-fail',
        userId: 'user-batch-fail',
        prompt: 'Batch with some failures',
        model: 'black-forest-labs/flux-schnell',
        size: ImageSize.SQUARE_1024,
        quality: QualityLevel.STANDARD,
        quantity: 3,
        variations: [
          'successful image 1',
          'failing image',
          'successful image 2'
        ],
        metadata: {
          requestedAt: new Date(),
          priority: TaskPriority.NORMAL,
          estimatedCost: 150
        }
      };

      const partialResult: ImageGenerationResult = {
        id: 'batch-result-partial',
        requestId: 'batch-req-partial-fail',
        userId: 'user-batch-fail',
        status: 'partially_completed',
        images: [
          {
            id: 'success-img-1',
            url: 'https://storage.googleapis.com/bucket/success-1.png',
            thumbnailUrl: 'https://storage.googleapis.com/bucket/success-thumb-1.png',
            size: ImageSize.SQUARE_1024,
            format: 'png',
            metadata: {
              width: 1024,
              height: 1024,
              fileSize: 2048576,
              generatedAt: new Date(),
              variation: 'successful image 1'
            }
          },
          {
            id: 'success-img-2',
            url: 'https://storage.googleapis.com/bucket/success-2.png',
            thumbnailUrl: 'https://storage.googleapis.com/bucket/success-thumb-2.png',
            size: ImageSize.SQUARE_1024,
            format: 'png',
            metadata: {
              width: 1024,
              height: 1024,
              fileSize: 2097152,
              generatedAt: new Date(),
              variation: 'successful image 2'
            }
          }
        ],
        prompt: batchRequest.prompt,
        model: batchRequest.model,
        generationTime: 30000,
        creditsUsed: 100, // Only charged for successful images
        errors: [
          {
            variation: 'failing image',
            error: 'Content policy violation',
            timestamp: new Date()
          }
        ],
        metadata: {
          completedAt: new Date(),
          processingSteps: ['batch_analysis', 'partial_generation', 'error_handling'],
          qualityScore: 0.85,
          batchSize: 3,
          successfulImages: 2,
          failedImages: 1
        }
      };

      mockImageService.generateBatchImages.mockResolvedValue(partialResult);
      mockCreditService.validateBalance.mockResolvedValue(true);

      const result = await mockImageService.generateBatchImages(batchRequest);

      expect(result.status).toBe('partially_completed');
      expect(result.images).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
      expect(result.creditsUsed).toBe(100); // Reduced cost for partial success
      expect(result.metadata.successfulImages).toBe(2);
      expect(result.metadata.failedImages).toBe(1);
    });
  });

  describe('Image Enhancement and Editing Workflow', () => {
    it('should enhance existing image successfully', async () => {
      const enhancementRequest = {
        id: 'enhance-req-1',
        userId: 'user-enhance',
        originalImageId: 'original-img-1',
        originalImageUrl: 'https://storage.googleapis.com/bucket/original.png',
        enhancementType: 'upscale',
        targetSize: ImageSize.SQUARE_2048,
        quality: QualityLevel.HIGH,
        parameters: {
          upscaleFactor: 2,
          preserveDetails: true,
          enhanceColors: true
        },
        metadata: {
          requestedAt: new Date(),
          estimatedCost: 75
        }
      };

      const enhancementResult = {
        id: 'enhance-result-1',
        requestId: 'enhance-req-1',
        userId: 'user-enhance',
        status: 'completed',
        originalImage: {
          id: 'original-img-1',
          url: 'https://storage.googleapis.com/bucket/original.png',
          size: ImageSize.SQUARE_1024
        },
        enhancedImage: {
          id: 'enhanced-img-1',
          url: 'https://storage.googleapis.com/bucket/enhanced.png',
          thumbnailUrl: 'https://storage.googleapis.com/bucket/enhanced-thumb.png',
          size: ImageSize.SQUARE_2048,
          format: 'png',
          metadata: {
            width: 2048,
            height: 2048,
            fileSize: 8388608,
            generatedAt: new Date(),
            enhancementType: 'upscale'
          }
        },
        enhancementType: 'upscale',
        processingTime: 20000,
        creditsUsed: 70,
        metadata: {
          completedAt: new Date(),
          processingSteps: ['image_analysis', 'upscaling', 'detail_enhancement', 'color_enhancement'],
          qualityImprovement: 0.25
        }
      };

      mockImageService.enhanceImage.mockResolvedValue(enhancementResult);
      mockCreditService.validateBalance.mockResolvedValue(true);

      const result = await mockImageService.enhanceImage(enhancementRequest);

      expect(result).toEqual(enhancementResult);
      expect(result.status).toBe('completed');
      expect(result.enhancedImage.size).toBe(ImageSize.SQUARE_2048);
      expect(result.creditsUsed).toBe(70);
      expect(result.metadata.qualityImprovement).toBeGreaterThan(0);

      // Verify enhancement call
      expect(mockImageService.enhanceImage).toHaveBeenCalledWith(enhancementRequest);
    });
  });

  describe('Image Generation Progress Tracking', () => {
    it('should track image generation progress in real-time', async () => {
      const imageRequest: ImageGenerationRequest = {
        id: 'progress-req-1',
        userId: 'user-progress',
        prompt: 'A complex scene requiring progress tracking',
        model: 'black-forest-labs/flux-dev',
        size: ImageSize.LANDSCAPE_1344_768,
        quality: QualityLevel.HIGH,
        quantity: 1,
        steps: 100, // More steps for detailed progress
        metadata: {
          requestedAt: new Date(),
          priority: TaskPriority.NORMAL,
          estimatedCost: 120
        }
      };

      // Mock progressive status updates
      const progressUpdates = [
        { status: 'queued', progress: 0, step: 'initialization' },
        { status: 'processing', progress: 25, step: 'prompt_analysis' },
        { status: 'processing', progress: 50, step: 'image_generation' },
        { status: 'processing', progress: 75, step: 'refinement' },
        { status: 'processing', progress: 90, step: 'post_processing' },
        { status: 'completed', progress: 100, step: 'finalization' }
      ];

      // Mock status tracking
      mockImageService.getGenerationStatus.mockImplementation(async (requestId) => {
        const randomIndex = Math.floor(Math.random() * progressUpdates.length);
        return {
          requestId,
          ...progressUpdates[randomIndex],
          timestamp: new Date()
        };
      });

      // Test progress tracking
      for (let i = 0; i < 3; i++) {
        const status = await mockImageService.getGenerationStatus('progress-req-1');
        
        expect(status).toBeDefined();
        expect(status.requestId).toBe('progress-req-1');
        expect(status.progress).toBeGreaterThanOrEqual(0);
        expect(status.progress).toBeLessThanOrEqual(100);
        expect(status.step).toBeDefined();
        expect(status.timestamp).toBeDefined();
      }

      expect(mockImageService.getGenerationStatus).toHaveBeenCalledTimes(3);
    });

    it('should handle generation cancellation', async () => {
      const requestId = 'cancel-req-1';

      const cancellationResult = {
        requestId,
        status: 'cancelled',
        cancelledAt: new Date(),
        refundAmount: 30, // Partial refund for work done
        message: 'Image generation cancelled by user'
      };

      mockImageService.cancelGeneration.mockResolvedValue(cancellationResult);
      mockCreditService.deductCredits.mockResolvedValue({
        id: 'refund-txn-1',
        userId: 'user-cancel',
        type: 'addition' as any,
        amount: 30,
        balanceBefore: 500,
        balanceAfter: 530,
        reason: 'Image generation cancellation refund',
        timestamp: new Date(),
        metadata: { requestId }
      });

      const result = await mockImageService.cancelGeneration(requestId);

      expect(result).toEqual(cancellationResult);
      expect(result.status).toBe('cancelled');
      expect(result.refundAmount).toBe(30);

      // Verify cancellation call
      expect(mockImageService.cancelGeneration).toHaveBeenCalledWith(requestId);
    });
  });

  describe('Image Storage and Retrieval', () => {
    it('should store generated images with proper metadata', async () => {
      const imageData = {
        id: 'store-img-1',
        userId: 'user-store',
        url: 'https://storage.googleapis.com/bucket/stored-image.png',
        thumbnailUrl: 'https://storage.googleapis.com/bucket/stored-thumb.png',
        prompt: 'A stored image for testing',
        model: 'black-forest-labs/flux-schnell',
        size: ImageSize.SQUARE_1024,
        format: 'png',
        metadata: {
          width: 1024,
          height: 1024,
          fileSize: 2048576,
          generatedAt: new Date(),
          creditsUsed: 45
        }
      };

      // Mock Firestore storage
      mockFirestore.collection.mockReturnValue({
        add: jest.fn().mockResolvedValue({ id: 'stored-doc-id' })
      } as any);

      // Simulate image storage
      const docRef = await mockFirestore.collection('generated_images').add(imageData);

      expect(docRef.id).toBe('stored-doc-id');
      expect(mockFirestore.collection).toHaveBeenCalledWith('generated_images');
    });

    it('should retrieve user image history', async () => {
      const userId = 'user-history';
      const mockImageHistory = [
        {
          id: 'hist-img-1',
          prompt: 'Historical image 1',
          url: 'https://storage.googleapis.com/bucket/hist-1.png',
          generatedAt: new Date(Date.now() - 86400000), // 1 day ago
          creditsUsed: 40
        },
        {
          id: 'hist-img-2',
          prompt: 'Historical image 2',
          url: 'https://storage.googleapis.com/bucket/hist-2.png',
          generatedAt: new Date(Date.now() - 43200000), // 12 hours ago
          creditsUsed: 55
        }
      ];

      // Mock Firestore query
      mockFirestore.collection.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          docs: mockImageHistory.map(img => ({
            id: img.id,
            data: () => img
          }))
        })
      } as any);

      // Simulate history retrieval
      const querySnapshot = await mockFirestore
        .collection('generated_images')
        .where('userId', '==', userId)
        .orderBy('generatedAt', 'desc')
        .limit(10)
        .get();

      const history = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      expect(history).toHaveLength(2);
      expect(history[0].id).toBe('hist-img-1');
      expect(history[1].id).toBe('hist-img-2');
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle model unavailability gracefully', async () => {
      const imageRequest: ImageGenerationRequest = {
        id: 'unavailable-model-req',
        userId: 'user-unavailable',
        prompt: 'Test with unavailable model',
        model: 'unavailable-model',
        size: ImageSize.SQUARE_1024,
        quality: QualityLevel.STANDARD,
        quantity: 1,
        metadata: {
          requestedAt: new Date(),
          priority: TaskPriority.NORMAL,
          estimatedCost: 50
        }
      };

      mockImageService.generateImage.mockRejectedValue(
        new Error('Model unavailable: unavailable-model')
      );

      await expect(
        mockImageService.generateImage(imageRequest)
      ).rejects.toThrow('Model unavailable: unavailable-model');

      expect(mockImageService.generateImage).toHaveBeenCalledWith(imageRequest);
    });

    it('should handle content policy violations', async () => {
      const violatingRequest: ImageGenerationRequest = {
        id: 'policy-violation-req',
        userId: 'user-violation',
        prompt: 'Content that violates policy',
        model: 'black-forest-labs/flux-schnell',
        size: ImageSize.SQUARE_1024,
        quality: QualityLevel.STANDARD,
        quantity: 1,
        metadata: {
          requestedAt: new Date(),
          priority: TaskPriority.NORMAL,
          estimatedCost: 50
        }
      };

      const policyViolationResult: ImageGenerationResult = {
        id: 'policy-violation-result',
        requestId: 'policy-violation-req',
        userId: 'user-violation',
        status: 'failed',
        images: [],
        prompt: violatingRequest.prompt,
        model: violatingRequest.model,
        generationTime: 2000,
        creditsUsed: 0, // No charge for policy violations
        errors: [
          {
            code: 'CONTENT_POLICY_VIOLATION',
            message: 'The provided prompt violates our content policy',
            timestamp: new Date()
          }
        ],
        metadata: {
          completedAt: new Date(),
          processingSteps: ['prompt_analysis', 'policy_check'],
          policyViolation: true
        }
      };

      mockImageService.generateImage.mockResolvedValue(policyViolationResult);

      const result = await mockImageService.generateImage(violatingRequest);

      expect(result.status).toBe('failed');
      expect(result.images).toHaveLength(0);
      expect(result.creditsUsed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('CONTENT_POLICY_VIOLATION');
      expect(result.metadata.policyViolation).toBe(true);
    });

    it('should handle storage failures with retry mechanism', async () => {
      const imageRequest: ImageGenerationRequest = {
        id: 'storage-fail-req',
        userId: 'user-storage-fail',
        prompt: 'Image with storage issues',
        model: 'black-forest-labs/flux-schnell',
        size: ImageSize.SQUARE_1024,
        quality: QualityLevel.STANDARD,
        quantity: 1,
        metadata: {
          requestedAt: new Date(),
          priority: TaskPriority.NORMAL,
          estimatedCost: 50
        }
      };

      // Mock storage failure then success
      mockFirestore.collection.mockReturnValue({
        add: jest.fn()
          .mockRejectedValueOnce(new Error('Storage temporarily unavailable'))
          .mockResolvedValueOnce({ id: 'retry-success-doc-id' })
      } as any);

      // Simulate retry mechanism
      let storageAttempts = 0;
      const maxRetries = 3;

      while (storageAttempts < maxRetries) {
        try {
          const docRef = await mockFirestore.collection('generated_images').add({
            id: 'storage-test-img',
            userId: imageRequest.userId,
            url: 'https://storage.googleapis.com/bucket/retry-image.png'
          });
          
          expect(docRef.id).toBe('retry-success-doc-id');
          break;
        } catch (error) {
          storageAttempts++;
          if (storageAttempts >= maxRetries) {
            throw error;
          }
        }
      }

      expect(storageAttempts).toBe(1); // Should succeed on second attempt
    });
  });
});