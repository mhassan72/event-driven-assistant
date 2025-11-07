# Firebase Cloud Functions Gen 2 Architecture

## Overview

The AI Chat Interface Platform uses Firebase Cloud Functions Gen 2 as its serverless backend infrastructure. This document explains the architecture, function types, lifecycle, deployment patterns, and best practices for working with Firebase Functions in this application.

## Firebase Functions Gen 2 Features

### Key Improvements Over Gen 1

Firebase Functions Gen 2 provides significant improvements:

- **Better Performance**: Faster cold starts and improved execution times
- **Longer Timeouts**: Up to 60 minutes for HTTP functions (vs 9 minutes in Gen 1)
- **Higher Concurrency**: Up to 1000 concurrent executions per function instance
- **Better Scaling**: More granular control over scaling behavior
- **Improved Monitoring**: Better integration with Cloud Logging and Cloud Monitoring
- **Event Arc Integration**: Unified event handling across Google Cloud services

### Global Configuration

All functions share a global configuration defined in `src/index.ts`:

```typescript
import { setGlobalOptions } from 'firebase-functions/v2';

setGlobalOptions({
  region: 'europe-west1',      // Primary deployment region
  maxInstances: 100,            // Maximum concurrent instances
  memory: '1GiB',               // Default memory allocation
  timeoutSeconds: 540,          // Default timeout (9 minutes)
  concurrency: 80               // Requests per instance
});
```

**Configuration Rationale**:
- **Region**: `europe-west1` chosen for GDPR compliance and European user base
- **Memory**: `1GiB` default provides good balance for most operations
- **Concurrency**: `80` allows efficient resource utilization while maintaining stability
- **Timeout**: `540s` (9 minutes) supports long-running AI operations

## Function Types

### 1. HTTP Functions (Express API)

HTTP functions handle synchronous client requests through a RESTful API.

#### Main API Function

```typescript
import { onRequest } from 'firebase-functions/v2/https';
import { app } from './app';

export const api = onRequest({
  cors: true,                   // Enable CORS for web clients
  memory: '1GiB',               // Memory allocation
  timeoutSeconds: 300,          // 5-minute timeout
  maxInstances: 50,             // Scale up to 50 instances
  concurrency: 100              // 100 requests per instance
}, app);
```

**Characteristics**:
- Synchronous request-response pattern
- Express.js middleware stack
- Authentication and validation
- Rate limiting and security
- Versioned API endpoints

**Use Cases**:
- User authentication and authorization
- Chat message submission
- Credit balance queries
- Document uploads
- Image generation requests
- Payment initiation

**Example Request Flow**:
```
Client → HTTPS → Firebase Functions → Express Router → Middleware Chain → Handler → Response
```

### 2. Firestore Triggered Functions

Firestore triggers respond to document lifecycle events in the database.

#### Document Creation Triggers

```typescript
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

export const onUserCreated = onDocumentCreated({
  document: 'users/{userId}',   // Document path pattern
  memory: '512MiB',              // Lower memory for simple operations
  timeoutSeconds: 60             // 1-minute timeout
}, async (event) => {
  const userId = event.params.userId;
  const userData = event.data?.data();
  
  // Process user creation
  await initializeUserAccount(userId, userData);
});
```

**Available Triggers**:
- `onDocumentCreated`: New document created
- `onDocumentUpdated`: Document modified
- `onDocumentDeleted`: Document removed
- `onDocumentWritten`: Any write operation (create, update, delete)

**Use Cases**:
- User account initialization
- Credit transaction processing
- Payment status updates
- Audit log creation
- Data validation and enrichment

**Event Data Structure**:
```typescript
interface FirestoreEvent {
  params: { [key: string]: string };  // Path parameters
  data: QueryDocumentSnapshot;         // Document snapshot
  authType: string;                    // Authentication type
  authId: string;                      // User/service account ID
}
```

### 3. Realtime Database Triggered Functions

Realtime Database triggers respond to data changes in the Firebase Realtime Database.

#### Value Creation Triggers

```typescript
import { onValueCreated } from 'firebase-functions/v2/database';

export const onWorkflowCreated = onValueCreated({
  ref: 'credit_orchestration/workflows/{workflowId}',
  memory: '512MiB',
  timeoutSeconds: 300
}, async (event) => {
  const workflowId = event.params.workflowId;
  const workflowData = event.data.val();
  
  // Process workflow
  await executeWorkflow(workflowId, workflowData);
});
```

**Available Triggers**:
- `onValueCreated`: New data written
- `onValueUpdated`: Data modified
- `onValueDeleted`: Data removed
- `onValueWritten`: Any write operation

**Use Cases**:
- Workflow orchestration
- Operation queue management
- Real-time synchronization
- Event-driven processing
- Distributed task coordination

**Why Realtime Database for Orchestration?**:
- Lower latency than Firestore
- Better for high-frequency updates
- Atomic operations support
- Efficient for queue-like patterns
- Real-time client synchronization

### 4. Scheduled Functions

Scheduled functions run on a time-based schedule using Cloud Scheduler.

```typescript
import { onSchedule } from 'firebase-functions/v2/scheduler';

export const dailyCleanup = onSchedule({
  schedule: 'every day 02:00',  // Cron expression
  timeZone: 'Europe/London',    // Timezone
  memory: '512MiB'
}, async (event) => {
  await cleanupExpiredSessions();
  await archiveOldTransactions();
  await generateDailyReports();
});
```

**Use Cases**:
- Data cleanup and archival
- Report generation
- Cache invalidation
- Subscription renewals
- Health checks

### 5. Webhook Functions

Webhook functions handle external service callbacks.

```typescript
export const stripeWebhook = onRequest({
  cors: false,                  // Disable CORS for webhooks
  memory: '512MiB',
  timeoutSeconds: 60,
  secrets: ['STRIPE_WEBHOOK_SECRET']
}, async (req, res) => {
  const signature = req.headers['stripe-signature'];
  
  // Verify webhook signature
  const event = verifyStripeWebhook(req.body, signature);
  
  // Process webhook event
  await processStripeEvent(event);
  
  res.status(200).json({ received: true });
});
```

**Characteristics**:
- External service integration
- Signature verification
- Idempotency handling
- Retry logic
- Error recovery

## Function Lifecycle

### Cold Start vs Warm Start

#### Cold Start
When a function instance is created for the first time:

```
1. Container Creation (1-2s)
   ↓
2. Runtime Initialization (0.5-1s)
   ↓
3. Function Code Loading (0.5-1s)
   ↓
4. Global Scope Execution (0.5-2s)
   ↓
5. Function Execution
```

**Total Cold Start**: 2.5-6 seconds

**Optimization Strategies**:
- Minimize global scope code
- Use lazy loading for heavy dependencies
- Keep function code size small
- Reuse connections and clients

#### Warm Start
When an existing instance handles a new request:

```
1. Function Execution (immediate)
```

**Total Warm Start**: <100ms

### Instance Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                     Instance Lifecycle                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. COLD START                                               │
│     - Container provisioned                                  │
│     - Runtime initialized                                    │
│     - Global scope executed                                  │
│                                                               │
│  2. ACTIVE (Warm)                                            │
│     - Handles incoming requests                              │
│     - Maintains connections                                  │
│     - Reuses initialized resources                           │
│     - Duration: Until idle timeout (15 minutes)              │
│                                                               │
│  3. IDLE                                                      │
│     - No active requests                                     │
│     - Connections may be maintained                          │
│     - May be reused for new requests                         │
│     - Duration: Up to 15 minutes                             │
│                                                               │
│  4. SHUTDOWN                                                  │
│     - Instance terminated                                    │
│     - Resources cleaned up                                   │
│     - Next request triggers cold start                       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Request Handling Flow

```typescript
// Global scope - executed once per instance
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp();
const db = getFirestore(app);

// Function scope - executed per request
export const processRequest = onRequest(async (req, res) => {
  // Request-specific logic
  const data = await db.collection('users').doc(req.body.userId).get();
  res.json({ data: data.data() });
});
```

**Best Practices**:
- Initialize expensive resources in global scope
- Reuse database connections
- Cache configuration and secrets
- Clean up request-specific resources

## Deployment Patterns

### Development Workflow

```bash
# 1. Local development with emulators
npm run serve

# 2. Build TypeScript
npm run build

# 3. Deploy to development environment
npm run deploy:dev

# 4. Run smoke tests
npm run test:deployment:smoke

# 5. Deploy to staging
npm run deploy:staging

# 6. Run full integration tests
npm run test:integration:e2e

# 7. Deploy to production
npm run deploy:prod
```

### Deployment Configuration

#### Environment-Specific Deployment

```bash
# Development
firebase use development
firebase deploy --only functions

# Staging
firebase use staging
firebase deploy --only functions

# Production
firebase use production
firebase deploy --only functions
```

#### Selective Deployment

```bash
# Deploy specific function
firebase deploy --only functions:api

# Deploy multiple functions
firebase deploy --only functions:api,functions:onUserCreated

# Deploy function group
firebase deploy --only functions:payment*
```

### Blue-Green Deployment

Firebase Functions supports traffic splitting for gradual rollouts:

```typescript
export const api = onRequest({
  // ... other options
  labels: {
    version: 'v2.1.0',
    deployment: 'blue'
  }
}, app);
```

**Deployment Strategy**:
1. Deploy new version with different label
2. Route small percentage of traffic to new version
3. Monitor metrics and errors
4. Gradually increase traffic
5. Rollback if issues detected

### Rollback Strategy

```bash
# List function versions
firebase functions:list

# Rollback to previous version
firebase functions:rollback api --version 12345

# Verify rollback
firebase functions:log api --limit 100
```

## Function Configuration Patterns

### Memory and Timeout Optimization

Different function types require different resources:

```typescript
// Lightweight operations (user queries)
export const getUserProfile = onRequest({
  memory: '256MiB',
  timeoutSeconds: 30
}, handler);

// Standard operations (chat messages)
export const sendMessage = onRequest({
  memory: '512MiB',
  timeoutSeconds: 60
}, handler);

// Heavy operations (document processing)
export const processDocument = onRequest({
  memory: '1GiB',
  timeoutSeconds: 300
}, handler);

// AI operations (long-running tasks)
export const executeAgentTask = onValueCreated({
  memory: '2GiB',
  timeoutSeconds: 540,
  maxInstances: 20
}, handler);
```

### Concurrency Configuration

```typescript
// High-traffic endpoints
export const api = onRequest({
  concurrency: 100,      // Handle 100 requests per instance
  maxInstances: 50       // Scale to 50 instances
}, app);

// Resource-intensive operations
export const processPayment = onDocumentCreated({
  concurrency: 1,        // One request per instance
  maxInstances: 10       // Limit concurrent processing
}, handler);
```

### Secret Management

```typescript
export const stripeWebhook = onRequest({
  secrets: [
    'STRIPE_API_KEY',
    'STRIPE_WEBHOOK_SECRET'
  ]
}, async (req, res) => {
  const apiKey = process.env.STRIPE_API_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  // Use secrets securely
});
```

**Secret Management Best Practices**:
- Store secrets in Google Secret Manager
- Reference secrets in function configuration
- Never commit secrets to version control
- Rotate secrets regularly
- Use different secrets per environment

## Error Handling and Resilience

### Automatic Retries

Firebase Functions automatically retries failed event-driven functions:

```typescript
export const onPaymentCreated = onDocumentCreated({
  retry: true,           // Enable automatic retries
  maxRetries: 3          // Maximum retry attempts
}, async (event) => {
  try {
    await processPayment(event.data);
  } catch (error) {
    // Log error for monitoring
    logger.error('Payment processing failed', { error });
    
    // Throw to trigger retry
    throw error;
  }
});
```

**Retry Behavior**:
- Exponential backoff between retries
- Maximum retry period: 7 days
- Retries stop after success or max attempts

### Idempotency

Ensure functions can be safely retried:

```typescript
export const onTransactionCreated = onDocumentCreated(async (event) => {
  const transactionId = event.params.transactionId;
  
  // Check if already processed (idempotency)
  const processed = await checkIfProcessed(transactionId);
  if (processed) {
    logger.info('Transaction already processed', { transactionId });
    return;
  }
  
  // Process transaction
  await processTransaction(transactionId);
  
  // Mark as processed
  await markAsProcessed(transactionId);
});
```

### Circuit Breaker Pattern

Protect against cascading failures:

```typescript
import { CircuitBreaker } from '../shared/resilience/circuit-breaker';

const externalServiceBreaker = new CircuitBreaker({
  timeout: 5000,
  errorThreshold: 50,
  resetTimeout: 30000
});

export const callExternalService = onRequest(async (req, res) => {
  try {
    const result = await externalServiceBreaker.execute(
      () => externalService.call(req.body)
    );
    res.json(result);
  } catch (error) {
    if (error.name === 'CircuitBreakerOpen') {
      res.status(503).json({ error: 'Service temporarily unavailable' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});
```

## Monitoring and Observability

### Structured Logging

```typescript
import { logger } from '../shared/observability/logger';

export const processRequest = onRequest(async (req, res) => {
  const correlationId = req.headers['x-correlation-id'] || generateId();
  
  logger.info('Request received', {
    correlationId,
    method: req.method,
    path: req.path,
    userId: req.user?.uid
  });
  
  try {
    const result = await processData(req.body);
    
    logger.info('Request completed', {
      correlationId,
      duration: Date.now() - startTime
    });
    
    res.json(result);
  } catch (error) {
    logger.error('Request failed', {
      correlationId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### Metrics Collection

```typescript
import { metrics } from '../shared/observability/metrics';

export const processPayment = onDocumentCreated(async (event) => {
  const timer = metrics.startTimer('payment_processing_duration');
  
  try {
    await processPaymentData(event.data);
    
    metrics.incrementCounter('payment_processed_success');
    timer.end();
  } catch (error) {
    metrics.incrementCounter('payment_processed_failure', {
      errorType: error.constructor.name
    });
    timer.end();
    throw error;
  }
});
```

### Health Checks

```typescript
export const healthCheck = onRequest(async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkDatabaseConnection(),
      cache: await checkCacheConnection(),
      externalServices: await checkExternalServices()
    }
  };
  
  const isHealthy = Object.values(health.checks).every(check => check === 'healthy');
  
  res.status(isHealthy ? 200 : 503).json(health);
});
```

## Performance Optimization

### Connection Pooling

```typescript
// Global scope - reused across invocations
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp();
const db = getFirestore(app);

// Configure connection pooling
db.settings({
  ignoreUndefinedProperties: true,
  maxIdleChannels: 10
});

export const queryData = onRequest(async (req, res) => {
  // Reuse existing connection
  const data = await db.collection('users').get();
  res.json(data.docs.map(doc => doc.data()));
});
```

### Lazy Loading

```typescript
export const processImage = onRequest(async (req, res) => {
  // Lazy load heavy dependencies
  const { processImageWithAI } = await import('../services/image-processing');
  
  const result = await processImageWithAI(req.body.imageUrl);
  res.json(result);
});
```

### Caching Strategies

```typescript
import { CacheService } from '../shared/services/cache';

const cache = new CacheService();

export const getUserData = onRequest(async (req, res) => {
  const userId = req.params.userId;
  const cacheKey = `user:${userId}`;
  
  // Try cache first
  let userData = await cache.get(cacheKey);
  
  if (!userData) {
    // Cache miss - fetch from database
    userData = await db.collection('users').doc(userId).get();
    
    // Cache for 5 minutes
    await cache.set(cacheKey, userData, 300);
  }
  
  res.json(userData);
});
```

## Security Best Practices

### Authentication Verification

```typescript
import { authMiddleware } from '../api/middleware/auth';

export const api = onRequest(async (req, res) => {
  // Verify Firebase Auth token
  await authMiddleware(req, res, async () => {
    // req.user is now populated
    const userId = req.user.uid;
    
    // Process authenticated request
    const data = await getUserData(userId);
    res.json(data);
  });
});
```

### Input Validation

```typescript
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(13)
});

export const createUser = onRequest(async (req, res) => {
  try {
    // Validate input
    const validatedData = CreateUserSchema.parse(req.body);
    
    // Process validated data
    const user = await createUserAccount(validatedData);
    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});
```

### Rate Limiting

```typescript
import { rateLimitMiddleware } from '../api/middleware/rate-limiting';

export const api = onRequest(async (req, res) => {
  await rateLimitMiddleware(req, res, async () => {
    // Process rate-limited request
    const result = await processRequest(req.body);
    res.json(result);
  });
});
```

## Testing Strategies

### Unit Testing

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { onUserCreated } from '../user-lifecycle';

describe('User Lifecycle Functions', () => {
  beforeEach(() => {
    // Setup test environment
  });
  
  it('should initialize user account on creation', async () => {
    const event = createMockFirestoreEvent({
      params: { userId: 'test-user-123' },
      data: { email: 'test@example.com', name: 'Test User' }
    });
    
    await onUserCreated.handler(event);
    
    // Verify user initialization
    const user = await getUser('test-user-123');
    expect(user.creditBalance).toBe(1000);
  });
});
```

### Integration Testing

```typescript
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

describe('Function Integration Tests', () => {
  let testEnv;
  
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'test-project',
      firestore: { host: 'localhost', port: 8080 }
    });
  });
  
  it('should process payment end-to-end', async () => {
    // Create payment document
    await testEnv.firestore()
      .collection('payments')
      .add({ userId: 'test-user', amount: 100 });
    
    // Wait for function execution
    await waitForFunctionExecution();
    
    // Verify credit allocation
    const user = await getUser('test-user');
    expect(user.creditBalance).toBe(1000);
  });
});
```

## Common Patterns and Examples

### Pattern 1: Event-Driven Processing

```typescript
// Firestore trigger processes document
export const onDocumentCreated = onDocumentCreated({
  document: 'orders/{orderId}'
}, async (event) => {
  const order = event.data.data();
  
  // Write to Realtime Database for orchestration
  await admin.database()
    .ref(`order_processing/${event.params.orderId}`)
    .set({
      orderId: event.params.orderId,
      status: 'pending',
      createdAt: Date.now()
    });
});

// Realtime Database trigger orchestrates workflow
export const onOrderQueued = onValueCreated({
  ref: 'order_processing/{orderId}'
}, async (event) => {
  const orderData = event.data.val();
  
  // Execute workflow
  await processOrder(orderData);
});
```

### Pattern 2: Saga Pattern for Distributed Transactions

```typescript
export const onPaymentSagaCreated = onDocumentCreated({
  document: 'payment_sagas/{sagaId}'
}, async (event) => {
  const saga = event.data.data();
  
  try {
    // Step 1: Reserve credits
    await reserveCredits(saga.userId, saga.creditAmount);
    
    // Step 2: Process payment
    await processPayment(saga.paymentData);
    
    // Step 3: Allocate credits
    await allocateCredits(saga.userId, saga.creditAmount);
    
    // Mark saga as completed
    await event.data.ref.update({ status: 'completed' });
    
  } catch (error) {
    // Compensation: Rollback changes
    await compensateSaga(saga);
    await event.data.ref.update({ status: 'failed', error: error.message });
  }
});
```

### Pattern 3: Fan-Out/Fan-In

```typescript
// Fan-out: Trigger multiple operations
export const onBatchJobCreated = onDocumentCreated({
  document: 'batch_jobs/{jobId}'
}, async (event) => {
  const job = event.data.data();
  
  // Create individual tasks
  const tasks = job.items.map(item => ({
    jobId: event.params.jobId,
    itemId: item.id,
    status: 'pending'
  }));
  
  // Write tasks to Realtime Database
  const updates = {};
  tasks.forEach(task => {
    updates[`batch_tasks/${event.params.jobId}/${task.itemId}`] = task;
  });
  
  await admin.database().ref().update(updates);
});

// Fan-in: Aggregate results
export const onTaskCompleted = onValueUpdated({
  ref: 'batch_tasks/{jobId}/{taskId}'
}, async (event) => {
  const task = event.data.after.val();
  
  if (task.status === 'completed') {
    // Check if all tasks completed
    const allTasks = await admin.database()
      .ref(`batch_tasks/${event.params.jobId}`)
      .once('value');
    
    const tasks = allTasks.val();
    const allCompleted = Object.values(tasks).every(t => t.status === 'completed');
    
    if (allCompleted) {
      // Update batch job status
      await admin.firestore()
        .collection('batch_jobs')
        .doc(event.params.jobId)
        .update({ status: 'completed' });
    }
  }
});
```

## Troubleshooting

### Common Issues

#### Issue 1: Cold Start Latency

**Symptoms**: First request takes 5-10 seconds

**Solutions**:
- Minimize global scope code
- Use lazy loading for heavy dependencies
- Increase minimum instances for critical functions
- Implement warming strategies

#### Issue 2: Timeout Errors

**Symptoms**: Functions timing out before completion

**Solutions**:
- Increase timeout configuration
- Optimize database queries
- Implement pagination for large datasets
- Use background functions for long operations

#### Issue 3: Memory Exhaustion

**Symptoms**: Functions crashing with out-of-memory errors

**Solutions**:
- Increase memory allocation
- Implement streaming for large files
- Use pagination for bulk operations
- Clean up resources properly

#### Issue 4: Concurrent Execution Limits

**Symptoms**: Functions queuing or rejecting requests

**Solutions**:
- Increase maxInstances
- Optimize function execution time
- Implement request queuing
- Use load balancing strategies

## Best Practices Summary

1. **Resource Management**
   - Initialize expensive resources in global scope
   - Reuse connections and clients
   - Clean up request-specific resources
   - Monitor memory usage

2. **Error Handling**
   - Implement comprehensive error handling
   - Use structured logging
   - Enable automatic retries for event functions
   - Implement circuit breakers for external services

3. **Security**
   - Verify authentication tokens
   - Validate all inputs
   - Use secrets management
   - Implement rate limiting

4. **Performance**
   - Optimize cold start time
   - Use caching strategies
   - Implement connection pooling
   - Monitor and optimize execution time

5. **Monitoring**
   - Use structured logging
   - Collect metrics
   - Implement health checks
   - Set up alerts for failures

6. **Testing**
   - Write unit tests for business logic
   - Implement integration tests
   - Use Firebase emulators for local testing
   - Test error scenarios

## Conclusion

Firebase Cloud Functions Gen 2 provides a powerful, scalable serverless platform for the AI Chat Interface Platform. By following the patterns and best practices outlined in this document, you can build reliable, performant, and maintainable cloud functions that serve users effectively across the globe.

For more information:
- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
- [Cloud Functions for Firebase (Gen 2)](https://firebase.google.com/docs/functions/2nd-gen)
- [Best Practices](https://firebase.google.com/docs/functions/best-practices)
