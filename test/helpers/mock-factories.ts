/**
 * Mock Factories for Tests
 * Helper functions to create properly structured mock objects
 */

import {
  CreditTransaction,
  TransactionType,
  TransactionStatus,
  CreditSource
} from '../../src/shared/types/credit-system';
import {
  ImageGenerationResult,
  GenerationStatus,
  ImageModel,
  ImageSize,
  ImageQuality,
  ImageFormat,
  StorageProvider
} from '../../src/shared/types/image-generation';

/**
 * Create a mock CreditTransaction with all required fields
 */
export function createMockCreditTransaction(
  overrides: Partial<CreditTransaction> = {}
): CreditTransaction {
  const timestamp = new Date();
  const id = overrides.id || `txn-${Date.now()}`;
  
  return {
    id,
    userId: 'test-user-123',
    type: TransactionType.DEDUCT,
    amount: 10,
    balanceBefore: 100,
    balanceAfter: 90,
    source: CreditSource.AI_CHAT,
    reason: 'Test transaction',
    metadata: {
      requestId: 'test-request-123',
      feature: 'test',
      details: {}
    },
    timestamp,
    status: TransactionStatus.COMPLETED,
    eventId: `event-${id}`,
    version: 1,
    transactionHash: `hash-${id}`,
    previousTransactionHash: 'prev-hash',
    signature: `sig-${id}`,
    blockIndex: 1,
    correlationId: `corr-${id}`,
    idempotencyKey: `idem-${id}`,
    processingDuration: 100,
    retryCount: 0,
    ...overrides
  };
}

/**
 * Create a mock ImageGenerationResult with all required fields
 */
export function createMockImageGenerationResult(
  overrides: Partial<ImageGenerationResult> = {}
): ImageGenerationResult {
  const timestamp = new Date();
  const taskId = overrides.taskId || `task-${Date.now()}`;
  
  return {
    taskId,
    userId: 'test-user-123',
    requestId: `req-${taskId}`,
    images: [],
    status: GenerationStatus.COMPLETED,
    creditsUsed: 5,
    generationTime: 2000,
    metadata: {
      requestId: `req-${taskId}`,
      feature: 'image-generation',
      details: {}
    },
    createdAt: timestamp,
    completedAt: timestamp,
    ...overrides
  };
}

/**
 * Create a mock execution result
 */
export interface MockExecutionResult {
  id: string;
  userId: string;
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: any;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
}

export function createMockExecutionResult(
  overrides: Partial<MockExecutionResult> = {}
): MockExecutionResult {
  const timestamp = new Date();
  const id = overrides.id || `exec-${Date.now()}`;
  
  return {
    id,
    userId: 'test-user-123',
    taskId: 'test-task-123',
    status: 'completed',
    startedAt: timestamp,
    completedAt: timestamp,
    duration: 1000,
    ...overrides
  };
}
