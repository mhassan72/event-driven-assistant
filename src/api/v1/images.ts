/**
 * Images API Routes
 * Image generation and management endpoints
 */

import { Router } from 'express';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/error-handling';
import { firestore, realtimeDb } from '../../app';
import { logger } from '../../shared/observability/logger';
import { AuthenticatedRequest } from '../../shared/types/firebase-auth';

const imagesRouter = Router();

// Generate image
imagesRouter.post('/generate', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user?.uid;
  const { 
    prompt, 
    model = 'black-forest-labs/flux-schnell', 
    size = '1024x1024', 
    quality = 'standard',
    style,
    negativePrompt,
    seed,
    steps,
    guidanceScale
  } = req.body;

  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  if (!prompt) {
    throw new ValidationError('Prompt is required for image generation');
  }

  if (prompt.length > 1000) {
    throw new ValidationError('Prompt must be less than 1000 characters');
  }

  const validSizes = ['512x512', '768x768', '1024x1024', '1024x1792', '1792x1024'];
  if (!validSizes.includes(size)) {
    throw new ValidationError(`Invalid size. Must be one of: ${validSizes.join(', ')}`);
  }

  const validQualities = ['standard', 'hd'];
  if (!validQualities.includes(quality)) {
    throw new ValidationError(`Invalid quality. Must be one of: ${validQualities.join(', ')}`);
  }

  try {
    const taskId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date();

    // Estimate credits required
    let estimatedCredits = 100; // Base cost
    if (quality === 'hd') estimatedCredits *= 1.5;
    if (size.includes('1792')) estimatedCredits *= 1.3;
    if (model.includes('flux-dev')) estimatedCredits *= 2;

    // Queue image generation task in Realtime Database
    if (realtimeDb) {
      await realtimeDb.ref(`ai_orchestration/image_generation/${taskId}`).set({
        userId,
        prompt,
        model,
        size,
        quality,
        style: style || null,
        negativePrompt: negativePrompt || null,
        seed: seed || null,
        steps: steps || null,
        guidanceScale: guidanceScale || null,
        status: 'queued',
        createdAt: timestamp.toISOString(),
        estimatedCredits,
        priority: 'normal'
      });
    }

    // Create task record in Firestore
    if (firestore) {
      await firestore.collection('image_generation_tasks').doc(taskId).set({
        id: taskId,
        userId,
        prompt,
        model,
        size,
        quality,
        style: style || null,
        negativePrompt: negativePrompt || null,
        parameters: {
          seed: seed || null,
          steps: steps || null,
          guidanceScale: guidanceScale || null
        },
        status: 'queued',
        createdAt: timestamp.toISOString(),
        estimatedCredits,
        actualCredits: 0,
        progress: 0,
        result: null
      });
    }

    logger.info('Image generation task created', {
      taskId,
      userId,
      model,
      size,
      quality,
      estimatedCredits
    });

    res.status(201).json({
      success: true,
      data: {
        taskId,
        status: 'queued',
        prompt,
        model,
        size,
        quality,
        estimatedCredits,
        createdAt: timestamp.toISOString(),
        estimatedDuration: 30, // seconds
        message: 'Image generation task queued successfully. Use GET /images/generate/:taskId to check status.'
      }
    });
  } catch (error) {
    logger.error('Failed to create image generation task', {
      userId,
      model,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    throw new Error('Failed to create image generation task');
  }
}));

// Get image generation status
imagesRouter.get('/generate/:taskId', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user?.uid;
  const { taskId } = req.params;

  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  try {
    if (!firestore) {
      throw new Error('Firestore not available');
    }

    const taskDoc = await firestore.collection('image_generation_tasks').doc(taskId).get();
    
    if (!taskDoc.exists) {
      throw new NotFoundError('Image generation task not found');
    }

    const taskData = taskDoc.data();
    if (taskData?.userId !== userId) {
      throw new ValidationError('Access denied to this task');
    }

    // Get real-time status from Realtime Database
    let realtimeStatus = null;
    if (realtimeDb) {
      const statusSnapshot = await realtimeDb.ref(`ai_orchestration/image_generation/${taskId}`).once('value');
      realtimeStatus = statusSnapshot.val();
    }

    // If task is completed, get the generated image details
    let imageDetails = null;
    if (taskData.status === 'completed' && taskData.result?.imageId) {
      const imageDoc = await firestore.collection('generated_images').doc(taskData.result.imageId).get();
      if (imageDoc.exists) {
        imageDetails = imageDoc.data();
      }
    }

    res.json({
      success: true,
      data: {
        taskId,
        status: realtimeStatus?.status || taskData.status,
        progress: realtimeStatus?.progress || taskData.progress || 0,
        prompt: taskData.prompt,
        model: taskData.model,
        size: taskData.size,
        quality: taskData.quality,
        createdAt: taskData.createdAt,
        updatedAt: realtimeStatus?.updatedAt || taskData.updatedAt,
        estimatedCredits: taskData.estimatedCredits,
        actualCredits: taskData.actualCredits || 0,
        result: imageDetails ? {
          imageId: imageDetails.id,
          url: imageDetails.url,
          thumbnailUrl: imageDetails.thumbnailUrl,
          generationTime: imageDetails.generationTime
        } : taskData.result,
        error: realtimeStatus?.error || taskData.error
      }
    });
  } catch (error) {
    logger.error('Failed to get image generation status', {
      taskId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    
    throw new Error('Failed to retrieve image generation status');
  }
}));

// Get user's generated images
imagesRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user?.uid;

  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  try {
    if (!firestore) {
      throw new Error('Firestore not available');
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const model = req.query.model as string;
    const quality = req.query.quality as string;

    let query = firestore.collection('generated_images')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    // Apply filters
    if (model) {
      query = query.where('model', '==', model);
    }
    if (quality) {
      query = query.where('quality', '==', quality);
    }

    const snapshot = await query.get();
    const images = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        prompt: data.prompt.length > 100 ? data.prompt.substring(0, 100) + '...' : data.prompt,
        model: data.model,
        size: data.size,
        quality: data.quality,
        url: data.url,
        thumbnailUrl: data.thumbnailUrl,
        createdAt: data.createdAt,
        creditsUsed: data.creditsUsed,
        generationTime: data.generationTime
      };
    });

    res.json({
      success: true,
      data: {
        images,
        pagination: {
          limit,
          offset,
          total: images.length,
          hasMore: images.length === limit
        },
        filters: {
          model: model || null,
          quality: quality || null
        }
      }
    });
  } catch (error) {
    logger.error('Failed to list generated images', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    throw new Error('Failed to retrieve generated images');
  }
}));

// Get specific image details
imagesRouter.get('/:imageId', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user?.uid;
  const { imageId } = req.params;

  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  try {
    if (!firestore) {
      throw new Error('Firestore not available');
    }

    const imageDoc = await firestore.collection('generated_images').doc(imageId).get();
    
    if (!imageDoc.exists) {
      throw new NotFoundError('Image not found');
    }

    const imageData = imageDoc.data();
    if (imageData?.userId !== userId) {
      throw new ValidationError('Access denied to this image');
    }

    res.json({
      success: true,
      data: {
        id: imageId,
        prompt: imageData.prompt,
        model: imageData.model,
        size: imageData.size,
        quality: imageData.quality,
        style: imageData.style,
        negativePrompt: imageData.negativePrompt,
        url: imageData.url,
        thumbnailUrl: imageData.thumbnailUrl,
        createdAt: imageData.createdAt,
        creditsUsed: imageData.creditsUsed,
        generationTime: imageData.generationTime,
        metadata: imageData.metadata || {}
      }
    });
  } catch (error) {
    logger.error('Failed to get image details', {
      imageId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    
    throw new Error('Failed to retrieve image details');
  }
}));

// Delete generated image
imagesRouter.delete('/:imageId', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user?.uid;
  const { imageId } = req.params;

  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  try {
    if (!firestore) {
      throw new Error('Firestore not available');
    }

    const imageDoc = await firestore.collection('generated_images').doc(imageId).get();
    
    if (!imageDoc.exists) {
      throw new NotFoundError('Image not found');
    }

    const imageData = imageDoc.data();
    if (imageData?.userId !== userId) {
      throw new ValidationError('Access denied to this image');
    }

    // Delete the image document
    await firestore.collection('generated_images').doc(imageId).delete();

    // TODO: In a real implementation, also delete the actual image files from storage

    logger.info('Image deleted', {
      imageId,
      userId
    });

    res.json({
      success: true,
      data: {
        message: 'Image deleted successfully',
        imageId,
        deletedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to delete image', {
      imageId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    
    throw new Error('Failed to delete image');
  }
}));

// Batch delete images
imagesRouter.post('/batch-delete', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user?.uid;
  const { imageIds } = req.body;

  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
    throw new ValidationError('Array of image IDs is required');
  }

  if (imageIds.length > 50) {
    throw new ValidationError('Cannot delete more than 50 images at once');
  }

  try {
    if (!firestore) {
      throw new Error('Firestore not available');
    }

    const batch = firestore.batch();
    const deletedImages = [];
    const errors = [];

    for (const imageId of imageIds) {
      try {
        const imageDoc = await firestore.collection('generated_images').doc(imageId).get();
        
        if (!imageDoc.exists) {
          errors.push({ imageId, error: 'Image not found' });
          continue;
        }

        const imageData = imageDoc.data();
        if (imageData?.userId !== userId) {
          errors.push({ imageId, error: 'Access denied' });
          continue;
        }

        batch.delete(imageDoc.ref);
        deletedImages.push(imageId);
      } catch (error) {
        errors.push({ 
          imageId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    if (deletedImages.length > 0) {
      await batch.commit();
    }

    logger.info('Batch image deletion completed', {
      userId,
      deletedCount: deletedImages.length,
      errorCount: errors.length
    });

    res.json({
      success: true,
      data: {
        message: `Successfully deleted ${deletedImages.length} images`,
        deletedImages,
        errors,
        deletedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to batch delete images', {
      userId,
      imageCount: imageIds.length,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    throw new Error('Failed to batch delete images');
  }
}));

export { imagesRouter };