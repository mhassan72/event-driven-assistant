# Integration Testing Suite

This directory contains comprehensive integration and end-to-end tests for the Integrated Credit System. These tests validate complete user journeys, system performance under load, and security compliance.

## Test Suites

### 1. End-to-End User Journey Tests (`user-journey-e2e.test.ts`)

Tests complete user flows from signup to continued usage:

- **Complete User Journey**: signup → AI chat → credit usage → payment → continued usage
- **Image Generation Workflow**: request → processing → delivery with progress tracking
- **Long-Running Agent Tasks**: complex tasks with real-time progress monitoring
- **Real-Time Synchronization**: validates synchronization across all system components

**Requirements Covered**: 1.1, 5.1, 8.1, 15.1

### 2. Performance and Load Testing (`performance-load.test.ts`)

Tests system performance and scalability:

- **Concurrent AI Conversations**: 50+ concurrent users with AI interactions
- **Rapid Credit Operations**: 100+ concurrent credit operations without race conditions
- **Real-Time Sync Performance**: 100+ concurrent users with real-time updates
- **Burst Traffic Handling**: 200+ requests in 5 seconds
- **Payment Processing Scalability**: 20+ concurrent payment operations
- **Model Selection Performance**: rapid model switching without degradation
- **Memory Usage Monitoring**: stable memory usage under sustained load

**Requirements Covered**: 18.1, 20.2

### 3. Security and Compliance Testing (`security-compliance.test.ts`)

Tests security measures and compliance requirements:

- **Firebase Auth Integration**: token validation, session security, user isolation
- **Blockchain Ledger Integrity**: cryptographic verification, tamper detection
- **Payment Security**: PCI compliance, input validation, idempotency
- **Data Privacy (GDPR)**: data minimization, portability, right to erasure
- **Input Validation**: XSS, SQL injection, command injection protection
- **Rate Limiting**: abuse prevention and DoS protection

**Requirements Covered**: 20.1, 20.4, 21.1

## Running Tests

### Prerequisites

1. **Node.js 22+** installed
2. **Firebase CLI** installed and configured
3. **Firebase Emulators** available
4. **Test dependencies** installed:
   ```bash
   npm install
   ```

### Environment Setup

The tests automatically configure the test environment, but you can customize settings in `integration.config.ts`:

```typescript
export const testConfig: IntegrationTestConfig = {
  timeout: 120000,
  maxConcurrentUsers: 100,
  testDataCleanup: true,
  mockExternalServices: true,
  enablePerformanceMetrics: true,
  enableSecurityTesting: true
};
```

### Running All Integration Tests

```bash
# Run all integration test suites
npm run test:integration

# Or using the test runner directly
npx ts-node test/integration/run-integration-tests.ts
```

### Running Specific Test Suites

```bash
# End-to-end user journey tests
npm run test:integration:e2e

# Performance and load tests
npm run test:integration:performance

# Security and compliance tests
npm run test:integration:security
```

### Running Individual Test Files

```bash
# Run specific test file with Jest
npx jest test/integration/user-journey-e2e.test.ts --testTimeout=180000

# Run with coverage
npx jest test/integration/performance-load.test.ts --coverage --testTimeout=240000

# Run with verbose output
npx jest test/integration/security-compliance.test.ts --verbose --testTimeout=120000
```

### Running All Tests (Unit + Integration)

```bash
npm run test:all
```

## Test Configuration

### Timeouts

- **End-to-End Tests**: 3 minutes (180,000ms)
- **Performance Tests**: 4 minutes (240,000ms)
- **Security Tests**: 2 minutes (120,000ms)

### Concurrency Limits

- **Max Concurrent Users**: 100 (configurable)
- **Concurrent Operations**: Up to 200 requests in burst tests
- **Payment Operations**: Up to 20 concurrent payments

### Mock Services

Tests use mocked external services by default:

- **Stripe**: Mock payment processing
- **PayPal**: Mock payment processing
- **Nebius AI**: Mock AI model responses
- **Firebase**: Local emulators

## Test Output

### Console Output

Tests provide real-time progress updates:

```
🚀 Starting Integration Test Suite
==================================================

🔧 Setting up integration test environment...
✅ Integration test environment ready

🧪 Running test suite: End-to-End User Journey
📝 Description: Complete user flows: signup → AI chat → credit usage → payment → continued usage
⏱️  Timeout: 180s

🚀 Starting complete user journey test...
✅ Step 1: Welcome bonus granted - 1000 credits
✅ Step 2: AI conversation started
✅ Step 3: Message sent to AI assistant
...
🎉 Complete user journey test passed successfully!
```

### Performance Metrics

Performance tests collect detailed metrics:

```
📊 Performance Test Summary:
Average API Response Time: 245.67ms
Average Credit Operation Time: 89.23ms
Average Payment Processing Time: 1,234.56ms
Average Real-time Sync Time: 45.12ms
Peak Memory Usage: 156.78MB
Average Error Rate: 0.12%
```

### Test Reports

After completion, tests generate comprehensive reports:

```
📊 Integration Test Report
==================================================

📈 Summary:
  Total Suites: 3
  Passed: 3 ✅
  Failed: 0 
  Success Rate: 100.0%
  Total Duration: 387.45s
  Average Coverage: 87.3%

📋 Detailed Results:
  ✅ End-to-End User Journey: 156.23s (89.2% coverage)
  ✅ Performance and Load Testing: 198.67s (85.7% coverage)
  ✅ Security and Compliance: 32.55s (87.1% coverage)

⚡ Performance Metrics:
  Metrics collected at: 2024-01-15T10:30:45.123Z
  Total metrics: 47

🎉 All integration tests passed successfully!
```

## Troubleshooting

### Common Issues

1. **Firebase Emulator Connection**
   ```bash
   # Start emulators manually
   firebase emulators:start --only auth,firestore,database
   ```

2. **Memory Issues**
   ```bash
   # Increase Node.js memory limit
   export NODE_OPTIONS="--max-old-space-size=4096"
   ```

3. **Timeout Issues**
   ```bash
   # Run with increased timeout
   npx jest --testTimeout=300000
   ```

4. **Port Conflicts**
   ```bash
   # Check for running processes
   lsof -i :9099  # Firebase Auth Emulator
   lsof -i :8080  # Firestore Emulator
   lsof -i :9000  # Realtime Database Emulator
   ```

### Debug Mode

Enable debug logging:

```bash
export DEBUG=integration-test:*
npm run test:integration
```

### Test Data Cleanup

Tests automatically clean up test data, but you can disable this:

```typescript
// In integration.config.ts
export const testConfig = {
  testDataCleanup: false  // Keep test data for debugging
};
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Integration Tests
on: [push, pull_request]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
      
      - name: Install dependencies
        run: npm ci
        working-directory: ./functions
      
      - name: Start Firebase Emulators
        run: |
          npm install -g firebase-tools
          firebase emulators:start --only auth,firestore,database &
          sleep 10
      
      - name: Run Integration Tests
        run: npm run test:integration
        working-directory: ./functions
        env:
          NODE_ENV: test
          CI: true
```

### Performance Benchmarks

Set up performance benchmarks in CI:

```bash
# Run performance tests and save results
npm run test:integration:performance > performance-results.json

# Compare with baseline
node scripts/compare-performance.js performance-results.json baseline.json
```

## Contributing

When adding new integration tests:

1. **Follow the existing patterns** in test files
2. **Use the IntegrationTestHelper** for common operations
3. **Add appropriate timeouts** for long-running operations
4. **Include performance measurements** where relevant
5. **Validate security requirements** for sensitive operations
6. **Update this README** with new test descriptions

### Test Structure

```typescript
describe('New Integration Test Suite', () => {
  let testHelper: IntegrationTestHelper;
  
  beforeAll(async () => {
    testHelper = new IntegrationTestHelper();
    await testHelper.setupTestEnvironment();
  });
  
  afterAll(async () => {
    await testHelper.cleanupTestEnvironment();
  });
  
  it('should test specific functionality', async () => {
    // Test implementation
  }, 60000); // Appropriate timeout
});
```

## Requirements Validation

These integration tests validate the following requirements from the specification:

- **Requirement 1.1**: Welcome bonus system
- **Requirement 5.1**: Automatic credit deduction
- **Requirement 8.1**: Image generation workflow
- **Requirement 15.1**: Real-time orchestration
- **Requirement 18.1**: Performance monitoring
- **Requirement 20.1**: Security measures
- **Requirement 20.2**: Scalability requirements
- **Requirement 20.4**: Data privacy compliance
- **Requirement 21.1**: Firebase Auth integration

All tests are designed to ensure the system meets production-ready standards for performance, security, and reliability.