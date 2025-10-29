/**
 * Conversation Manager
 * Manages conversation history, context, and real-time synchronization
 */

import {
  ConversationContext,
  ConversationMessage,
  MessageRole,

  MemoryConfig,
  MemoryType
} from '@/shared/types';
import { IStructuredLogger } from '@/shared/observability/logger';
import { IMetricsCollector } from '@/shared/observability/metrics';
import * as admin from 'firebase-admin';

/**
 * Interface for Conversation Manager
 */
export interface IConversationManager {
  // Conversation Management
  createConversation(userId: string, initialMessage?: string): Promise<ConversationContext>;
  getConversation(conversationId: string): Promise<ConversationContext>;
  updateConversation(context: ConversationContext): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  
  // Message Management
  addMessage(conversationId: string, message: ConversationMessage): Promise<void>;
  getMessages(conversationId: string, limit?: number, offset?: number): Promise<ConversationMessage[]>;
  updateMessage(conversationId: string, messageId: string, updates: Partial<ConversationMessage>): Promise<void>;
  
  // Context Management
  buildContextForRequest(conversationId: string, maxTokens?: number): Promise<string>;
  summarizeConversation(conversationId: string): Promise<ConversationSummary>;
  compressContext(context: ConversationContext, targetSize: number): Promise<ConversationContext>;
  
  // Memory Management
  configureMemory(conversationId: string, config: MemoryConfig): Promise<void>;
  getMemoryConfig(conversationId: string): Promise<MemoryConfig>;
  
  // Real-time Synchronization
  subscribeToConversation(conversationId: string): Promise<ConversationSubscription>;
  broadcastMessage(conversationId: string, message: ConversationMessage): Promise<void>;
  syncConversationState(conversationId: string): Promise<void>;
}

/**
 * Supporting interfaces
 */
export interface ConversationSummary {
  conversationId: string;
  summary: string;
  keyTopics: string[];
  messageCount: number;
  participantCount: number;
  timespan: {
    start: Date;
    end: Date;
    duration: number;
  };
  sentiment: ConversationSentiment;
  metadata: SummaryMetadata;
}

export interface ConversationSentiment {
  overall: SentimentScore;
  trend: SentimentTrend;
  keyMoments: SentimentMoment[];
}

export enum SentimentScore {
  VERY_NEGATIVE = -2,
  NEGATIVE = -1,
  NEUTRAL = 0,
  POSITIVE = 1,
  VERY_POSITIVE = 2
}

export enum SentimentTrend {
  IMPROVING = 'improving',
  DECLINING = 'declining',
  STABLE = 'stable',
  VOLATILE = 'volatile'
}

export interface SentimentMoment {
  messageId: string;
  timestamp: Date;
  sentiment: SentimentScore;
  reason: string;
}

export interface SummaryMetadata {
  generatedAt: Date;
  algorithm: string;
  confidence: number;
  compressionRatio: number;
}

export interface ConversationSubscription {
  subscriptionId: string;
  conversationId: string;
  userId: string;
  websocketUrl: string;
  events: SubscriptionEvent[];
  createdAt: Date;
  expiresAt: Date;
}

export enum SubscriptionEvent {
  MESSAGE_ADDED = 'message_added',
  MESSAGE_UPDATED = 'message_updated',
  CONTEXT_UPDATED = 'context_updated',
  TYPING_INDICATOR = 'typing_indicator',
  PARTICIPANT_JOINED = 'participant_joined',
  PARTICIPANT_LEFT = 'participant_left'
}

export interface ContextCompressionResult {
  originalContext: ConversationContext;
  compressedContext: ConversationContext;
  compressionRatio: number;
  preservedElements: string[];
  compressionStrategy: CompressionStrategy;
}

export enum CompressionStrategy {
  TRUNCATE_OLDEST = 'truncate_oldest',
  SUMMARIZE_BLOCKS = 'summarize_blocks',
  REMOVE_REDUNDANT = 'remove_redundant',
  KEEP_IMPORTANT = 'keep_important',
  HYBRID = 'hybrid'
}

/**
 * Conversation Manager Implementation
 */
export class ConversationManager implements IConversationManager {
  private firestore: admin.firestore.Firestore;
  private realtimeDB: admin.database.Database;
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  private activeSubscriptions: Map<string, ConversationSubscription> = new Map();

  constructor(
    firestore: admin.firestore.Firestore,
    realtimeDB: admin.database.Database,
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ) {
    this.firestore = firestore;
    this.realtimeDB = realtimeDB;
    this.logger = logger;
    this.metrics = metrics;
  }

  // ============================================================================
  // Conversation Management
  // ============================================================================

  async createConversation(userId: string, initialMessage?: string): Promise<ConversationContext> {
    try {
      const conversationId = this.generateId();
      
      const context: ConversationContext = {
        conversationId,
        userId,
        messageHistory: [],
        systemPrompt: this.getDefaultSystemPrompt(),
        variables: {},
        metadata: {
          createdAt: new Date(),
          lastActivity: new Date(),
          messageCount: 0,
          participantIds: [userId]
        }
      };

      // Add initial message if provided
      if (initialMessage) {
        const message: ConversationMessage = {
          id: this.generateId(),
          role: MessageRole.USER,
          content: initialMessage,
          timestamp: new Date(),
          metadata: {
            isInitial: true
          }
        };
        context.messageHistory.push(message);
        context.metadata!.messageCount = 1;
      }

      // Store in Firestore
      await this.firestore.collection('conversations').doc(conversationId).set({
        ...context,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActivity: admin.firestore.FieldValue.serverTimestamp()
      });

      // Initialize in Realtime Database for real-time sync
      await this.realtimeDB.ref(`conversations/${conversationId}`).set({
        userId,
        status: 'active',
        lastActivity: admin.database.ServerValue.TIMESTAMP,
        participantCount: 1
      });

      this.logger.info('Conversation created', {
        conversationId,
        userId,
        hasInitialMessage: !!initialMessage
      });

      this.metrics.increment('conversation_manager.conversations_created');

      return context;

    } catch (error) {
      this.logger.error('Failed to create conversation', {
        userId,
        error
      });
      throw error;
    }
  }

  async getConversation(conversationId: string): Promise<ConversationContext> {
    try {
      const doc = await this.firestore.collection('conversations').doc(conversationId).get();
      
      if (!doc.exists) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const context = doc.data() as ConversationContext;
      
      // Update last access time
      await this.updateLastActivity(conversationId);

      this.logger.debug('Conversation retrieved', {
        conversationId,
        messageCount: context.messageHistory.length
      });

      return context;

    } catch (error) {
      this.logger.error('Failed to get conversation', {
        conversationId,
        error
      });
      throw error;
    }
  }

  async updateConversation(context: ConversationContext): Promise<void> {
    try {
      const updateData = {
        ...context,
        lastActivity: admin.firestore.FieldValue.serverTimestamp(),
        'metadata.messageCount': context.messageHistory.length,
        'metadata.lastActivity': admin.firestore.FieldValue.serverTimestamp()
      };

      await this.firestore.collection('conversations').doc(context.conversationId).update(updateData);

      // Update real-time status
      await this.realtimeDB.ref(`conversations/${context.conversationId}`).update({
        lastActivity: admin.database.ServerValue.TIMESTAMP,
        messageCount: context.messageHistory.length
      });

      this.logger.debug('Conversation updated', {
        conversationId: context.conversationId,
        messageCount: context.messageHistory.length
      });

    } catch (error) {
      this.logger.error('Failed to update conversation', {
        conversationId: context.conversationId,
        error
      });
      throw error;
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    try {
      // Delete from Firestore
      await this.firestore.collection('conversations').doc(conversationId).delete();

      // Delete from Realtime Database
      await this.realtimeDB.ref(`conversations/${conversationId}`).remove();

      // Clean up any active subscriptions
      const subscription = Array.from(this.activeSubscriptions.values())
        .find(sub => sub.conversationId === conversationId);
      
      if (subscription) {
        this.activeSubscriptions.delete(subscription.subscriptionId);
      }

      this.logger.info('Conversation deleted', { conversationId });
      this.metrics.increment('conversation_manager.conversations_deleted');

    } catch (error) {
      this.logger.error('Failed to delete conversation', {
        conversationId,
        error
      });
      throw error;
    }
  }

  // ============================================================================
  // Message Management
  // ============================================================================

  async addMessage(conversationId: string, message: ConversationMessage): Promise<void> {
    try {
      const context = await this.getConversation(conversationId);
      
      // Add message to history
      context.messageHistory.push(message);
      
      // Update conversation
      await this.updateConversation(context);

      // Broadcast to subscribers
      await this.broadcastMessage(conversationId, message);

      this.logger.debug('Message added to conversation', {
        conversationId,
        messageId: message.id,
        role: message.role
      });

      this.metrics.increment('conversation_manager.messages_added', 1, {
        role: message.role.toString()
      });

    } catch (error) {
      this.logger.error('Failed to add message', {
        conversationId,
        messageId: message.id,
        error
      });
      throw error;
    }
  }

  async getMessages(conversationId: string, limit: number = 50, offset: number = 0): Promise<ConversationMessage[]> {
    try {
      const context = await this.getConversation(conversationId);
      
      // Apply pagination
      const start = Math.max(0, context.messageHistory.length - offset - limit);
      const end = Math.max(0, context.messageHistory.length - offset);
      
      const messages = context.messageHistory.slice(start, end);

      this.logger.debug('Messages retrieved', {
        conversationId,
        messageCount: messages.length,
        limit,
        offset
      });

      return messages;

    } catch (error) {
      this.logger.error('Failed to get messages', {
        conversationId,
        limit,
        offset,
        error
      });
      throw error;
    }
  }

  async updateMessage(conversationId: string, messageId: string, updates: Partial<ConversationMessage>): Promise<void> {
    try {
      const context = await this.getConversation(conversationId);
      
      // Find and update the message
      const messageIndex = context.messageHistory.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1) {
        throw new Error(`Message ${messageId} not found in conversation ${conversationId}`);
      }

      context.messageHistory[messageIndex] = {
        ...context.messageHistory[messageIndex],
        ...updates
      };

      await this.updateConversation(context);

      this.logger.debug('Message updated', {
        conversationId,
        messageId
      });

    } catch (error) {
      this.logger.error('Failed to update message', {
        conversationId,
        messageId,
        error
      });
      throw error;
    }
  }

  // ============================================================================
  // Context Management
  // ============================================================================

  async buildContextForRequest(conversationId: string, maxTokens: number = 4000): Promise<string> {
    try {
      const context = await this.getConversation(conversationId);
      
      let contextString = '';
      let tokenCount = 0;

      // Add system prompt
      if (context.systemPrompt) {
        const systemTokens = this.estimateTokens(context.systemPrompt);
        if (tokenCount + systemTokens <= maxTokens) {
          contextString += `System: ${context.systemPrompt}\n\n`;
          tokenCount += systemTokens;
        }
      }

      // Add messages in reverse order (most recent first)
      const messages = [...context.messageHistory].reverse();
      
      for (const message of messages) {
        const messageText = `${message.role === MessageRole.USER ? 'User' : 'Assistant'}: ${message.content}\n`;
        const messageTokens = this.estimateTokens(messageText);
        
        if (tokenCount + messageTokens > maxTokens) {
          break;
        }
        
        contextString = messageText + contextString;
        tokenCount += messageTokens;
      }

      this.logger.debug('Context built for request', {
        conversationId,
        tokenCount,
        maxTokens,
        messageCount: messages.length
      });

      return contextString.trim();

    } catch (error) {
      this.logger.error('Failed to build context for request', {
        conversationId,
        maxTokens,
        error
      });
      throw error;
    }
  }

  async summarizeConversation(conversationId: string): Promise<ConversationSummary> {
    try {
      const context = await this.getConversation(conversationId);
      
      if (context.messageHistory.length === 0) {
        throw new Error('Cannot summarize empty conversation');
      }

      // Extract key information
      const messages = context.messageHistory;
      const firstMessage = messages[0];
      const lastMessage = messages[messages.length - 1];
      
      // Generate summary (simplified version)
      const summary = this.generateSummaryText(messages);
      const keyTopics = this.extractKeyTopics(messages);
      const sentiment = this.analyzeSentiment(messages);

      const conversationSummary: ConversationSummary = {
        conversationId,
        summary,
        keyTopics,
        messageCount: messages.length,
        participantCount: new Set(messages.map(m => m.metadata?.userId || context.userId)).size,
        timespan: {
          start: firstMessage.timestamp,
          end: lastMessage.timestamp,
          duration: lastMessage.timestamp.getTime() - firstMessage.timestamp.getTime()
        },
        sentiment,
        metadata: {
          generatedAt: new Date(),
          algorithm: 'basic_extraction',
          confidence: 0.8,
          compressionRatio: summary.length / this.calculateTotalLength(messages)
        }
      };

      this.logger.info('Conversation summarized', {
        conversationId,
        messageCount: messages.length,
        summaryLength: summary.length
      });

      return conversationSummary;

    } catch (error) {
      this.logger.error('Failed to summarize conversation', {
        conversationId,
        error
      });
      throw error;
    }
  }

  async compressContext(context: ConversationContext, targetSize: number): Promise<ConversationContext> {
    try {
      const originalSize = this.calculateContextSize(context);
      
      if (originalSize <= targetSize) {
        return context; // No compression needed
      }

      const compressionRatio = targetSize / originalSize;
      let compressedContext = { ...context };

      // Strategy 1: Remove oldest messages
      if (compressionRatio < 0.8) {
        const keepCount = Math.floor(context.messageHistory.length * compressionRatio);
        compressedContext.messageHistory = context.messageHistory.slice(-keepCount);
      }

      // Strategy 2: Summarize message blocks if still too large
      const newSize = this.calculateContextSize(compressedContext);
      if (newSize > targetSize && compressedContext.messageHistory.length > 10) {
        compressedContext = await this.summarizeMessageBlocks(compressedContext, targetSize);
      }

      this.logger.debug('Context compressed', {
        conversationId: context.conversationId,
        originalSize,
        newSize: this.calculateContextSize(compressedContext),
        compressionRatio: this.calculateContextSize(compressedContext) / originalSize
      });

      return compressedContext;

    } catch (error) {
      this.logger.error('Failed to compress context', {
        conversationId: context.conversationId,
        error
      });
      throw error;
    }
  }

  // ============================================================================
  // Memory Management
  // ============================================================================

  async configureMemory(conversationId: string, config: MemoryConfig): Promise<void> {
    try {
      await this.firestore.collection('conversation_memory_configs').doc(conversationId).set({
        ...config,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      this.logger.info('Memory configuration updated', {
        conversationId,
        memoryType: config.type
      });

    } catch (error) {
      this.logger.error('Failed to configure memory', {
        conversationId,
        error
      });
      throw error;
    }
  }

  async getMemoryConfig(conversationId: string): Promise<MemoryConfig> {
    try {
      const doc = await this.firestore.collection('conversation_memory_configs').doc(conversationId).get();
      
      if (!doc.exists) {
        // Return default configuration
        return {
          type: MemoryType.BUFFER,
          maxTokens: 4000,
          summaryThreshold: 2000,
          persistenceEnabled: true
        };
      }

      return doc.data() as MemoryConfig;

    } catch (error) {
      this.logger.error('Failed to get memory config', {
        conversationId,
        error
      });
      throw error;
    }
  }

  // ============================================================================
  // Real-time Synchronization
  // ============================================================================

  async subscribeToConversation(conversationId: string): Promise<ConversationSubscription> {
    try {
      const subscriptionId = this.generateId();
      
      const subscription: ConversationSubscription = {
        subscriptionId,
        conversationId,
        userId: '', // Would be set from request context
        websocketUrl: `/ws/conversations/${conversationId}`,
        events: [
          SubscriptionEvent.MESSAGE_ADDED,
          SubscriptionEvent.MESSAGE_UPDATED,
          SubscriptionEvent.TYPING_INDICATOR
        ],
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
      };

      this.activeSubscriptions.set(subscriptionId, subscription);

      this.logger.info('Conversation subscription created', {
        subscriptionId,
        conversationId
      });

      return subscription;

    } catch (error) {
      this.logger.error('Failed to create conversation subscription', {
        conversationId,
        error
      });
      throw error;
    }
  }

  async broadcastMessage(conversationId: string, message: ConversationMessage): Promise<void> {
    try {
      // Find active subscriptions for this conversation
      const relevantSubscriptions = Array.from(this.activeSubscriptions.values())
        .filter(sub => sub.conversationId === conversationId && sub.expiresAt > new Date());

      if (relevantSubscriptions.length === 0) {
        return;
      }

      // Broadcast via Realtime Database
      await this.realtimeDB.ref(`conversations/${conversationId}/messages`).push({
        messageId: message.id,
        role: message.role,
        content: message.content,
        timestamp: admin.database.ServerValue.TIMESTAMP,
        creditsUsed: message.creditsUsed || 0
      });

      this.logger.debug('Message broadcast', {
        conversationId,
        messageId: message.id,
        subscriberCount: relevantSubscriptions.length
      });

      this.metrics.increment('conversation_manager.messages_broadcast');

    } catch (error) {
      this.logger.error('Failed to broadcast message', {
        conversationId,
        messageId: message.id,
        error
      });
    }
  }

  async syncConversationState(conversationId: string): Promise<void> {
    try {
      const context = await this.getConversation(conversationId);
      
      // Update Realtime Database with current state
      await this.realtimeDB.ref(`conversations/${conversationId}/state`).update({
        messageCount: context.messageHistory.length,
        lastActivity: admin.database.ServerValue.TIMESTAMP,
        status: 'active'
      });

      this.logger.debug('Conversation state synchronized', {
        conversationId,
        messageCount: context.messageHistory.length
      });

    } catch (error) {
      this.logger.error('Failed to sync conversation state', {
        conversationId,
        error
      });
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async updateLastActivity(conversationId: string): Promise<void> {
    await this.realtimeDB.ref(`conversations/${conversationId}/lastActivity`)
      .set(admin.database.ServerValue.TIMESTAMP);
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  private generateSummaryText(messages: ConversationMessage[]): string {
    // Simple summarization - in real implementation, would use AI
    const userMessages = messages.filter(m => m.role === MessageRole.USER);
    const topics = userMessages.map(m => 
      typeof m.content === 'string' ? m.content.substring(0, 100) : JSON.stringify(m.content).substring(0, 100)
    ).join('; ');
    
    return `Conversation covering: ${topics}`;
  }

  private extractKeyTopics(messages: ConversationMessage[]): string[] {
    // Simple keyword extraction
    const allText = messages.map(m => m.content).join(' ');
    const words = allText.toLowerCase().match(/\b\w{4,}\b/g) || [];
    
    // Count word frequency
    const wordCount = new Map<string, number>();
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });

    // Return top 5 most frequent words
    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  private analyzeSentiment(messages: ConversationMessage[]): ConversationSentiment {
    // Simple sentiment analysis - in real implementation, would use AI
    const sentiments = messages.map(message => {
      const content = (typeof message.content === 'string' ? message.content : JSON.stringify(message.content)).toLowerCase();
      let score = SentimentScore.NEUTRAL;
      
      if (content.includes('great') || content.includes('good') || content.includes('thanks')) {
        score = SentimentScore.POSITIVE;
      } else if (content.includes('bad') || content.includes('error') || content.includes('problem')) {
        score = SentimentScore.NEGATIVE;
      }
      
      return score;
    });

    const averageSentiment = sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;
    
    return {
      overall: Math.round(averageSentiment) as SentimentScore,
      trend: SentimentTrend.STABLE,
      keyMoments: []
    };
  }

  private calculateTotalLength(messages: ConversationMessage[]): number {
    return messages.reduce((total, message) => total + message.content.length, 0);
  }

  private calculateContextSize(context: ConversationContext): number {
    let size = 0;
    
    if (context.systemPrompt) {
      size += context.systemPrompt.length;
    }
    
    size += context.messageHistory.reduce((total, message) => 
      total + message.content.length, 0
    );
    
    return size;
  }

  private async summarizeMessageBlocks(context: ConversationContext, targetSize: number): Promise<ConversationContext> {
    // Simple block summarization - keep first and last few messages, summarize middle
    const messages = context.messageHistory;
    const keepStart = 3;
    const keepEnd = 3;
    
    if (messages.length <= keepStart + keepEnd) {
      return context;
    }

    const startMessages = messages.slice(0, keepStart);
    const endMessages = messages.slice(-keepEnd);
    const middleMessages = messages.slice(keepStart, -keepEnd);
    
    // Create summary message for middle section
    const summaryContent = `[Summary of ${middleMessages.length} messages: ${this.generateSummaryText(middleMessages)}]`;
    const summaryMessage: ConversationMessage = {
      id: this.generateId(),
      role: MessageRole.ASSISTANT,
      content: summaryContent,
      timestamp: middleMessages[0]?.timestamp || new Date(),
      metadata: {
        isSummary: true,
        originalMessageCount: middleMessages.length
      }
    };

    return {
      ...context,
      messageHistory: [...startMessages, summaryMessage, ...endMessages]
    };
  }

  private getDefaultSystemPrompt(): string {
    return "You are a helpful AI assistant. Provide clear, accurate, and helpful responses to user questions.";
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}