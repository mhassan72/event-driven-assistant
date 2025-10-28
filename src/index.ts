/**
 * Firebase Functions Gen 2 Entry Point
 * Integrated Credit System with AI Assistant
 */

import 'reflect-metadata';
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onValueCreated } from 'firebase-functions/v2/database';
import { setGlobalOptions } from 'firebase-functions/v2';
import { app } from './app';

// Global configuration for Firebase Functions Gen 2
setGlobalOptions({
  region: 'europe-west1',
  maxInstances: 100,
  memory: '1GiB',
  timeoutSeconds: 540,
  concurrency: 80
});

// Main Express API - handles all HTTP requests
export const api = onRequest({
  cors: true,
  memory: '1GiB',
  timeoutSeconds: 300,
  maxInstances: 50,
  concurrency: 100
}, app);

// Event-triggered functions for secure operations
export const onUserCreated = onDocumentCreated({
  document: 'users/{userId}',
  memory: '512MiB',
  timeoutSeconds: 60
}, async (event) => {
  const { default: handler } = await import('./functions/user-lifecycle');
  return handler.onUserCreated(event);
});

export const onCreditTransactionCreated = onDocumentCreated({
  document: 'credit_transactions/{transactionId}',
  memory: '512MiB',
  timeoutSeconds: 60
}, async (event) => {
  const { default: handler } = await import('./functions/credit-events');
  return handler.onTransactionCreated(event);
});

export const onPaymentCompleted = onDocumentCreated({
  document: 'payments/{paymentId}',
  memory: '512MiB',
  timeoutSeconds: 120
}, async (event) => {
  const { default: handler } = await import('./functions/payment-events');
  return handler.onPaymentCompleted(event);
});

// Realtime Database orchestration triggers
export const onWorkflowCreated = onValueCreated({
  ref: 'credit_orchestration/workflows/{workflowId}',
  memory: '512MiB',
  timeoutSeconds: 300
}, async (event) => {
  const { default: handler } = await import('./functions/orchestration-events');
  return handler.onWorkflowCreated(event);
});

export const onOperationQueued = onValueCreated({
  ref: 'credit_orchestration/operation_queues/{userId}/{operationId}',
  memory: '512MiB',
  timeoutSeconds: 180
}, async (event) => {
  const { default: handler } = await import('./functions/orchestration-events');
  return handler.onOperationQueued(event);
});

// AI Assistant agent functions for long-running tasks
export const executeAgentTask = onValueCreated({
  ref: 'ai_orchestration/agent_tasks/{taskId}',
  memory: '2GiB',
  timeoutSeconds: 540,
  maxInstances: 20
}, async (event) => {
  const { default: handler } = await import('./functions/agent-execution');
  return handler.executeAgentTask(event);
});

export const generateImage = onValueCreated({
  ref: 'ai_orchestration/image_generation/{taskId}',
  memory: '1GiB',
  timeoutSeconds: 300,
  maxInstances: 10
}, async (event) => {
  const { default: handler } = await import('./functions/image-generation');
  return handler.generateImage(event);
});