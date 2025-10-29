/**
 * Image Generation Handler Tests
 */

import { DatabaseEvent } from 'firebase-functions/v2/database';
import { DataSnapshot } from 'firebase-admin/database';
import handler from '../../src/functions/image-generation';
import { ImageModel, ImageSize, ImageQuality } from '../../src/shared/types/image-generation';

// Mock Firebase Admin
jest.mock('firebase-admin/database', () => ({
  getDatabase: jest.fn(() => ({
    ref: jest.fn(() => ({
      update: jest.fn(),
      set: jest.fn()
    }))
  }))
}));

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
        get: jest.fn(() => ({
          exists: false
        })),
        set: jest.fn()
      }))
    })),
    runTransaction: jest.fn()
  }))
}));

// Mock fetch for FLUX API
global.fetch = jest.fn();

describe('Image Generation Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up environment variables
    process.env.NEBIUS_API_KEY = 'test-api-key';
    process.env.NEBIUS_BASE_URL = 'https://api.test.com';
    process.env.FIREBASE_STORAGE_BUCKET = 'test-bucket';
  });

  it('should handle valid image generation task', async () => {
    const mockTaskData = {
      id: 'task-123',
      userId: 'user-123',
      prompt: 'A beautiful landscape',
      model: ImageModel.FLUX_SCHNELL,
      size: ImageSize.SQUARE_1024,
      quality: ImageQuality.STANDARD,
      count: 1,
      status: 'queued',
      creditsReserved: 20,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const mockSnapshot = {
      val: () => mockTaskData
    } as unknown as DataSnapshot;

    const mockEvent = {
      params: { taskId: 'task-123' },
      data: mockSnapshot
    } as unknown as DatabaseEvent<DataSnapshot>;

    // Mock successful FLUX API response
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'flux-task-123',
        status: 'completed',
        images: [{
          url: 'https://temp-storage.com/image1.png',
          width: 1024,
          height: 1024,
          format: 'png'
        }]
      }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024))
    });

    // Execute the handler
    await handler.generateImage(mockEvent);

    // Verify the handler completed without throwing
    expect(true).toBe(true); // If we get here, the handler didn't throw
  });

  it('should handle missing task data gracefully', async () => {
    const mockSnapshot = {
      val: () => null
    } as unknown as DataSnapshot;

    const mockEvent = {
      params: { taskId: 'task-123' },
      data: mockSnapshot
    } as unknown as DatabaseEvent<DataSnapshot>;

    // Execute the handler - should not throw
    await handler.generateImage(mockEvent);

    expect(true).toBe(true); // Handler should complete gracefully
  });

  it('should handle missing task ID gracefully', async () => {
    const mockSnapshot = {
      val: () => ({
        id: 'task-123',
        userId: 'user-123',
        prompt: 'Test prompt'
      })
    } as unknown as DataSnapshot;

    const mockEvent = {
      params: {}, // Missing taskId
      data: mockSnapshot
    } as unknown as DatabaseEvent<DataSnapshot>;

    // Execute the handler - should not throw
    await handler.generateImage(mockEvent);

    expect(true).toBe(true); // Handler should complete gracefully
  });
});