/**
 * Task Classification Service
 * Intelligent task classification for routing between synchronous and asynchronous processing
 */

import {
  ConversationRequest,
  TaskType,
  TaskClassification,
  TaskComplexity,
  ModelRequirements,
  AIModel
} from '@/shared/types';
import { IStructuredLogger } from '@/shared/observability/logger';
import { IMetricsCollector } from '@/shared/observability/metrics';

/**
 * Interface for Task Classification Service
 */
export interface ITaskClassifier {
  // Task Classification
  classifyTask(request: ConversationRequest): Promise<TaskClassification>;
  analyzeTaskComplexity(message: string, context?: any): Promise<TaskComplexity>;
  estimateTaskDuration(taskType: TaskType, complexity: TaskComplexity): number;
  
  // Resource Estimation
  estimateResourceRequirements(classification: TaskClassification): Promise<ModelRequirements>;
  calculateCreditCost(classification: TaskClassification, model?: AIModel): Promise<number>;
  
  // Classification Rules
  updateClassificationRules(rules: ClassificationRule[]): Promise<void>;
  getClassificationRules(): Promise<ClassificationRule[]>;
}

/**
 * Supporting interfaces
 */
export interface ClassificationRule {
  id: string;
  name: string;
  description: string;
  patterns: ClassificationPattern[];
  taskType: TaskType;
  complexity: TaskComplexity;
  priority: number;
  isActive: boolean;
}

export interface ClassificationPattern {
  type: PatternType;
  pattern: string;
  weight: number;
  description: string;
}

export enum PatternType {
  KEYWORD = 'keyword',
  REGEX = 'regex',
  LENGTH = 'length',
  STRUCTURE = 'structure',
  INTENT = 'intent'
}

export interface TaskFeatures {
  messageLength: number;
  wordCount: number;
  sentenceCount: number;
  hasCodeBlocks: boolean;
  hasUrls: boolean;
  hasImages: boolean;
  hasComplexQuestions: boolean;
  hasMultipleSteps: boolean;
  requiresResearch: boolean;
  requiresCreativity: boolean;
  requiresAnalysis: boolean;
  languageComplexity: number;
  technicalTerms: string[];
  keywords: string[];
}

/**
 * Task Classifier Implementation
 */
export class TaskClassifier implements ITaskClassifier {
  private logger: IStructuredLogger;
  private metrics: IMetricsCollector;
  private classificationRules: ClassificationRule[] = [];

  constructor(
    logger: IStructuredLogger,
    metrics: IMetricsCollector
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.initializeDefaultRules();
  }

  // ============================================================================
  // Task Classification
  // ============================================================================

  async classifyTask(request: ConversationRequest): Promise<TaskClassification> {
    try {
      this.logger.debug('Classifying task', { 
        conversationId: request.conversationId,
        messageLength: request.message.length 
      });

      // Extract features from the message
      const features = this.extractTaskFeatures(request.message);
      
      // Apply classification rules
      const taskType = await this.determineTaskType(features, request);
      const complexity = await this.analyzeTaskComplexity(request.message, request.context);
      
      // Estimate duration and cost
      const estimatedDuration = this.estimateTaskDuration(taskType, complexity);
      const requiresAgentExecution = this.requiresAgentExecution(taskType, complexity);
      const estimatedCreditCost = await this.estimateBaseCreditCost(taskType, complexity, features);
      
      // Calculate confidence based on rule matches
      const confidence = this.calculateClassificationConfidence(features, taskType);
      
      // Generate reasoning
      const reasoning = this.generateClassificationReasoning(features, taskType, complexity);

      const classification: TaskClassification = {
        type: taskType,
        estimatedDuration,
        complexity,
        requiresAgentExecution,
        estimatedCreditCost,
        confidence,
        reasoning
      };

      // Record classification metrics
      this.metrics.increment('task_classifier.classifications', 1, {
        taskType: taskType.toString(),
        complexity: complexity.toString(),
        requiresAgent: requiresAgentExecution.toString()
      });

      this.logger.info('Task classified', {
        conversationId: request.conversationId,
        classification
      });

      return classification;

    } catch (error) {
      this.logger.error('Task classification failed', {
        conversationId: request.conversationId,
        error
      });
      this.metrics.increment('task_classifier.errors');
      throw error;
    }
  }

  async analyzeTaskComplexity(message: string, context?: any): Promise<TaskComplexity> {
    const features = this.extractTaskFeatures(message);
    let complexityScore = 0;

    // Length-based complexity
    if (features.messageLength > 2000) complexityScore += 2;
    else if (features.messageLength > 500) complexityScore += 1;

    // Structure-based complexity
    if (features.hasCodeBlocks) complexityScore += 2;
    if (features.hasMultipleSteps) complexityScore += 2;
    if (features.hasComplexQuestions) complexityScore += 1;

    // Content-based complexity
    if (features.requiresResearch) complexityScore += 3;
    if (features.requiresAnalysis) complexityScore += 2;
    if (features.requiresCreativity) complexityScore += 1;

    // Technical complexity
    if (features.technicalTerms.length > 5) complexityScore += 2;
    if (features.languageComplexity > 0.7) complexityScore += 1;

    // Context-based complexity
    if (context?.messageHistory && context.messageHistory.length > 10) {
      complexityScore += 1;
    }

    // Map score to complexity level
    if (complexityScore >= 8) return TaskComplexity.HIGH;
    if (complexityScore >= 4) return TaskComplexity.MEDIUM;
    return TaskComplexity.LOW;
  }

  estimateTaskDuration(taskType: TaskType, complexity: TaskComplexity): number {
    const baseDurations = {
      [TaskType.QUICK_CHAT]: 5,
      [TaskType.IMAGE_GENERATION]: 30,
      [TaskType.RESEARCH_TASK]: 180,
      [TaskType.CODE_GENERATION]: 120,
      [TaskType.DATA_ANALYSIS]: 240,
      [TaskType.LONG_FORM_WRITING]: 300,
      [TaskType.MULTI_STEP_WORKFLOW]: 600,
      [TaskType.VISION_ANALYSIS]: 60
    };

    const complexityMultipliers = {
      [TaskComplexity.LOW]: 1.0,
      [TaskComplexity.MEDIUM]: 2.0,
      [TaskComplexity.HIGH]: 4.0
    };

    const baseDuration = baseDurations[taskType] || 30;
    const multiplier = complexityMultipliers[complexity] || 1.0;

    return Math.round(baseDuration * multiplier);
  }

  // ============================================================================
  // Resource Estimation
  // ============================================================================

  async estimateResourceRequirements(classification: TaskClassification): Promise<ModelRequirements> {
    const baseInputSize = this.estimateInputTokens(classification);
    const expectedOutputSize = this.estimateOutputTokens(classification);

    return {
      taskType: classification.type,
      inputSize: baseInputSize,
      expectedOutputSize,
      maxBudget: this.calculateMaxBudget(classification),
      maxLatency: this.calculateMaxLatency(classification),
      requiredFeatures: this.getRequiredFeatures(classification),
      qualityThreshold: this.getQualityThreshold(classification)
    };
  }

  async calculateCreditCost(classification: TaskClassification, model?: AIModel): Promise<number> {
    let baseCost = classification.estimatedCreditCost;

    // Adjust for model if provided
    if (model) {
      const modelMultiplier = this.getModelCostMultiplier(model, classification.type);
      baseCost *= modelMultiplier;
    }

    // Adjust for complexity
    const complexityMultipliers = {
      [TaskComplexity.LOW]: 1.0,
      [TaskComplexity.MEDIUM]: 1.5,
      [TaskComplexity.HIGH]: 2.5
    };

    baseCost *= complexityMultipliers[classification.complexity];

    // Add agent execution overhead if required
    if (classification.requiresAgentExecution) {
      baseCost *= 1.3; // 30% overhead for agent execution
    }

    return Math.round(baseCost);
  }

  // ============================================================================
  // Classification Rules Management
  // ============================================================================

  async updateClassificationRules(rules: ClassificationRule[]): Promise<void> {
    this.classificationRules = rules.sort((a, b) => b.priority - a.priority);
    this.logger.info('Classification rules updated', { ruleCount: rules.length });
  }

  async getClassificationRules(): Promise<ClassificationRule[]> {
    return [...this.classificationRules];
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private extractTaskFeatures(message: string): TaskFeatures {
    const words = message.split(/\s+/);
    const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 0);

    return {
      messageLength: message.length,
      wordCount: words.length,
      sentenceCount: sentences.length,
      hasCodeBlocks: /```[\s\S]*?```|`[^`]+`/.test(message),
      hasUrls: /https?:\/\/[^\s]+/.test(message),
      hasImages: /\.(jpg|jpeg|png|gif|webp|svg)/i.test(message),
      hasComplexQuestions: this.detectComplexQuestions(message),
      hasMultipleSteps: this.detectMultipleSteps(message),
      requiresResearch: this.detectResearchNeeds(message),
      requiresCreativity: this.detectCreativityNeeds(message),
      requiresAnalysis: this.detectAnalysisNeeds(message),
      languageComplexity: this.calculateLanguageComplexity(message),
      technicalTerms: this.extractTechnicalTerms(message),
      keywords: this.extractKeywords(message)
    };
  }

  private async determineTaskType(features: TaskFeatures, request: ConversationRequest): Promise<TaskType> {
    // Apply classification rules in priority order
    for (const rule of this.classificationRules) {
      if (!rule.isActive) continue;

      let matchScore = 0;
      let totalWeight = 0;

      for (const pattern of rule.patterns) {
        totalWeight += pattern.weight;
        if (this.matchesPattern(pattern, features, request.message)) {
          matchScore += pattern.weight;
        }
      }

      // If match score is above threshold (70%), classify as this task type
      if (totalWeight > 0 && (matchScore / totalWeight) >= 0.7) {
        return rule.taskType;
      }
    }

    // Default fallback classification
    return this.getDefaultTaskType(features);
  }

  private matchesPattern(pattern: ClassificationPattern, features: TaskFeatures, message: string): boolean {
    switch (pattern.type) {
      case PatternType.KEYWORD:
        return message.toLowerCase().includes(pattern.pattern.toLowerCase());
      
      case PatternType.REGEX:
        return new RegExp(pattern.pattern, 'i').test(message);
      
      case PatternType.LENGTH:
        const lengthThreshold = parseInt(pattern.pattern);
        return features.messageLength >= lengthThreshold;
      
      case PatternType.STRUCTURE:
        return this.matchesStructuralPattern(pattern.pattern, features);
      
      case PatternType.INTENT:
        return this.matchesIntentPattern(pattern.pattern, message);
      
      default:
        return false;
    }
  }

  private matchesStructuralPattern(pattern: string, features: TaskFeatures): boolean {
    switch (pattern) {
      case 'has_code': return features.hasCodeBlocks;
      case 'has_urls': return features.hasUrls;
      case 'has_images': return features.hasImages;
      case 'multiple_steps': return features.hasMultipleSteps;
      case 'complex_questions': return features.hasComplexQuestions;
      default: return false;
    }
  }

  private matchesIntentPattern(pattern: string, message: string): boolean {
    const intentKeywords = {
      'generate_image': ['create image', 'generate image', 'draw', 'picture', 'visual', 'illustration'],
      'analyze_code': ['analyze code', 'review code', 'debug', 'fix bug', 'code review'],
      'research': ['research', 'find information', 'look up', 'investigate', 'study'],
      'write_content': ['write', 'compose', 'create content', 'draft', 'article'],
      'data_analysis': ['analyze data', 'statistics', 'chart', 'graph', 'dataset']
    };

    const keywords = intentKeywords[pattern as keyof typeof intentKeywords] || [];
    return keywords.some((keyword: string) => message.toLowerCase().includes(keyword));
  }

  private getDefaultTaskType(features: TaskFeatures): TaskType {
    // Simple heuristic-based classification
    if (features.hasImages || features.keywords.some(k => 
      ['image', 'picture', 'visual', 'draw', 'create'].includes(k.toLowerCase())
    )) {
      return TaskType.IMAGE_GENERATION;
    }

    if (features.hasCodeBlocks || features.technicalTerms.length > 3) {
      return TaskType.CODE_GENERATION;
    }

    if (features.requiresResearch || features.keywords.some(k => 
      ['research', 'find', 'search', 'investigate'].includes(k.toLowerCase())
    )) {
      return TaskType.RESEARCH_TASK;
    }

    if (features.requiresAnalysis || features.keywords.some(k => 
      ['analyze', 'analysis', 'data', 'statistics'].includes(k.toLowerCase())
    )) {
      return TaskType.DATA_ANALYSIS;
    }

    if (features.messageLength > 1000 || features.requiresCreativity) {
      return TaskType.LONG_FORM_WRITING;
    }

    if (features.hasMultipleSteps) {
      return TaskType.MULTI_STEP_WORKFLOW;
    }

    // Default to quick chat
    return TaskType.QUICK_CHAT;
  }

  private requiresAgentExecution(taskType: TaskType, complexity: TaskComplexity): boolean {
    // Agent execution required for complex tasks or specific task types
    const agentRequiredTypes = [
      TaskType.RESEARCH_TASK,
      TaskType.DATA_ANALYSIS,
      TaskType.MULTI_STEP_WORKFLOW
    ];

    return agentRequiredTypes.includes(taskType) || 
           (complexity === TaskComplexity.HIGH && taskType !== TaskType.QUICK_CHAT);
  }

  private async estimateBaseCreditCost(taskType: TaskType, complexity: TaskComplexity, features: TaskFeatures): Promise<number> {
    const baseCosts = {
      [TaskType.QUICK_CHAT]: 5,
      [TaskType.IMAGE_GENERATION]: 50,
      [TaskType.RESEARCH_TASK]: 25,
      [TaskType.CODE_GENERATION]: 20,
      [TaskType.DATA_ANALYSIS]: 30,
      [TaskType.LONG_FORM_WRITING]: 15,
      [TaskType.MULTI_STEP_WORKFLOW]: 40,
      [TaskType.VISION_ANALYSIS]: 35
    };

    let baseCost = baseCosts[taskType] || 10;

    // Adjust for message length
    if (features.messageLength > 1000) {
      baseCost *= 1.5;
    }

    return baseCost;
  }

  private calculateClassificationConfidence(features: TaskFeatures, taskType: TaskType): number {
    // Calculate confidence based on feature strength and rule matches
    let confidence = 0.5; // Base confidence

    // Increase confidence for clear indicators
    if (taskType === TaskType.IMAGE_GENERATION && features.hasImages) confidence += 0.3;
    if (taskType === TaskType.CODE_GENERATION && features.hasCodeBlocks) confidence += 0.3;
    if (taskType === TaskType.RESEARCH_TASK && features.requiresResearch) confidence += 0.2;

    // Adjust for message clarity
    if (features.messageLength > 100 && features.sentenceCount > 2) confidence += 0.1;
    if (features.technicalTerms.length > 0) confidence += 0.1;

    return Math.min(1.0, confidence);
  }

  private generateClassificationReasoning(features: TaskFeatures, taskType: TaskType, complexity: TaskComplexity): string {
    const reasons = [];

    // Task type reasoning
    switch (taskType) {
      case TaskType.IMAGE_GENERATION:
        if (features.hasImages) reasons.push("Contains image references");
        break;
      case TaskType.CODE_GENERATION:
        if (features.hasCodeBlocks) reasons.push("Contains code blocks");
        if (features.technicalTerms.length > 0) reasons.push("Contains technical terminology");
        break;
      case TaskType.RESEARCH_TASK:
        if (features.requiresResearch) reasons.push("Requires information gathering");
        break;
      case TaskType.LONG_FORM_WRITING:
        if (features.messageLength > 1000) reasons.push("Long-form content request");
        break;
    }

    // Complexity reasoning
    switch (complexity) {
      case TaskComplexity.HIGH:
        if (features.hasMultipleSteps) reasons.push("Multi-step process required");
        if (features.requiresAnalysis) reasons.push("Complex analysis needed");
        break;
      case TaskComplexity.MEDIUM:
        if (features.hasComplexQuestions) reasons.push("Complex questions detected");
        break;
    }

    return reasons.length > 0 ? reasons.join("; ") : "Based on message content analysis";
  }

  // Feature detection methods
  private detectComplexQuestions(message: string): boolean {
    const complexPatterns = [
      /how (can|do|would|should).+and.+/i,
      /what (are|is) the (differences?|pros and cons)/i,
      /compare.+with.+/i,
      /explain.+(in detail|thoroughly|comprehensively)/i
    ];
    return complexPatterns.some(pattern => pattern.test(message));
  }

  private detectMultipleSteps(message: string): boolean {
    const stepIndicators = [
      /step \d+/i,
      /first.+then.+/i,
      /\d+\.\s/g,
      /next.+after.+/i,
      /process.+involves/i
    ];
    return stepIndicators.some(pattern => pattern.test(message));
  }

  private detectResearchNeeds(message: string): boolean {
    const researchKeywords = [
      'research', 'find information', 'look up', 'investigate', 'study',
      'what is', 'tell me about', 'explain', 'latest', 'current'
    ];
    return researchKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private detectCreativityNeeds(message: string): boolean {
    const creativityKeywords = [
      'create', 'design', 'write', 'compose', 'generate', 'brainstorm',
      'creative', 'original', 'unique', 'innovative'
    ];
    return creativityKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private detectAnalysisNeeds(message: string): boolean {
    const analysisKeywords = [
      'analyze', 'analysis', 'evaluate', 'assess', 'compare', 'contrast',
      'pros and cons', 'advantages', 'disadvantages', 'impact'
    ];
    return analysisKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private calculateLanguageComplexity(message: string): number {
    const words = message.split(/\s+/);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = words.length / sentences.length;

    // Normalize to 0-1 scale
    const lengthScore = Math.min(1, avgWordLength / 10);
    const sentenceScore = Math.min(1, avgSentenceLength / 20);

    return (lengthScore + sentenceScore) / 2;
  }

  private extractTechnicalTerms(message: string): string[] {
    const technicalPatterns = [
      /\b[A-Z]{2,}\b/g, // Acronyms
      /\b\w+\.\w+\b/g, // Dotted notation (e.g., file.extension)
      /\b\w*[Aa]pi\w*\b/g, // API-related terms
      /\b\w*[Dd]atabase\w*\b/g, // Database terms
    ];

    const terms = new Set<string>();
    technicalPatterns.forEach(pattern => {
      const matches = message.match(pattern) || [];
      matches.forEach(match => terms.add(match));
    });

    return Array.from(terms);
  }

  private extractKeywords(message: string): string[] {
    const words = message.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);

    // Remove common stop words
    const stopWords = new Set(['this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 'were', 'said']);
    return words.filter(word => !stopWords.has(word));
  }

  // Resource estimation helpers
  private estimateInputTokens(classification: TaskClassification): number {
    const baseTokens = {
      [TaskType.QUICK_CHAT]: 100,
      [TaskType.IMAGE_GENERATION]: 50,
      [TaskType.RESEARCH_TASK]: 200,
      [TaskType.CODE_GENERATION]: 300,
      [TaskType.DATA_ANALYSIS]: 400,
      [TaskType.LONG_FORM_WRITING]: 150,
      [TaskType.MULTI_STEP_WORKFLOW]: 500,
      [TaskType.VISION_ANALYSIS]: 250
    };

    return baseTokens[classification.type] || 100;
  }

  private estimateOutputTokens(classification: TaskClassification): number {
    const baseTokens = {
      [TaskType.QUICK_CHAT]: 200,
      [TaskType.IMAGE_GENERATION]: 0, // Images don't use output tokens
      [TaskType.RESEARCH_TASK]: 800,
      [TaskType.CODE_GENERATION]: 600,
      [TaskType.DATA_ANALYSIS]: 1000,
      [TaskType.LONG_FORM_WRITING]: 1500,
      [TaskType.MULTI_STEP_WORKFLOW]: 1200,
      [TaskType.VISION_ANALYSIS]: 400
    };

    let tokens = baseTokens[classification.type] || 200;

    // Adjust for complexity
    const complexityMultipliers = {
      [TaskComplexity.LOW]: 1.0,
      [TaskComplexity.MEDIUM]: 1.5,
      [TaskComplexity.HIGH]: 2.5
    };

    return Math.round(tokens * complexityMultipliers[classification.complexity]);
  }

  private calculateMaxBudget(classification: TaskClassification): number {
    return classification.estimatedCreditCost * 2; // Allow 2x buffer
  }

  private calculateMaxLatency(classification: TaskClassification): number {
    if (classification.requiresAgentExecution) {
      return classification.estimatedDuration * 1000; // Convert to milliseconds
    }
    return 30000; // 30 seconds for synchronous tasks
  }

  private getRequiredFeatures(classification: TaskClassification): string[] {
    const features = [];

    if (classification.type === TaskType.IMAGE_GENERATION) {
      features.push('image_generation');
    }
    if (classification.type === TaskType.VISION_ANALYSIS) {
      features.push('vision');
    }
    if (classification.type === TaskType.CODE_GENERATION) {
      features.push('code_generation');
    }
    if (classification.requiresAgentExecution) {
      features.push('agent_execution');
    }

    return features;
  }

  private getQualityThreshold(classification: TaskClassification): number {
    const thresholds = {
      [TaskComplexity.LOW]: 6,
      [TaskComplexity.MEDIUM]: 7,
      [TaskComplexity.HIGH]: 8
    };

    return thresholds[classification.complexity];
  }

  private getModelCostMultiplier(model: AIModel, taskType: TaskType): number {
    // Adjust cost based on model performance for task type
    const performanceScore = model.performance.qualityScore;
    
    if (performanceScore >= 9) return 1.5;
    if (performanceScore >= 8) return 1.2;
    if (performanceScore >= 7) return 1.0;
    return 0.8;
  }

  private initializeDefaultRules(): void {
    this.classificationRules = [
      {
        id: 'image-generation-rule',
        name: 'Image Generation Detection',
        description: 'Detects requests for image generation',
        patterns: [
          { type: PatternType.KEYWORD, pattern: 'generate image', weight: 3, description: 'Direct image generation request' },
          { type: PatternType.KEYWORD, pattern: 'create picture', weight: 3, description: 'Picture creation request' },
          { type: PatternType.KEYWORD, pattern: 'draw', weight: 2, description: 'Drawing request' },
          { type: PatternType.STRUCTURE, pattern: 'has_images', weight: 2, description: 'Contains image references' }
        ],
        taskType: TaskType.IMAGE_GENERATION,
        complexity: TaskComplexity.MEDIUM,
        priority: 10,
        isActive: true
      },
      {
        id: 'code-generation-rule',
        name: 'Code Generation Detection',
        description: 'Detects requests for code generation or analysis',
        patterns: [
          { type: PatternType.STRUCTURE, pattern: 'has_code', weight: 4, description: 'Contains code blocks' },
          { type: PatternType.KEYWORD, pattern: 'write code', weight: 3, description: 'Code writing request' },
          { type: PatternType.KEYWORD, pattern: 'debug', weight: 2, description: 'Debugging request' },
          { type: PatternType.INTENT, pattern: 'analyze_code', weight: 3, description: 'Code analysis intent' }
        ],
        taskType: TaskType.CODE_GENERATION,
        complexity: TaskComplexity.MEDIUM,
        priority: 9,
        isActive: true
      },
      {
        id: 'research-task-rule',
        name: 'Research Task Detection',
        description: 'Detects requests requiring research or information gathering',
        patterns: [
          { type: PatternType.INTENT, pattern: 'research', weight: 4, description: 'Research intent detected' },
          { type: PatternType.KEYWORD, pattern: 'find information', weight: 3, description: 'Information seeking' },
          { type: PatternType.KEYWORD, pattern: 'latest', weight: 2, description: 'Current information request' },
          { type: PatternType.KEYWORD, pattern: 'investigate', weight: 2, description: 'Investigation request' }
        ],
        taskType: TaskType.RESEARCH_TASK,
        complexity: TaskComplexity.HIGH,
        priority: 8,
        isActive: true
      },
      {
        id: 'long-form-writing-rule',
        name: 'Long Form Writing Detection',
        description: 'Detects requests for long-form content creation',
        patterns: [
          { type: PatternType.LENGTH, pattern: '1000', weight: 3, description: 'Long message length' },
          { type: PatternType.KEYWORD, pattern: 'write article', weight: 4, description: 'Article writing request' },
          { type: PatternType.KEYWORD, pattern: 'compose', weight: 2, description: 'Composition request' },
          { type: PatternType.KEYWORD, pattern: 'essay', weight: 3, description: 'Essay writing request' }
        ],
        taskType: TaskType.LONG_FORM_WRITING,
        complexity: TaskComplexity.MEDIUM,
        priority: 7,
        isActive: true
      },
      {
        id: 'multi-step-workflow-rule',
        name: 'Multi-Step Workflow Detection',
        description: 'Detects complex multi-step processes',
        patterns: [
          { type: PatternType.STRUCTURE, pattern: 'multiple_steps', weight: 4, description: 'Multiple steps detected' },
          { type: PatternType.KEYWORD, pattern: 'workflow', weight: 3, description: 'Workflow request' },
          { type: PatternType.KEYWORD, pattern: 'process', weight: 2, description: 'Process request' },
          { type: PatternType.STRUCTURE, pattern: 'complex_questions', weight: 2, description: 'Complex questions' }
        ],
        taskType: TaskType.MULTI_STEP_WORKFLOW,
        complexity: TaskComplexity.HIGH,
        priority: 6,
        isActive: true
      }
    ];
  }
}