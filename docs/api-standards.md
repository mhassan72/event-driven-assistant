# API Standards and Patterns

## Overview

This document defines the standardized API patterns, response formats, and error handling conventions used throughout the Firebase Functions Express API.

## Standardized Response Format

All API endpoints must use the standardized response format defined in `src/shared/utils/api-response.ts`.

### Success Response Format

```typescript
{
  "success": true,
  "data": <response_data>,
  "metadata": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req_1234567890_abcdef",
    "version": "1.0.0",
    "pagination": {  // Optional, for paginated responses
      "page": 1,
      "limit": 50,
      "total": 100,
      "hasMore": true,
      "nextPage": 2,
      "prevPage": null
    }
  }
}
```

### Error Response Format

```typescript
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}, // Optional additional error details
    "requestId": "req_1234567890_abcdef"
  },
  "metadata": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "req_1234567890_abcdef",
    "version": "1.0.0"
  }
}
```

## Request Handler Patterns

### Type-Safe Handler Definition

All route handlers must use the `asyncHandler` wrapper for proper error handling and type safety:

```typescript
import { 
  AuthenticatedRequest, 
  AuthenticatedResponse,
  asyncHandler
} from '../../shared/types/express';
import { APIResponseHelper } from '../../shared/utils/api-response';

// ✅ Correct pattern
router.get('/endpoint',
  requireAuth, // Authentication middleware
  rateLimitByUser({ windowMs: 60000, maxRequests: 100 }), // Rate limiting
  validateRequest(schema), // Input validation
  asyncHandler(async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    try {
      // Business logic here
      const data = await someService.getData(req.user!.uid);
      
      // Use standardized response helper
      APIResponseHelper.success(res, data);
      
    } catch (error) {
      // Specific error handling
      if (error instanceof NotFoundError) {
        APIResponseHelper.notFound(res, error.message);
      } else {
        APIResponseHelper.internalError(res, 'Failed to retrieve data');
      }
    }
  })
);
```

### Response Helper Methods

Use the `APIResponseHelper` class for consistent responses:

```typescript
// Success responses
APIResponseHelper.success(res, data, statusCode?, pagination?);
APIResponseHelper.paginated(res, data, pagination, statusCode?);

// Error responses
APIResponseHelper.error(res, code, message, statusCode?, details?);
APIResponseHelper.validationError(res, message, details?);
APIResponseHelper.unauthorized(res, message?);
APIResponseHelper.forbidden(res, message?);
APIResponseHelper.notFound(res, message?);
APIResponseHelper.conflict(res, message, details?);
APIResponseHelper.rateLimitExceeded(res, retryAfter?);
APIResponseHelper.insufficientCredits(res, required, available);
APIResponseHelper.internalError(res, message?);
```

## Authentication and Authorization

### Authentication Middleware

All protected endpoints must use appropriate authentication middleware:

```typescript
import { requireAuth, requireRole, requirePermission } from '../middleware/auth';
import { UserRole, Permission } from '../../shared/types/firebase-auth';

// Basic authentication
router.get('/protected', requireAuth, handler);

// Role-based access
router.get('/admin', requireAuth, requireRole(UserRole.ADMIN), handler);

// Permission-based access
router.get('/analytics', requireAuth, requirePermission(Permission.VIEW_ANALYTICS), handler);
```

### Request Context

Authenticated requests provide user context:

```typescript
asyncHandler(async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
  const userId = req.user!.uid;           // User ID
  const userEmail = req.user?.email;      // User email
  const userRoles = req.user?.roles;      // User roles
  const permissions = req.user?.permissions; // User permissions
  
  // Security assessment (if available)
  const riskLevel = req.securityAssessment?.riskLevel;
  
  // Rate limit info
  const remaining = req.rateLimitInfo?.remaining;
})
```

## Input Validation

### Zod Schema Validation

Use Zod schemas for input validation:

```typescript
import { z } from 'zod';
import { validateRequest } from '../middleware/validation';

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().min(13).max(120),
  preferences: z.object({
    language: z.enum(['en', 'sw', 'ar', 'fr']),
    notifications: z.boolean()
  }).optional()
});

router.post('/users',
  requireAuth,
  validateRequest(createUserSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
    // req.body is now type-safe and validated
    const userData = req.body; // Type: z.infer<typeof createUserSchema>
    
    // Business logic...
  })
);
```

## Error Handling

### Standard Error Codes

Use standardized error codes from `APIErrorCode` enum:

```typescript
import { APIErrorCode } from '../../shared/utils/api-response';

// Authentication & Authorization
APIErrorCode.UNAUTHORIZED
APIErrorCode.FORBIDDEN
APIErrorCode.INVALID_TOKEN
APIErrorCode.EXPIRED_TOKEN
APIErrorCode.INSUFFICIENT_PERMISSIONS

// Validation
APIErrorCode.VALIDATION_ERROR
APIErrorCode.INVALID_INPUT
APIErrorCode.MISSING_REQUIRED_FIELD

// Resource Management
APIErrorCode.NOT_FOUND
APIErrorCode.ALREADY_EXISTS
APIErrorCode.CONFLICT

// Business Logic
APIErrorCode.INSUFFICIENT_CREDITS
APIErrorCode.RATE_LIMIT_EXCEEDED
APIErrorCode.QUOTA_EXCEEDED

// System Errors
APIErrorCode.INTERNAL_SERVER_ERROR
APIErrorCode.SERVICE_UNAVAILABLE
APIErrorCode.DATABASE_ERROR
```

### Error Response Examples

```typescript
// Validation error
if (!isValidInput(data)) {
  APIResponseHelper.validationError(res, 'Invalid input data', {
    field: 'email',
    reason: 'Invalid email format'
  });
  return;
}

// Business logic error
if (userCredits < requiredCredits) {
  APIResponseHelper.insufficientCredits(res, requiredCredits, userCredits);
  return;
}

// Resource not found
const user = await userService.findById(userId);
if (!user) {
  APIResponseHelper.notFound(res, 'User not found');
  return;
}
```

## Rate Limiting

### Standard Rate Limiting Patterns

```typescript
import { rateLimitByUser } from '../middleware/auth';

// Conservative rate limiting for expensive operations
router.post('/generate-image',
  requireAuth,
  rateLimitByUser({
    windowMs: 60 * 1000,    // 1 minute window
    maxRequests: 5          // 5 requests per minute
  }),
  handler
);

// Standard rate limiting for API endpoints
router.get('/data',
  requireAuth,
  rateLimitByUser({
    windowMs: 60 * 1000,    // 1 minute window
    maxRequests: 100        // 100 requests per minute
  }),
  handler
);

// Relaxed rate limiting for read operations
router.get('/public-data',
  rateLimitByUser({
    windowMs: 60 * 1000,    // 1 minute window
    maxRequests: 200        // 200 requests per minute
  }),
  handler
);
```

## Pagination

### Standardized Pagination

```typescript
// Query parameters
const page = parseInt(req.query.page as string) || 1;
const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Max 100
const offset = (page - 1) * limit;

// Fetch data with pagination
const { data, total } = await service.getPaginatedData({ offset, limit });

// Create pagination metadata
const pagination = APIResponseHelper.createPagination(page, limit, total);

// Send paginated response
APIResponseHelper.paginated(res, data, pagination);
```

## Logging and Monitoring

### Request Correlation

All requests automatically receive a correlation ID for tracking:

```typescript
asyncHandler(async (req: AuthenticatedRequest, res: AuthenticatedResponse) => {
  const correlationId = req.correlationId; // Automatically generated
  
  logger.info('Processing request', {
    correlationId,
    userId: req.user?.uid,
    endpoint: req.originalUrl
  });
});
```

### Structured Logging

```typescript
import { logger } from '../../shared/observability/logger';

// Success logging
logger.info('Operation completed successfully', {
  operation: 'createUser',
  userId: req.user?.uid,
  correlationId: req.correlationId,
  duration: Date.now() - startTime
});

// Error logging
logger.error('Operation failed', {
  operation: 'createUser',
  error: error.message,
  userId: req.user?.uid,
  correlationId: req.correlationId,
  stack: error.stack
});
```

## Security Headers

### Automatic Security Headers

The following security headers are automatically applied:

- `X-Correlation-ID`: Request tracking
- `X-RateLimit-Limit`: Rate limit maximum
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Rate limit reset time
- Standard Helmet security headers

### CORS Configuration

CORS is configured to allow:
- Credentials: `true`
- Methods: `GET, POST, PUT, DELETE, PATCH, OPTIONS`
- Headers: `Content-Type, Authorization, X-Requested-With, X-API-Version`

## Backward Compatibility

### Maintaining Compatibility

When updating API endpoints:

1. **Never remove required fields** from request/response
2. **Always add new fields as optional**
3. **Use API versioning** for breaking changes
4. **Maintain existing error codes** and messages
5. **Document all changes** in API changelog

### API Versioning

```typescript
// Current version (v1)
app.use('/v1', v1Router);

// Future version (v2) - when needed
app.use('/v2', v2Router);
```

## Testing Standards

### Unit Testing

```typescript
describe('User API', () => {
  it('should create user successfully', async () => {
    const userData = {
      name: 'Test User',
      email: 'test@example.com',
      age: 25
    };

    const response = await request(app)
      .post('/v1/users')
      .set('Authorization', `Bearer ${validToken}`)
      .send(userData)
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(userData.email);
    expect(response.body.metadata.requestId).toBeDefined();
  });

  it('should return validation error for invalid input', async () => {
    const invalidData = {
      name: '', // Invalid: empty name
      email: 'invalid-email' // Invalid: not an email
    };

    const response = await request(app)
      .post('/v1/users')
      .set('Authorization', `Bearer ${validToken}`)
      .send(invalidData)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

## Performance Guidelines

### Response Time Targets

- **Simple queries**: < 200ms
- **Complex operations**: < 2s
- **File uploads**: < 30s
- **Batch operations**: < 60s

### Optimization Strategies

1. **Use pagination** for large datasets
2. **Implement caching** for frequently accessed data
3. **Use database indexes** for query optimization
4. **Batch operations** when possible
5. **Implement request timeouts**

## Documentation Requirements

### Endpoint Documentation

Each endpoint must include:

```typescript
/**
 * Get user notifications
 * 
 * @route GET /v1/notifications
 * @access Private (requires authentication)
 * @rateLimit 100 requests per minute
 * 
 * @param {number} [limit=50] - Maximum number of notifications to return (1-100)
 * @param {number} [offset=0] - Number of notifications to skip
 * @param {boolean} [unreadOnly=false] - Return only unread notifications
 * @param {string[]} [types] - Filter by notification types
 * @param {string} [since] - ISO date string to filter notifications since
 * 
 * @returns {Object} Paginated list of notifications
 * @returns {boolean} success - Operation success status
 * @returns {Object[]} data - Array of notification objects
 * @returns {Object} metadata - Response metadata including pagination
 * 
 * @throws {401} Unauthorized - Invalid or missing authentication token
 * @throws {429} Rate Limit Exceeded - Too many requests
 * @throws {500} Internal Server Error - Server error occurred
 * 
 * @example
 * GET /v1/notifications?limit=10&unreadOnly=true
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": [...],
 *   "metadata": {
 *     "timestamp": "2024-01-01T00:00:00.000Z",
 *     "requestId": "req_123",
 *     "pagination": { ... }
 *   }
 * }
 */
```

This standardized approach ensures consistency, maintainability, and excellent developer experience across all API endpoints.