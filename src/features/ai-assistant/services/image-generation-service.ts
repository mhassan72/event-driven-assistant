/**
 * Image Generation Service
 * Handles image generation using FLUX models and other providers
 */

import { logger } from '../../../shared/observability/logger';
import { IMetricsCollector } from '../../../shared/observability/metrics';
import { 
  ImageGenerationRequest, 
  ImageGenerationResult, 
  GeneratedImage,
  ImageModel,
  GenerationStatus,
  ImageSize,
  ImageQuality,
  ImageFormat,
  StorageProvider,
  ImageGenerationError,
  ErrorType
} from '../../../shared/types/image-generation';
import { ICreditService } from '../../../shared/types/credit-system';
import { getStorage } from 'firebase-admin/storage';
import { v4 as uuidv4 } from 'uuid';

/**
 * Image generation service configuration
 */
export interface ImageGenerationConfig {
  nebiusApiKey: string;
  nebiusBaseUrl: string;
  defaultTimeout: number;
  maxRetries: number;
  storageProvider: StorageProvider;
  storageBucket: string;
}

/**
 * FLUX model API response
 */
interface FluxGenerationResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  images?: Array<{
    url: string;
    width: number;
    height: number;
    format: string;
  }>;
  error?: {
    code: string;
    message: string;
  };
  metadata?: {
    seed: number;
    steps: number;
    guidance_scale: number;
    processing_time: number;
  };
}

/**
 * Image generation service implementation
 */
export class ImageGenerationService {
  private config: ImageGenerationConfig;
  private metrics: IMetricsCollector;
  private creditService: ICreditService;
  private storage = getStorage();

  constructor(
    config: ImageGenerationConfig,
    metrics: IMetricsCollector,
    creditService: ICreditService
  ) {
    this.config = config;
    this.metrics = metrics;
    this.creditService = creditService;
  }

  /**
   * Generate images using specified model
   */
  async generateImages(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const startTime = Date.now();
    const correlationId = request.correlationId || `img_gen_${uuidv4()}`;

    logger.info('Starting image generation', {
      correlationId,
      userId: request.userId,
      model: request.model,
      count: request.count,
      size: request.size,
      quality: request.quality
    });

    try {
      // Validate request
      this.validateRequest(request);

      // Check and reserve credits
      const estimatedCost = this.calculateCost(request);
      await this.creditService.reserveCredits(request.userId, estimatedCost, correlationId);

      // Generate images based on model
      let generationResponse: FluxGenerationResponse;
      
      if (this.isFluxModel(request.model)) {
        generationResponse = await this.generateWithFlux(request, correlationId);
      } else {
        throw new Error(`Unsupported model: ${request.model}`);
      }

      // Process and store images
      const images = await this.processGeneratedImages(
        generationResponse, 
        request, 
        correlationId
      );

      // Calculate actual cost and deduct credits
      const actualCost = this.calculateActualCost(images, request);
      await this.creditService.deductCredits(
        request.userId, 
        actualCost, 
        correlationId,
        {
          type: 'image_generation',
          model: request.model,
          imageCount: images.length,
          size: request.size,
          quality: request.quality
        }
      );

      // Release any unused reserved credits
      if (actualCost < estimatedCost) {
        await this.creditService.releaseReservedCredits(
          request.userId, 
          estimatedCost - actualCost, 
          correlationId
        );
      }

      const result: ImageGenerationResult = {
        taskId: correlationId,
        userId: request.userId,
        requestId: request.idempotencyKey,
        images,
        status: GenerationStatus.COMPLETED,
        creditsUsed: actualCost,
        generationTime: Date.now() - startTime,
        metadata: {
          ...request.metadata,
          modelVersion: generationResponse.metadata?.seed?.toString(),
          processingTime: generationResponse.metadata?.processing_time,
          totalTime: Date.now() - startTime
        },
        createdAt: new Date(),
        completedAt: new Date()
      };

      // Record metrics
      this.metrics.increment('image_generation.completed', 1, {
        model: request.model,
        size: request.size,
        quality: request.quality,
        count: request.count.toString()
      });

      this.metrics.histogram('image_generation.duration', Date.now() - startTime, {
        model: request.model
      });

      logger.info('Image generation completed', {
        correlationId,
        userId: request.userId,
        imageCount: images.length,
        creditsUsed: actualCost,
        duration: Date.now() - startTime
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Image generation failed', {
        correlationId,
        userId: request.userId,
        error: errorMessage,
        duration: Date.now() - startTime
      });

      // Record error metrics
      this.metrics.increment('image_generation.failed', 1, {
        model: request.model,
        error_type: this.categorizeError(error)
      });

      // Release reserved credits on failure
      try {
        const estimatedCost = this.calculateCost(request);
        await this.creditService.releaseReservedCredits(
          request.userId, 
          estimatedCost, 
          correlationId
        );
      } catch (releaseError) {
        logger.error('Failed to release reserved credits', {
          correlationId,
          userId: request.userId,
          error: releaseError instanceof Error ? releaseError.message : 'Unknown error'
        });
      }

      const generationError: ImageGenerationError = {
        code: this.getErrorCode(error),
        message: errorMessage,
        type: this.getErrorType(error),
        retryable: this.isRetryableError(error),
        details: { correlationId, duration: Date.now() - startTime }
      };

      return {
        taskId: correlationId,
        userId: request.userId,
        requestId: request.idempotencyKey,
        images: [],
        status: GenerationStatus.FAILED,
        creditsUsed: 0,
        generationTime: Date.now() - startTime,
        metadata: request.metadata || {},
        error: generationError,
        createdAt: new Date()
      };
    }
  }

  /**
   * Generate images using FLUX models
   */
  private async generateWithFlux(
    request: ImageGenerationRequest, 
    correlationId: string
  ): Promise<FluxGenerationResponse> {
    const payload = {
      model: request.model,
      prompt: request.prompt,
      negative_prompt: request.negativePrompt,
      width: this.parseDimensions(request.size).width,
      height: this.parseDimensions(request.size).height,
      num_images: request.count,
      guidance_scale: request.guidanceScale || 7.5,
      num_inference_steps: request.steps || (request.model === ImageModel.FLUX_SCHNELL ? 4 : 20),
      seed: request.seed,
      safety_checker: request.safetyFilter !== false
    };

    logger.debug('Sending FLUX generation request', {
      correlationId,
      model: request.model,
      dimensions: `${payload.width}x${payload.height}`,
      steps: payload.num_inference_steps
    });

    const response = await fetch(`${this.config.nebiusBaseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.nebiusApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`FLUX API error: ${response.status} - ${errorData.message || response.statusText}`);
    }

    const result = await response.json() as FluxGenerationResponse;
    
    logger.debug('FLUX generation response received', {
      correlationId,
      status: result.status,
      imageCount: result.images?.length || 0
    });

    return result;
  }

  /**
   * Process generated images and store them
   */
  private async processGeneratedImages(
    response: FluxGenerationResponse,
    request: ImageGenerationRequest,
    correlationId: string
  ): Promise<GeneratedImage[]> {
    if (!response.images || response.images.length === 0) {
      throw new Error('No images generated');
    }

    const processedImages: GeneratedImage[] = [];

    for (let i = 0; i < response.images.length; i++) {
      const imageData = response.images[i];
      const imageId = `${correlationId}_${i}`;

      try {
        // Download image from temporary URL
        const imageResponse = await fetch(imageData.url);
        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: ${imageResponse.status}`);
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(imageBuffer);

        // Store original image
        const storagePath = `images/${request.userId}/${imageId}`;
        const originalUrl = await this.storeImage(buffer, storagePath, 'png');

        // Create thumbnail
        const thumbnailBuffer = await this.createThumbnail(buffer);
        const thumbnailPath = `images/${request.userId}/${imageId}_thumb`;
        const thumbnailUrl = await this.storeImage(thumbnailBuffer, thumbnailPath, 'jpeg');

        const generatedImage: GeneratedImage = {
          id: imageId,
          url: originalUrl,
          thumbnailUrl,
          size: request.size,
          format: ImageFormat.PNG,
          fileSize: buffer.length,
          prompt: request.prompt,
          model: request.model,
          seed: response.metadata?.seed,
          actualSteps: response.metadata?.steps,
          actualGuidanceScale: response.metadata?.guidance_scale,
          storageProvider: this.config.storageProvider,
          storagePath,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          downloadCount: 0
        };

        processedImages.push(generatedImage);

        logger.debug('Image processed and stored', {
          correlationId,
          imageId,
          fileSize: buffer.length,
          storagePath
        });

      } catch (error) {
        logger.error('Failed to process image', {
          correlationId,
          imageIndex: i,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Continue with other images
      }
    }

    if (processedImages.length === 0) {
      throw new Error('Failed to process any generated images');
    }

    return processedImages;
  }

  /**
   * Store image in Firebase Storage
   */
  private async storeImage(
    buffer: Buffer, 
    path: string, 
    format: string
  ): Promise<string> {
    const bucket = this.storage.bucket(this.config.storageBucket);
    const file = bucket.file(`${path}.${format}`);

    await file.save(buffer, {
      metadata: {
        contentType: `image/${format}`,
        cacheControl: 'public, max-age=31536000' // 1 year
      }
    });

    // Make file publicly accessible
    await file.makePublic();

    return `https://storage.googleapis.com/${this.config.storageBucket}/${path}.${format}`;
  }

  /**
   * Create thumbnail from image buffer
   */
  private async createThumbnail(buffer: Buffer): Promise<Buffer> {
    // For now, return the original buffer
    // In production, you'd use a library like Sharp to resize
    // TODO: Implement proper thumbnail generation with Sharp
    return buffer;
  }

  /**
   * Validate image generation request
   */
  private validateRequest(request: ImageGenerationRequest): void {
    if (!request.userId) {
      throw new Error('User ID is required');
    }

    if (!request.prompt || request.prompt.trim().length === 0) {
      throw new Error('Prompt is required');
    }

    if (request.prompt.length > 1000) {
      throw new Error('Prompt is too long (max 1000 characters)');
    }

    if (request.count < 1 || request.count > 4) {
      throw new Error('Image count must be between 1 and 4');
    }

    if (!Object.values(ImageModel).includes(request.model)) {
      throw new Error(`Unsupported model: ${request.model}`);
    }

    if (!Object.values(ImageSize).includes(request.size)) {
      throw new Error(`Unsupported size: ${request.size}`);
    }
  }

  /**
   * Calculate estimated cost for image generation
   */
  private calculateCost(request: ImageGenerationRequest): number {
    const baseCosts = {
      [ImageModel.FLUX_SCHNELL]: 10, // credits per image
      [ImageModel.FLUX_DEV]: 25,
      [ImageModel.DALL_E_3]: 40,
      [ImageModel.DALL_E_2]: 20,
      [ImageModel.MIDJOURNEY]: 30,
      [ImageModel.STABLE_DIFFUSION]: 15
    };

    const sizeMultipliers = {
      [ImageSize.SQUARE_256]: 0.5,
      [ImageSize.SQUARE_512]: 1.0,
      [ImageSize.SQUARE_1024]: 2.0,
      [ImageSize.PORTRAIT_512_768]: 1.2,
      [ImageSize.LANDSCAPE_768_512]: 1.2,
      [ImageSize.PORTRAIT_1024_1536]: 2.5,
      [ImageSize.LANDSCAPE_1536_1024]: 2.5,
      [ImageSize.ULTRA_WIDE_2048_1024]: 3.0,
      [ImageSize.ULTRA_TALL_1024_2048]: 3.0
    };

    const qualityMultipliers = {
      [ImageQuality.DRAFT]: 0.7,
      [ImageQuality.STANDARD]: 1.0,
      [ImageQuality.HD]: 1.5,
      [ImageQuality.ULTRA_HD]: 2.0
    };

    const baseCost = baseCosts[request.model] || 20;
    const sizeMultiplier = sizeMultipliers[request.size] || 1.0;
    const qualityMultiplier = qualityMultipliers[request.quality] || 1.0;

    return Math.ceil(baseCost * sizeMultiplier * qualityMultiplier * request.count);
  }

  /**
   * Calculate actual cost based on generated images
   */
  private calculateActualCost(images: GeneratedImage[], request: ImageGenerationRequest): number {
    // For now, use the same calculation as estimated cost
    // In production, you might adjust based on actual processing time or quality
    return this.calculateCost(request);
  }

  /**
   * Check if model is a FLUX model
   */
  private isFluxModel(model: ImageModel): boolean {
    return model === ImageModel.FLUX_SCHNELL || model === ImageModel.FLUX_DEV;
  }

  /**
   * Parse image dimensions from size string
   */
  private parseDimensions(size: ImageSize): { width: number; height: number } {
    const [width, height] = size.split('x').map(Number);
    return { width, height };
  }

  /**
   * Categorize error for metrics
   */
  private categorizeError(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('quota') || error.message.includes('rate limit')) {
        return 'quota_exceeded';
      }
      if (error.message.includes('timeout')) {
        return 'timeout';
      }
      if (error.message.includes('validation') || error.message.includes('invalid')) {
        return 'validation_error';
      }
      if (error.message.includes('credits') || error.message.includes('insufficient')) {
        return 'insufficient_credits';
      }
    }
    return 'unknown_error';
  }

  /**
   * Get error code for structured error handling
   */
  private getErrorCode(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('quota')) return 'QUOTA_EXCEEDED';
      if (error.message.includes('timeout')) return 'TIMEOUT';
      if (error.message.includes('validation')) return 'VALIDATION_ERROR';
      if (error.message.includes('credits')) return 'INSUFFICIENT_CREDITS';
      if (error.message.includes('API error')) return 'API_ERROR';
    }
    return 'UNKNOWN_ERROR';
  }

  /**
   * Get error type for structured error handling
   */
  private getErrorType(error: unknown): ErrorType {
    if (error instanceof Error) {
      if (error.message.includes('quota')) return ErrorType.QUOTA_EXCEEDED;
      if (error.message.includes('timeout')) return ErrorType.TIMEOUT_ERROR;
      if (error.message.includes('validation')) return ErrorType.VALIDATION_ERROR;
      if (error.message.includes('credits')) return ErrorType.INSUFFICIENT_CREDITS;
      if (error.message.includes('content policy')) return ErrorType.CONTENT_POLICY_VIOLATION;
    }
    return ErrorType.SYSTEM_ERROR;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('timeout') || 
             message.includes('network') || 
             message.includes('temporary') ||
             message.includes('503') ||
             message.includes('502') ||
             message.includes('500');
    }
    return false;
  }
}