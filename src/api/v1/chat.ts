/**
 * Chat API Routes
 * AI conversation and assistant endpoints
 */

import { Router } from 'express';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/error-handling';
import { firestore, realtimeDb } from '../../app';
import { logger } from '../../shared/observability/logger';
import { AuthenticatedRequest } from '../../shared/types/firebase-auth';
import { FieldValue } from 'firebase-admin/firestore';

const chatRouter = Router();

// Start new conversation
chatRouter.post('/conversations', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user?.uid;
  
  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  const { title, initialMessage, modelPreferences } = req.body;

  if (!initialMessage) {
    throw new ValidationError('Initial message is required to start a conversation');
  }

  try {
    const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date();

    // Create conversation in Firestore
    const conversationData = {
      id: conversationId,
      userId,
      title: title || 'New Conversation',
      messages: [{
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        role: 'user',
        content: initialMessage,
        timestamp: timestamp.toISOString(),
        creditsUsed: 0
      }],
      modelPreferences: modelPreferences || {},
      createdAt: timestamp.toISOString(),
      lastMessageAt: timestamp.toISOString(),
      totalCreditsUsed: 0,
      status: 'active'
    };

    if (firestore) {
      await firestore.collection('conversations').doc(conversationId).set(conversationData);
    }

    // Create conversation state in Realtime Database for orchestration
    if (realtimeDb) {
      await realtimeDb.ref(`ai_orchestration/conversations/${conversationId}`).set({
        userId,
        status: 'pending_response',
        lastActivity: timestamp.toISOString(),
        messageCount: 1
      });
    }

    logger.info('Conversation created', {
      conversationId,
      userId,
      title: conversationData.title
    });

    res.status(201).json({
      success: true,
      data: {
        conversationId,
        title: conversationData.title,
        createdAt: conversationData.createdAt,
        status: 'created',
        message: 'Conversation created successfully. Use POST /conversations/:id/messages to send messages.'
      }
    });
  } catch (error) {
    logger.error('Failed to create conversation', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    throw new Error('Failed to create conversation');
  }
}));

// Send message to AI assistant
chatRouter.post('/conversations/:conversationId/messages', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user?.uid;
  const { conversationId } = req.params;
  const { message, modelOverride } = req.body;

  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  if (!message) {
    throw new ValidationError('Message content is required');
  }

  try {
    // Verify conversation exists and belongs to user
    if (firestore) {
      const conversationDoc = await firestore.collection('conversations').doc(conversationId).get();
      
      if (!conversationDoc.exists) {
        throw new NotFoundError('Conversation not found');
      }

      const conversationData = conversationDoc.data();
      if (conversationData?.userId !== userId) {
        throw new ValidationError('Access denied to this conversation');
      }
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date();

    // Add user message to conversation
    const userMessage = {
      id: messageId,
      role: 'user',
      content: message,
      timestamp: timestamp.toISOString(),
      creditsUsed: 0
    };

    if (firestore) {
      await firestore.collection('conversations').doc(conversationId).update({
        messages: FieldValue.arrayUnion(userMessage),
        lastMessageAt: timestamp.toISOString()
      });
    }

    // Queue AI response in Realtime Database for orchestration
    if (realtimeDb) {
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await realtimeDb.ref(`ai_orchestration/chat_tasks/${taskId}`).set({
        conversationId,
        userId,
        messageId,
        message,
        modelOverride: modelOverride || null,
        status: 'queued',
        createdAt: timestamp.toISOString(),
        priority: 'normal'
      });

      // Update conversation status
      await realtimeDb.ref(`ai_orchestration/conversations/${conversationId}`).update({
        status: 'processing_response',
        lastActivity: timestamp.toISOString(),
        currentTaskId: taskId
      });
    }

    logger.info('Message sent to AI assistant', {
      conversationId,
      messageId,
      userId
    });

    res.json({
      success: true,
      data: {
        messageId,
        conversationId,
        status: 'queued',
        message: 'Message sent to AI assistant. Response will be processed asynchronously.',
        timestamp: timestamp.toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to send message', {
      conversationId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    
    throw new Error('Failed to send message to AI assistant');
  }
}));

// Get conversation history
chatRouter.get('/conversations/:conversationId', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user?.uid;
  const { conversationId } = req.params;

  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  try {
    if (!firestore) {
      throw new Error('Firestore not available');
    }

    const conversationDoc = await firestore.collection('conversations').doc(conversationId).get();
    
    if (!conversationDoc.exists) {
      throw new NotFoundError('Conversation not found');
    }

    const conversationData = conversationDoc.data();
    if (conversationData?.userId !== userId) {
      throw new ValidationError('Access denied to this conversation');
    }

    // Get real-time status from Realtime Database
    let realtimeStatus = null;
    if (realtimeDb) {
      const statusSnapshot = await realtimeDb.ref(`ai_orchestration/conversations/${conversationId}`).once('value');
      realtimeStatus = statusSnapshot.val();
    }

    res.json({
      success: true,
      data: {
        id: conversationId,
        title: conversationData.title,
        messages: conversationData.messages || [],
        createdAt: conversationData.createdAt,
        lastMessageAt: conversationData.lastMessageAt,
        totalCreditsUsed: conversationData.totalCreditsUsed || 0,
        status: realtimeStatus?.status || 'active',
        messageCount: conversationData.messages?.length || 0
      }
    });
  } catch (error) {
    logger.error('Failed to get conversation', {
      conversationId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    
    throw new Error('Failed to retrieve conversation');
  }
}));

// List user conversations
chatRouter.get('/conversations', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
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

    let query = firestore.collection('conversations')
      .where('userId', '==', userId)
      .orderBy('lastMessageAt', 'desc')
      .limit(limit);

    if (offset > 0) {
      // For pagination, we'd need to implement cursor-based pagination
      // For now, we'll use a simple offset approach
    }

    const snapshot = await query.get();
    const conversations = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        lastMessageAt: data.lastMessageAt,
        createdAt: data.createdAt,
        messageCount: data.messages?.length || 0,
        totalCreditsUsed: data.totalCreditsUsed || 0,
        lastMessage: data.messages?.length > 0 ? 
          data.messages[data.messages.length - 1].content.substring(0, 100) + '...' : 
          null
      };
    });

    res.json({
      success: true,
      data: {
        conversations,
        pagination: {
          limit,
          offset,
          total: conversations.length,
          hasMore: conversations.length === limit
        }
      }
    });
  } catch (error) {
    logger.error('Failed to list conversations', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    throw new Error('Failed to retrieve conversations');
  }
}));

// Start long-running agent task
chatRouter.post('/agent-tasks', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user?.uid;
  const { taskType, prompt, parameters, priority = 'normal' } = req.body;

  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  if (!taskType || !prompt) {
    throw new ValidationError('Task type and prompt are required');
  }

  const validTaskTypes = ['research', 'code_generation', 'analysis', 'writing', 'complex_reasoning'];
  if (!validTaskTypes.includes(taskType)) {
    throw new ValidationError(`Invalid task type. Must be one of: ${validTaskTypes.join(', ')}`);
  }

  try {
    const taskId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date();

    // Queue agent task in Realtime Database
    if (realtimeDb) {
      await realtimeDb.ref(`ai_orchestration/agent_tasks/${taskId}`).set({
        userId,
        taskType,
        prompt,
        parameters: parameters || {},
        priority,
        status: 'queued',
        createdAt: timestamp.toISOString(),
        estimatedDuration: parameters?.estimatedDuration || 300, // 5 minutes default
        maxCredits: parameters?.maxCredits || 500
      });
    }

    // Create task record in Firestore
    if (firestore) {
      await firestore.collection('agent_tasks').doc(taskId).set({
        id: taskId,
        userId,
        taskType,
        prompt,
        parameters: parameters || {},
        priority,
        status: 'queued',
        createdAt: timestamp.toISOString(),
        progress: 0,
        result: null,
        creditsUsed: 0
      });
    }

    logger.info('Agent task created', {
      taskId,
      userId,
      taskType,
      priority
    });

    res.status(201).json({
      success: true,
      data: {
        taskId,
        status: 'queued',
        taskType,
        createdAt: timestamp.toISOString(),
        estimatedDuration: parameters?.estimatedDuration || 300,
        message: 'Agent task queued successfully. Use GET /agent-tasks/:taskId to check status.'
      }
    });
  } catch (error) {
    logger.error('Failed to create agent task', {
      userId,
      taskType,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    throw new Error('Failed to create agent task');
  }
}));

// Get agent task status
chatRouter.get('/agent-tasks/:taskId', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user?.uid;
  const { taskId } = req.params;

  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  try {
    if (!firestore) {
      throw new Error('Firestore not available');
    }

    const taskDoc = await firestore.collection('agent_tasks').doc(taskId).get();
    
    if (!taskDoc.exists) {
      throw new NotFoundError('Agent task not found');
    }

    const taskData = taskDoc.data();
    if (taskData?.userId !== userId) {
      throw new ValidationError('Access denied to this task');
    }

    // Get real-time status from Realtime Database
    let realtimeStatus = null;
    if (realtimeDb) {
      const statusSnapshot = await realtimeDb.ref(`ai_orchestration/agent_tasks/${taskId}`).once('value');
      realtimeStatus = statusSnapshot.val();
    }

    res.json({
      success: true,
      data: {
        taskId,
        taskType: taskData.taskType,
        status: realtimeStatus?.status || taskData.status,
        progress: realtimeStatus?.progress || taskData.progress || 0,
        createdAt: taskData.createdAt,
        updatedAt: realtimeStatus?.updatedAt || taskData.updatedAt,
        result: taskData.result,
        creditsUsed: taskData.creditsUsed || 0,
        estimatedCompletion: realtimeStatus?.estimatedCompletion,
        currentStep: realtimeStatus?.currentStep
      }
    });
  } catch (error) {
    logger.error('Failed to get agent task status', {
      taskId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    
    throw new Error('Failed to retrieve agent task status');
  }
}));

export { chatRouter };