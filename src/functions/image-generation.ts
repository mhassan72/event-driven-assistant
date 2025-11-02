/**
 * Image Generation Handlers
 * Handles image generation tasks using Firebase Realtime Database triggers
 */

import { DatabaseEvent } from 'firebase-functions/v2/database';
import { DataSnapshot } from 'firebase-admin/database';
import { realtimeDb } from '../app';
import { logger } from '../shared/observability/logger';
import { ImageGenerationService } from '../features/ai-assistant/services/image-generation-service';
import { IMetricsCollector } from '../shared/observability/metrics';
import { CreditService } from '../features/credit-system/services/credit-service';
import { 
  ImageGenerationRequest,
  ImageModel,
  ImageSize,
  ImageQuality,
  GenerationStatus,
  StorageProvider,
  GenerationPriority
} from '../shared/types/image-generation';

interface ImageGenerationTask {
  id: string;
  userId: string;
  prompt: string;
  negativePrompt?: string;
  model: ImageModel;
  size: ImageSize;
  quality: ImageQuality;
  count: number;
  seed?: number;
  guidanceScale?: number;
  steps?: number;
  status: 'queued' | 'generating' | 'completed' | 'failed';
  progress?: number;
  imageUrls?: string[];
  thumbnailUrls?: string[];
  creditsReserved: number;
  creditsUsed?: number;
  generationTime?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

class ImageGenerationHandler {
  private imageService: ImageGenerationService;
  private database = realtimeDb;

  constructor() {
    // Initialize services with placeholder metrics
    const metrics: IMetricsCollector = {
      increment: (name: string, value: number = 1, labels?: Record<string, string>) => {
        logger.debug('Metrics increment', { name, value, labels });
      },
      counter: (name: string, value: number = 1, labels?: Record<string, string>) => {
        logger.debug('Metrics counter', { name, value, labels });
      },
      incrementCounter: (name: string, labels?: Record<string, string>) => {
        logger.debug('Metrics increment counter', { name, labels });
      },
      histogram: (name: string, value: number, labels?: Record<string, string>) => {
        logger.debug('Metrics histogram', { name, value, labels });
      },
      gauge: (name: string, value: number, labels?: Record<string, string>) => {
        logger.debug('Metrics gauge', { name, value, labels });
      },
      recordHttpRequest: (metric) => {
        logger.debug('HTTP request metric', metric);
      },
      recordCreditOperation: (metric) => {
        logger.debug('Credit operation metric', metric);
      },
      recordPayment: (metric) => {
        logger.debug('Payment metric', metric);
      },
      getMetrics: (type?: string) => [],
      clearMetrics: (type?: string) => {}
    };
    const creditService = new CreditService(metrics);
    
    const config = {
      nebiusApiKey: process.env.NEBIUS_API_KEY || '',
      nebiusBaseUrl: process.env.NEBIUS_BASE_URL || 'https://api.studio.nebius.ai',
      defaultTimeout: 300000, // 5 minutes
      maxRetries: 3,
      storageProvider: StorageProvider.FIREBASE_STORAGE,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'default-bucket'
    };

    this.imageService = new ImageGenerationService(config, metrics, creditService);
  }

  async generateImage(event: DatabaseEvent<DataSnapshot>): Promise<void> {
    const taskId = event.params?.taskId;
    const taskData = event.data?.val() as ImageGenerationTask;

    if (!taskId || !taskData) {
      logger.error('Invalid image generation task data', { taskId });
      return;
    }

    const correlationId = `image_gen_${taskId}_${Date.now()}`;

    logger.info('Image generation task started', {
      taskId,
      correlationId,
      userId: taskData.userId,
      model: taskData.model,
      prompt: taskData.prompt?.substring(0, 100) + '...',
      size: taskData.size,
      quality: taskData.quality,
      count: taskData.count,
      creditsReserved: taskData.creditsReserved
    });

    try {
      // Update task status to generating
      await this.updateTaskStatus(taskId, {
        status: 'generating',
        progress: 10,
        updatedAt: Date.now()
      });

      // Convert task data to image generation request
      const request: ImageGenerationRequest = {
        userId: taskData.userId,
        prompt: taskData.prompt,
        negativePrompt: taskData.negativePrompt,
        model: taskData.model,
        size: taskData.size,
        quality: taskData.quality,
        count: taskData.count || 1,
        seed: taskData.seed,
        guidanceScale: taskData.guidanceScale,
        steps: taskData.steps,
        safetyFilter: true,
        estimatedCost: taskData.creditsReserved,
        priority: GenerationPriority.NORMAL,
        metadata: {
          taskId,
          correlationId,
          sessionId: taskId
        },
        correlationId,
        idempotencyKey: taskId
      };

      // Update progress
      await this.updateTaskStatus(taskId, {
        progress: 30,
        updatedAt: Date.now()
      });

      // Generate images
      const result = await this.imageService.generateImages(request);

      if (result.status === GenerationStatus.COMPLETED && result.images.length > 0) {
        // Extract URLs for storage in RTDB
        const imageUrls = result.images.map(img => img.url);
        const thumbnailUrls = result.images.map(img => img.thumbnailUrl);

        // Update task with successful result
        await this.updateTaskStatus(taskId, {
          status: 'completed',
          progress: 100,
          imageUrls,
          thumbnailUrls,
          creditsUsed: result.creditsUsed,
          generationTime: result.generationTime,
          updatedAt: Date.now()
        });

        logger.info('Image generation completed successfully', {
          taskId,
          correlationId,
          userId: taskData.userId,
          imageCount: result.images.length,
          creditsUsed: result.creditsUsed,
          generationTime: result.generationTime
        });

      } else {
        // Handle generation failure
        const errorMessage = result.error?.message || 'Image generation failed';
        
        await this.updateTaskStatus(taskId, {
          status: 'failed',
          error: errorMessage,
          creditsUsed: result.creditsUsed,
          generationTime: result.generationTime,
          updatedAt: Date.now()
        });

        logger.error('Image generation failed', {
          taskId,
          correlationId,
          userId: taskData.userId,
          error: errorMessage,
          errorCode: result.error?.code,
          retryable: result.error?.retryable
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update task with error status
      await this.updateTaskStatus(taskId, {
        status: 'failed',
        error: errorMessage,
        updatedAt: Date.now()
      });

      logger.error('Image generation handler error', {
        taskId,
        correlationId,
        userId: taskData.userId,
        error: errorMessage
      });

      // Don't re-throw to prevent function retry
      // The error is already recorded in the database
    }
  }

  /**
   * Update task status in Realtime Database
   */
  private async updateTaskStatus(taskId: string, updates: Partial<ImageGenerationTask>): Promise<void> {
    try {
      const taskRef = this.database.ref(`ai_orchestration/image_generation/${taskId}`);
      await taskRef.update(updates);
    } catch (error) {
      logger.error('Failed to update task status', {
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

const handler = new ImageGenerationHandler();
export default handler;