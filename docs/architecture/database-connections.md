# Database Connections and Data Persistence

## Overview

The AI Chat Interface Platform uses a multi-database architecture combining Firebase Firestore and Firebase Realtime Database to provide robust data persistence, real-time synchronization, and optimal performance. This document explains database connections, data persistence patterns, transactions, consistency guarantees, caching strategies, and offline synchronization.

## Database Architecture

### Multi-Database Strategy

The platform uses two complementary Firebase databases:

```
┌─────────────────────────────────────────────────────────────┐
│                   Application Layer                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────┐    ┌──────────────────────┐      │
│  │   Firestore          │    │  Realtime Database   │      │
│  │  (Primary Storage)   │    │  (Orchestration)     │      │
│  ├──────────────────────┤    ├──────────────────────┤      │
│  │ • User Data          │    │ • Workflows          │      │
│  │ • Conversations      │    │ • Operation Queues   │      │
│  │ • Transactions       │    │ • Real-time Balances │      │
│  │ • Payments           │    │ • Task Status        │      │
│  │ • Documents          │    │ • Live Sync Data     │      │
│  └──────────────────────┘    └──────────────────────┘      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Firestore**: Document-oriented database for structured data
**Realtime Database**: JSON tree database for real-time operations

### Database Selection Criteria

| Use Case | Database | Reason |
|----------|----------|--------|
| User profiles | Firestore | Complex queries, structured data |
| Credit transactions | Firestore | ACID transactions, audit trail |
| Payment records | Firestore | Strong consistency, complex queries |
| Conversation history | Firestore | Document structure, pagination |
| Workflow orchestration | Realtime DB | Low latency, atomic operations |
| Real-time balances | Realtime DB | Instant updates, client sync |
| Operation queues | Realtime DB | High-frequency updates |
| Task status | Realtime DB | Real-time progress tracking |

## Firebase Admin SDK Initialization

### Connection Setup

```typescript
// src/app.ts
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';

// Initialize Firebase Admin SDK
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n')
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL!,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET!
  });
}

// Export database instances
export const auth = getAuth();
export const firestore = getFirestore();
export const realtimeDb = getDatabase();
```

### Connection Configuration

```typescript
// Configure Firestore settings
firestore.settings({
  ignoreUndefinedProperties: true,
  maxIdleChannels: 10,
  timestampsInSnapshots: true
});

// Configure Realtime Database settings
realtimeDb.goOnline(); // Ensure connection is active
```

### Environment Variables

```bash
# .env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
```

## Firestore Data Persistence

### Document Structure

Firestore organizes data in collections and documents:

```
firestore/
├── users/
│   └── {userId}/
│       ├── email: string
│       ├── name: string
│       ├── creditBalance: number
│       ├── createdAt: timestamp
│       └── preferences: object
├── conversations/
│   └── {conversationId}/
│       ├── userId: string
│       ├── title: string
│       ├── messages: array
│       ├── createdAt: timestamp
│       └── lastMessageAt: timestamp
├── credit_transactions/
│   └── {transactionId}/
│       ├── userId: string
│       ├── amount: number
│       ├── type: string
│       ├── timestamp: timestamp
│       └── metadata: object
└── payments/
    └── {paymentId}/
        ├── userId: string
        ├── amount: number
        ├── status: string
        ├── provider: string
        └── createdAt: timestamp
```

### CRUD Operations

#### Create Document

```typescript
// Create new user
const userId = 'user123';
await firestore.collection('users').doc(userId).set({
  email: 'user@example.com',
  name: 'John Doe',
  creditBalance: 1000,
  createdAt: FieldValue.serverTimestamp(),
  preferences: {
    language: 'en',
    theme: 'dark'
  }
});

// Create with auto-generated ID
const docRef = await firestore.collection('conversations').add({
  userId: 'user123',
  title: 'New Conversation',
  messages: [],
  createdAt: FieldValue.serverTimestamp()
});

console.log('Created conversation:', docRef.id);
```

#### Read Document

```typescript
// Get single document
const userDoc = await firestore.collection('users').doc('user123').get();

if (userDoc.exists) {
  const userData = userDoc.data();
  console.log('User:', userData);
} else {
  console.log('User not found');
}

// Query multiple documents
const conversationsSnapshot = await firestore
  .collection('conversations')
  .where('userId', '==', 'user123')
  .orderBy('lastMessageAt', 'desc')
  .limit(10)
  .get();

const conversations = conversationsSnapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
}));
```

#### Update Document

```typescript
// Update specific fields
await firestore.collection('users').doc('user123').update({
  creditBalance: FieldValue.increment(-10),
  lastActivity: FieldValue.serverTimestamp()
});

// Merge update (create if doesn't exist)
await firestore.collection('users').doc('user123').set({
  preferences: {
    notifications: true
  }
}, { merge: true });
```

#### Delete Document

```typescript
// Delete document
await firestore.collection('conversations').doc('conv123').delete();

// Delete field
await firestore.collection('users').doc('user123').update({
  temporaryData: FieldValue.delete()
});
```

### Complex Queries

```typescript
// Compound queries
const recentTransactions = await firestore
  .collection('credit_transactions')
  .where('userId', '==', 'user123')
  .where('type', '==', 'deduct')
  .where('timestamp', '>=', startDate)
  .where('timestamp', '<=', endDate)
  .orderBy('timestamp', 'desc')
  .limit(50)
  .get();

// Array queries
const conversationsWithTag = await firestore
  .collection('conversations')
  .where('tags', 'array-contains', 'important')
  .get();

// Range queries
const highValuePayments = await firestore
  .collection('payments')
  .where('amount', '>=', 100)
  .where('status', '==', 'completed')
  .get();
```

### Pagination

```typescript
// Cursor-based pagination
let lastDoc = null;
const pageSize = 20;

async function getNextPage() {
  let query = firestore
    .collection('conversations')
    .where('userId', '==', 'user123')
    .orderBy('lastMessageAt', 'desc')
    .limit(pageSize);
  
  if (lastDoc) {
    query = query.startAfter(lastDoc);
  }
  
  const snapshot = await query.get();
  lastDoc = snapshot.docs[snapshot.docs.length - 1];
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}
```

## Realtime Database Data Persistence

### Data Structure

Realtime Database uses a JSON tree structure:

```json
{
  "credit_orchestration": {
    "workflows": {
      "workflow_123": {
        "userId": "user123",
        "type": "CREDIT_DEDUCTION",
        "status": "PENDING",
        "context": {},
        "createdAt": 1704067200000
      }
    },
    "operation_queues": {
      "user123": {
        "op_456": {
          "operation": {
            "type": "deduct_credits",
            "payload": { "amount": 10 }
          },
          "priority": "HIGH",
          "status": "QUEUED"
        }
      }
    }
  },
  "ai_orchestration": {
    "conversations": {
      "conv_789": {
        "userId": "user123",
        "status": "active",
        "lastActivity": "2024-01-01T10:00:00Z"
      }
    },
    "agent_tasks": {
      "task_101": {
        "userId": "user123",
        "taskType": "research",
        "status": "processing",
        "progress": 45
      }
    }
  },
  "user_balances": {
    "user123": {
      "balance": 1500,
      "timestamp": 1704067200000
    }
  }
}
```

### CRUD Operations

#### Write Data

```typescript
// Set data (overwrites)
await realtimeDb.ref('user_balances/user123').set({
  balance: 1500,
  timestamp: ServerValue.TIMESTAMP
});

// Update data (merges)
await realtimeDb.ref('ai_orchestration/agent_tasks/task_101').update({
  status: 'completed',
  progress: 100,
  completedAt: ServerValue.TIMESTAMP
});

// Push data (generates unique key)
const newWorkflowRef = realtimeDb.ref('credit_orchestration/workflows').push();
await newWorkflowRef.set({
  userId: 'user123',
  type: 'CREDIT_ADDITION',
  status: 'PENDING',
  createdAt: ServerValue.TIMESTAMP
});

console.log('Workflow ID:', newWorkflowRef.key);
```

#### Read Data

```typescript
// Get data once
const snapshot = await realtimeDb.ref('user_balances/user123').once('value');
const balance = snapshot.val();

console.log('Balance:', balance);

// Query data
const workflowsSnapshot = await realtimeDb
  .ref('credit_orchestration/workflows')
  .orderByChild('userId')
  .equalTo('user123')
  .limitToLast(10)
  .once('value');

const workflows = [];
workflowsSnapshot.forEach(child => {
  workflows.push({
    id: child.key,
    ...child.val()
  });
});
```

#### Listen for Changes

```typescript
// Listen for value changes
const balanceRef = realtimeDb.ref('user_balances/user123');

balanceRef.on('value', (snapshot) => {
  const balance = snapshot.val();
  console.log('Balance updated:', balance);
  
  // Notify client of balance change
  notifyClient(balance);
});

// Listen for child additions
const tasksRef = realtimeDb.ref('ai_orchestration/agent_tasks');

tasksRef.on('child_added', (snapshot) => {
  const task = snapshot.val();
  console.log('New task:', snapshot.key, task);
  
  // Process new task
  processTask(snapshot.key, task);
});

// Stop listening
balanceRef.off('value');
```

#### Delete Data

```typescript
// Remove data
await realtimeDb.ref('credit_orchestration/workflows/workflow_123').remove();

// Remove with transaction
await realtimeDb.ref('user_balances/user123').transaction((current) => {
  if (current === null) {
    return null; // Delete
  }
  return current;
});
```

## Transactions and Consistency

### Firestore Transactions

Firestore transactions provide ACID guarantees:

```typescript
// Credit deduction transaction
await firestore.runTransaction(async (transaction) => {
  const userRef = firestore.collection('users').doc('user123');
  const userDoc = await transaction.get(userRef);
  
  if (!userDoc.exists) {
    throw new Error('User not found');
  }
  
  const currentBalance = userDoc.data()!.creditBalance;
  const deductAmount = 10;
  
  if (currentBalance < deductAmount) {
    throw new Error('Insufficient credits');
  }
  
  // Update balance
  transaction.update(userRef, {
    creditBalance: currentBalance - deductAmount,
    lastTransaction: FieldValue.serverTimestamp()
  });
  
  // Create transaction record
  const transactionRef = firestore.collection('credit_transactions').doc();
  transaction.set(transactionRef, {
    userId: 'user123',
    amount: deductAmount,
    type: 'deduct',
    timestamp: FieldValue.serverTimestamp(),
    balanceBefore: currentBalance,
    balanceAfter: currentBalance - deductAmount
  });
});
```

### Realtime Database Transactions

Realtime Database transactions ensure atomic updates:

```typescript
// Atomic counter increment
await realtimeDb.ref('user_balances/user123/balance').transaction((current) => {
  return (current || 0) + 10;
});

// Conditional update
await realtimeDb.ref('ai_orchestration/agent_tasks/task_101').transaction((current) => {
  if (current === null) {
    return null; // Abort transaction
  }
  
  if (current.status === 'processing') {
    return {
      ...current,
      status: 'completed',
      completedAt: Date.now()
    };
  }
  
  return; // Abort transaction (no change)
});
```

### Batch Operations

Firestore batch writes for multiple operations:

```typescript
const batch = firestore.batch();

// Update user balance
const userRef = firestore.collection('users').doc('user123');
batch.update(userRef, {
  creditBalance: FieldValue.increment(-10)
});

// Create transaction record
const transactionRef = firestore.collection('credit_transactions').doc();
batch.set(transactionRef, {
  userId: 'user123',
  amount: 10,
  type: 'deduct',
  timestamp: FieldValue.serverTimestamp()
});

// Update conversation
const conversationRef = firestore.collection('conversations').doc('conv123');
batch.update(conversationRef, {
  totalCreditsUsed: FieldValue.increment(10)
});

// Commit all operations atomically
await batch.commit();
```

### Multi-Database Transactions

Coordinating updates across both databases:

```typescript
async function deductCreditsWithSync(userId: string, amount: number) {
  // Start Firestore transaction
  await firestore.runTransaction(async (transaction) => {
    const userRef = firestore.collection('users').doc(userId);
    const userDoc = await transaction.get(userRef);
    
    if (!userDoc.exists) {
      throw new Error('User not found');
    }
    
    const currentBalance = userDoc.data()!.creditBalance;
    
    if (currentBalance < amount) {
      throw new Error('Insufficient credits');
    }
    
    // Update Firestore
    transaction.update(userRef, {
      creditBalance: currentBalance - amount
    });
    
    // Create transaction record
    const transactionRef = firestore.collection('credit_transactions').doc();
    transaction.set(transactionRef, {
      userId,
      amount,
      type: 'deduct',
      timestamp: FieldValue.serverTimestamp()
    });
  });
  
  // Update Realtime Database (eventual consistency)
  await realtimeDb.ref(`user_balances/${userId}`).transaction((current) => {
    return {
      balance: (current?.balance || 0) - amount,
      timestamp: Date.now()
    };
  });
}
```

## Consistency Guarantees

### Firestore Consistency

**Strong Consistency**:
- Single document reads are strongly consistent
- Transactions provide ACID guarantees
- Queries within a transaction are consistent

**Eventual Consistency**:
- Cross-region replication is eventually consistent
- Composite index updates are eventually consistent

```typescript
// Strong consistency - single document
const userDoc = await firestore.collection('users').doc('user123').get();
// Always returns latest committed value

// Eventual consistency - query
const users = await firestore.collection('users').where('status', '==', 'active').get();
// May not include very recent updates
```

### Realtime Database Consistency

**Strong Consistency**:
- All reads return the latest committed value
- Transactions are atomic and isolated
- Updates are immediately visible

```typescript
// Atomic update with strong consistency
await realtimeDb.ref('user_balances/user123').transaction((current) => {
  return { balance: (current?.balance || 0) + 10 };
});

// Read immediately reflects the update
const snapshot = await realtimeDb.ref('user_balances/user123').once('value');
console.log('Updated balance:', snapshot.val().balance);
```

### Conflict Resolution

```typescript
// Optimistic locking with version numbers
await firestore.runTransaction(async (transaction) => {
  const docRef = firestore.collection('users').doc('user123');
  const doc = await transaction.get(docRef);
  
  const currentVersion = doc.data()!.version || 0;
  const expectedVersion = 5;
  
  if (currentVersion !== expectedVersion) {
    throw new Error('Version conflict - document was modified');
  }
  
  transaction.update(docRef, {
    creditBalance: FieldValue.increment(-10),
    version: currentVersion + 1
  });
});
```

## Caching Strategies

### In-Memory Caching

```typescript
import NodeCache from 'node-cache';

class CacheService {
  private cache: NodeCache;
  
  constructor() {
    this.cache = new NodeCache({
      stdTTL: 300, // 5 minutes default
      checkperiod: 60, // Check for expired keys every 60 seconds
      useClones: false // Don't clone objects (better performance)
    });
  }
  
  async get<T>(key: string): Promise<T | null> {
    const cached = this.cache.get<T>(key);
    return cached || null;
  }
  
  async set(key: string, value: any, ttl?: number): Promise<void> {
    this.cache.set(key, value, ttl || 300);
  }
  
  async delete(key: string): Promise<void> {
    this.cache.del(key);
  }
  
  async clear(): Promise<void> {
    this.cache.flushAll();
  }
}

// Usage
const cache = new CacheService();

async function getUserWithCache(userId: string) {
  const cacheKey = `user:${userId}`;
  
  // Try cache first
  let user = await cache.get(cacheKey);
  
  if (!user) {
    // Cache miss - fetch from database
    const userDoc = await firestore.collection('users').doc(userId).get();
    user = userDoc.data();
    
    // Cache for 5 minutes
    await cache.set(cacheKey, user, 300);
  }
  
  return user;
}
```

### Redis Caching

```typescript
import Redis from 'ioredis';

class RedisCacheService {
  private redis: Redis;
  
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });
  }
  
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('Cache get failed', { key, error });
      return null;
    }
  }
  
  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      logger.warn('Cache set failed', { key, error });
    }
  }
  
  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }
  
  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

### Cache Invalidation

```typescript
// Invalidate cache on data changes
async function updateUserProfile(userId: string, updates: any) {
  // Update database
  await firestore.collection('users').doc(userId).update(updates);
  
  // Invalidate cache
  await cache.delete(`user:${userId}`);
  await cache.delete(`user:${userId}:profile`);
  await cache.delete(`user:${userId}:preferences`);
}

// Pattern-based invalidation
async function invalidateUserCache(userId: string) {
  await cache.invalidatePattern(`user:${userId}:*`);
}
```

### Write-Through Cache

```typescript
async function updateUserWithCache(userId: string, updates: any) {
  // Update database
  await firestore.collection('users').doc(userId).update(updates);
  
  // Update cache immediately
  const userDoc = await firestore.collection('users').doc(userId).get();
  const userData = userDoc.data();
  
  await cache.set(`user:${userId}`, userData, 300);
  
  return userData;
}
```

## Offline Synchronization

### Client-Side Offline Support

Firebase SDKs provide automatic offline support:

```typescript
// Enable offline persistence (client-side)
import { enableIndexedDbPersistence } from 'firebase/firestore';

enableIndexedDbPersistence(firestore)
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open
      console.warn('Offline persistence failed: multiple tabs');
    } else if (err.code === 'unimplemented') {
      // Browser doesn't support
      console.warn('Offline persistence not supported');
    }
  });
```

### Offline Queue Management

```typescript
// Queue operations when offline
class OfflineQueue {
  private queue: Array<{ operation: string; data: any }> = [];
  
  async enqueue(operation: string, data: any) {
    this.queue.push({ operation, data });
    await this.saveToLocalStorage();
  }
  
  async processQueue() {
    while (this.queue.length > 0) {
      const item = this.queue[0];
      
      try {
        await this.executeOperation(item.operation, item.data);
        this.queue.shift();
        await this.saveToLocalStorage();
      } catch (error) {
        logger.error('Failed to process queued operation', { item, error });
        break;
      }
    }
  }
  
  private async executeOperation(operation: string, data: any) {
    switch (operation) {
      case 'deduct_credits':
        await deductCredits(data.userId, data.amount);
        break;
      case 'create_conversation':
        await createConversation(data);
        break;
      // ... other operations
    }
  }
  
  private async saveToLocalStorage() {
    localStorage.setItem('offline_queue', JSON.stringify(this.queue));
  }
}
```

### Conflict Resolution

```typescript
// Last-write-wins strategy
async function resolveConflict(localData: any, serverData: any) {
  if (localData.timestamp > serverData.timestamp) {
    // Local data is newer
    await firestore.collection('users').doc(localData.userId).set(localData);
    return localData;
  } else {
    // Server data is newer
    return serverData;
  }
}

// Custom merge strategy
async function mergeConflict(localData: any, serverData: any) {
  return {
    ...serverData,
    ...localData,
    // Merge specific fields
    preferences: {
      ...serverData.preferences,
      ...localData.preferences
    },
    // Use server timestamp
    updatedAt: serverData.updatedAt
  };
}
```

## Data Migration Patterns

### Schema Migration

```typescript
// Migrate user documents to new schema
async function migrateUserSchema() {
  const usersSnapshot = await firestore.collection('users').get();
  const batch = firestore.batch();
  
  usersSnapshot.docs.forEach(doc => {
    const data = doc.data();
    
    // Add new fields
    if (!data.version) {
      batch.update(doc.ref, {
        version: 1,
        migratedAt: FieldValue.serverTimestamp()
      });
    }
    
    // Rename fields
    if (data.oldFieldName) {
      batch.update(doc.ref, {
        newFieldName: data.oldFieldName,
        oldFieldName: FieldValue.delete()
      });
    }
  });
  
  await batch.commit();
}
```

### Data Backfill

```typescript
// Backfill missing data
async function backfillCreditBalances() {
  const usersSnapshot = await firestore.collection('users').get();
  
  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    
    // Calculate balance from transactions
    const transactionsSnapshot = await firestore
      .collection('credit_transactions')
      .where('userId', '==', userId)
      .get();
    
    let balance = 0;
    transactionsSnapshot.docs.forEach(doc => {
      const transaction = doc.data();
      balance += transaction.type === 'add' ? transaction.amount : -transaction.amount;
    });
    
    // Update user balance
    await userDoc.ref.update({ creditBalance: balance });
  }
}
```

## Best Practices

1. **Connection Management**
   - Initialize Firebase Admin SDK once
   - Reuse database instances
   - Configure connection pooling
   - Handle connection errors gracefully

2. **Data Modeling**
   - Denormalize for read performance
   - Use subcollections for hierarchical data
   - Limit document size (< 1MB)
   - Index frequently queried fields

3. **Transactions**
   - Keep transactions short
   - Minimize reads in transactions
   - Handle transaction failures
   - Use batch writes when possible

4. **Caching**
   - Cache frequently accessed data
   - Implement cache invalidation
   - Use appropriate TTL values
   - Monitor cache hit rates

5. **Performance**
   - Use pagination for large datasets
   - Implement query limits
   - Optimize index usage
   - Monitor query performance

6. **Security**
   - Validate all inputs
   - Use security rules
   - Implement proper authentication
   - Audit data access

## Conclusion

The multi-database architecture provides a robust foundation for the AI Chat Interface Platform, combining Firestore's powerful querying with Realtime Database's low-latency updates. By following the patterns and best practices outlined in this document, developers can build reliable, performant, and scalable data persistence layers.

For more information:
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Realtime Database Documentation](https://firebase.google.com/docs/database)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
