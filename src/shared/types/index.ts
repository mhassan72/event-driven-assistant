/**
 * Shared Types Index
 * Central export point for all shared type definitions
 */

// Common Utility Types (base types used everywhere)
export * from './common';

// Firebase Types (includes Firebase Auth)
export * from './firebase';

// Express Types (HTTP request/response extensions)
export * from './express';

// Orchestration Types (workflow and event management)
export * from './orchestration';

// Model Configuration Types (AI model management)
export * from './model-configuration';

// Image Generation Types (image processing)
export * from './image-generation';

// Legacy re-exports for backward compatibility
// These maintain existing imports while types are organized in features

// AI Assistant Types (legacy re-export)
export * from './ai-assistant';

// Credit System Types (legacy re-export)
export * from './credit-system';

// Notification System Types (legacy re-export)
export * from './notification-types';

// Payment System Types (legacy re-export)
export * from './payment-system';

// Firestore Callback Types
export * from './firestore-callbacks';