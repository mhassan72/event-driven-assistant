/**
 * Performance and Load Testing
 * Tests concurrent AI conversations, credit operations, and system scalability
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/app';
import { performance } from 'perf_hooks';
import { 
  AICreditService,
  BalanceSyncService
} from '../../src/features/credit-system/services';
import { 
  PaymentOrchestrator
} from '../../src/features/payment-processing/services';
import { 
  AIAssistantService
} from '../../src/features/ai-assistant/services';
import { RTDBOrchestrator } from '../../src/shared/orchestration/rtdb-orchestrator';
import { StructuredLogger } from '../../src/shared/observability/logger';
import { MetricsCollector } from '../../src/shared/observability/metrics';
import { PaymentMethod } from '../../src/shared/types/payment-system';

describe('Performance and Load Testing', () => {
  let app: Express;
  let logger: StructuredLogger;
  let metrics: MetricsCollector;
  let creditService: AICreditService;
  let paymentOrchestrator: PaymentOrchestrator;
  let aiAssistantService: AIAssistantService;
  let rtdbOrchestrator: RTDBOrchestrator;
  
  // Performance tracking
  const performanceMetrics = {
    apiResponseTimes: [] as number[],
    creditOperationTimes: [] as number[],
    paymentProcessingTimes: [] as number[],
    realtimeSyncTimes: [] as number[],
    concurrentUserHandling: [] as number[],
    memoryUsage: [] as number[],
    errorRates: [] as number[]
  };
  
  beforeAll(async () => {
    // Initialize test environment
    process.env.NODE_ENV = 'test';
    process.env.FIREBASE_PROJECT_ID = 'test-project-performance';
    
    // Create app instance
    app = createApp();
    
    // Initialize services
    logger = new StructuredLogger('PerformanceTest');
    metrics = new MetricsCollector();
    
    creditService = new AICreditService(metrics);
    aiAssistantService = new AIAssistantService(logger, metrics);
    rtdbOrchestrator = new RTDBOrchestrator(logger, metrics);
    
    // Mock Firebase Auth middleware for performance testing
    jest.spyOn(require('../../src/api/middleware/auth'), 'validateIdToken')
      .mockImplementation((req: any, res: any, next: any) => {
        req.user = {
          uid: req.headers['x-test-user-id'] || 'perf_test_user',
          email: 'perf.test@example.com'
        };
        next();
      });
  });
  
  afterAll(async () => {
    // Log performance summary
    console.log('\n📊 Performance Test Summary:');
    console.log(`Average API Response Time: ${calculateAverage(performanceMetrics.apiResponseTimes).toFixed(2)}ms`);
    console.log(`Average Credit Operation Time: ${calculateAverage(performanceMetrics.creditOperationTimes).toFixed(2)}ms`);
    console.log(`Average Payment Processing Time: ${calculateAverage(performanceMetrics.paymentProcessingTimes).toFixed(2)}ms`);
    console.log(`Average Real-time Sync Time: ${calculateAverage(performanceMetrics.realtimeSyncTimes).toFixed(2)}ms`);
    console.log(`Peak Memory Usage: ${Math.max(...performanceMetrics.memoryUsage).toFixed(2)}MB`);
    console.log(`Average Error Rate: ${calculateAverage(performanceMetrics.errorRates).toFixed(2)}%`);
    
    jest.restoreAllMocks();
  });
  
  beforeEach(() => {
    // Clear metrics for each test
    Object.keys(performanceMetrics).forEach(key => {
      (performanceMetrics as any)[key] = [];
    });
  });

  describe('Concurrent AI Conversations and Credit Operations Under Load', () => {
    it('should handle 50 concurrent AI conversations efficiently', async () => {
      console.log('🚀 Testing 50 concurrent AI conversations...');
      
      const concurrentUsers = 50;
      const conversationsPerUser = 3;
      const messagesPerConversation = 5;
      
      const startTime = performance.now();
      
      // Create concurrent users
      const userPromises = Array.from({ length: concurrentUsers }, async (_, userIndex) => {
        const userId = `perf_user_${userIndex}`;
        const userStartTime = performance.now();
        
        try {
          // Setup user with credits
          await setupUserForPerformanceTest(userId, 1000);
          
          // Create multiple conversations per user
          const conversationPromises = Array.from({ length: conversationsPerUser }, async (_, convIndex) => {
            const conversationStartTime = performance.now();
            
            // Create conversation
            const conversationResponse = await request(app)
              .post('/v1/chat/conversations')
              .set('Authorization', 'Bearer mock_token')
              .set('x-test-user-id', userId)
              .send({
                title: `Performance Test Conversation ${convIndex}`,
                initialMessage: 'Hello, this is a performance test message.'
              });
            
            if (conversationResponse.status !== 201) {
              throw new Error(`Failed to create conversation: ${conversationResponse.status}`);
            }
            
            const conversationId = conversationResponse.body.data.conversationId;
            
            // Send multiple messages per conversation
            const messagePromises = Array.from({ length: messagesPerConversation }, async (_, msgIndex) => {
              const messageStartTime = performance.now();
              
              const messageResponse = await request(app)
                .post(`/v1/chat/conversations/${conversationId}/messages`)
                .set('Authorization', 'Bearer mock_token')
                .set('x-test-user-id', userId)
                .send({
                  message: `Performance test message ${msgIndex}: Can you help me with a coding problem?`
                });
              
              const messageEndTime = performance.now();
              performanceMetrics.apiResponseTimes.push(messageEndTime - messageStartTime);
              
              if (messageResponse.status !== 200) {
                throw new Error(`Failed to send message: ${messageResponse.status}`);
              }
              
              // Simulate AI processing and credit deduction
              await simulateAIProcessingWithTiming(userId, conversationId, 25);
              
              return messageResponse.body;
            });
            
            await Promise.all(messagePromises);
            
            const conversationEndTime = performance.now();
            performanceMetrics.concurrentUserHandling.push(conversationEndTime - conversationStartTime);
            
            return conversationId;
          });
          
          await Promise.all(conversationPromises);
          
          const userEndTime = performance.now();
          return {
            userId,
            processingTime: userEndTime - userStartTime,
            success: true
          };
        } catch (error) {
          return {
            userId,
            error: error instanceof Error ? error.message : 'Unknown error',
            success: false
          };
        }
      });
      
      // Execute all concurrent operations
      const results = await Promise.all(userPromises);
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Analyze results
      const successfulUsers = results.filter(r => r.success).length;
      const failedUsers = results.filter(r => !r.success).length;
      const errorRate = (failedUsers / concurrentUsers) * 100;
      
      performanceMetrics.errorRates.push(errorRate);
      
      console.log(`✅ Concurrent conversation test completed in ${totalTime.toFixed(2)}ms`);
      console.log(`📊 Success rate: ${successfulUsers}/${concurrentUsers} (${((successfulUsers/concurrentUsers)*100).toFixed(1)}%)`);
      console.log(`📊 Average response time: ${calculateAverage(performanceMetrics.apiResponseTimes).toFixed(2)}ms`);
      
      // Performance assertions
      expect(successfulUsers).toBeGreaterThanOrEqual(concurrentUsers * 0.95); // 95% success rate
      expect(calculateAverage(performanceMetrics.apiResponseTimes)).toBeLessThan(2000); // Under 2 seconds
      expect(errorRate).toBeLessThan(5); // Less than 5% error rate
      
    }, 120000); // 2 minute timeout

    it('should handle rapid credit operations without race conditions', async () => {
      console.log('💰 Testing rapid credit operations...');
      
      const userId = 'credit_perf_test_user';
      const operationsCount = 100;
      const concurrentBatches = 10;
      
      // Setup user with initial credits
      await setupUserForPerformanceTest(userId, 5000);
      
      const startTime = performance.now();
      
      // Create batches of concurrent credit operations
      const batchPromises = Array.from({ length: concurrentBatches }, async (_, batchIndex) => {
        const batchStartTime = performance.now();
        
        const operationPromises = Array.from({ length: operationsCount / concurrentBatches }, async (_, opIndex) => {
          const operationStartTime = performance.now();
          
          try {
            // Alternate between deductions and additions
            if ((batchIndex + opIndex) % 2 === 0) {
              // Credit deduction (AI usage)
              const deductionResponse = await request(app)
                .post('/v1/credits/reserve')
                .set('Authorization', 'Bearer mock_token')
                .set('x-test-user-id', userId)
                .send({
                  amount: 10,
                  reason: `Performance test deduction ${batchIndex}-${opIndex}`,
                  correlationId: `perf_deduct_${batchIndex}_${opIndex}`,
                  expiresInMinutes: 5
                });
              
              if (deductionResponse.status === 200) {
                // Release reservation immediately
                await request(app)
                  .post('/v1/credits/release-reservation')
                  .set('Authorization', 'Bearer mock_token')
                  .set('x-test-user-id', userId)
                  .send({
                    reservationId: deductionResponse.body.data.reservationId
                  });
              }
            } else {
              // Check balance (read operation)
              await request(app)
                .get('/v1/credits/balance')
                .set('Authorization', 'Bearer mock_token')
                .set('x-test-user-id', userId);
            }
            
            const operationEndTime = performance.now();
            performanceMetrics.creditOperationTimes.push(operationEndTime - operationStartTime);
            
            return { success: true };
          } catch (error) {
            return { 
              success: false, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            };
          }
        });
        
        const batchResults = await Promise.all(operationPromises);
        const batchEndTime = performance.now();
        
        return {
          batchIndex,
          processingTime: batchEndTime - batchStartTime,
          results: batchResults
        };
      });
      
      const batchResults = await Promise.all(batchPromises);
      const endTime = performance.now();
      
      // Analyze results
      const allOperations = batchResults.flatMap(batch => batch.results);
      const successfulOperations = allOperations.filter(op => op.success).length;
      const errorRate = ((operationsCount - successfulOperations) / operationsCount) * 100;
      
      performanceMetrics.errorRates.push(errorRate);
      
      console.log(`✅ Credit operations test completed in ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`📊 Success rate: ${successfulOperations}/${operationsCount} (${((successfulOperations/operationsCount)*100).toFixed(1)}%)`);
      console.log(`📊 Average operation time: ${calculateAverage(performanceMetrics.creditOperationTimes).toFixed(2)}ms`);
      
      // Verify final balance consistency
      const finalBalanceResponse = await request(app)
        .get('/v1/credits/balance')
        .set('Authorization', 'Bearer mock_token')
        .set('x-test-user-id', userId);
      
      expect(finalBalanceResponse.status).toBe(200);
      expect(finalBalanceResponse.body.data.currentBalance).toBeGreaterThan(0);
      
      // Performance assertions
      expect(successfulOperations).toBeGreaterThanOrEqual(operationsCount * 0.98); // 98% success rate
      expect(calculateAverage(performanceMetrics.creditOperationTimes)).toBeLessThan(500); // Under 500ms
      expect(errorRate).toBeLessThan(2); // Less than 2% error rate
      
    }, 60000); // 1 minute timeout
  });

  describe('Real-Time Synchronization Performance with Multiple Users', () => {
    it('should maintain real-time sync performance with 100 concurrent users', async () => {
      console.log('⚡ Testing real-time synchronization with 100 users...');
      
      const concurrentUsers = 100;
      const operationsPerUser = 10;
      
      const startTime = performance.now();
      
      // Create concurrent users performing operations
      const userPromises = Array.from({ length: concurrentUsers }, async (_, userIndex) => {
        const userId = `sync_user_${userIndex}`;
        
        try {
          // Setup user
          await setupUserForPerformanceTest(userId, 500);
          
          // Perform operations that trigger real-time updates
          const operationPromises = Array.from({ length: operationsPerUser }, async (_, opIndex) => {
            const syncStartTime = performance.now();
            
            // Perform operation that triggers sync
            const balanceResponse = await request(app)
              .get('/v1/credits/balance')
              .set('Authorization', 'Bearer mock_token')
              .set('x-test-user-id', userId);
            
            if (balanceResponse.status === 200) {
              // Simulate real-time update processing
              await simulateRealtimeSync(userId);
            }
            
            const syncEndTime = performance.now();
            performanceMetrics.realtimeSyncTimes.push(syncEndTime - syncStartTime);
            
            return { success: balanceResponse.status === 200 };
          });
          
          const operationResults = await Promise.all(operationPromises);
          const successfulOps = operationResults.filter(op => op.success).length;
          
          return {
            userId,
            successfulOperations: successfulOps,
            totalOperations: operationsPerUser,
            success: successfulOps === operationsPerUser
          };
        } catch (error) {
          return {
            userId,
            error: error instanceof Error ? error.message : 'Unknown error',
            success: false
          };
        }
      });
      
      const results = await Promise.all(userPromises);
      const endTime = performance.now();
      
      // Analyze results
      const successfulUsers = results.filter(r => r.success).length;
      const totalOperations = results.reduce((sum, r) => sum + (r.successfulOperations || 0), 0);
      const expectedOperations = concurrentUsers * operationsPerUser;
      
      console.log(`✅ Real-time sync test completed in ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`📊 Successful users: ${successfulUsers}/${concurrentUsers}`);
      console.log(`📊 Successful operations: ${totalOperations}/${expectedOperations}`);
      console.log(`📊 Average sync time: ${calculateAverage(performanceMetrics.realtimeSyncTimes).toFixed(2)}ms`);
      
      // Performance assertions
      expect(successfulUsers).toBeGreaterThanOrEqual(concurrentUsers * 0.95); // 95% success rate
      expect(totalOperations).toBeGreaterThanOrEqual(expectedOperations * 0.95); // 95% operation success
      expect(calculateAverage(performanceMetrics.realtimeSyncTimes)).toBeLessThan(1000); // Under 1 second
      
    }, 90000); // 1.5 minute timeout

    it('should handle burst traffic without degradation', async () => {
      console.log('💥 Testing burst traffic handling...');
      
      const burstSize = 200;
      const burstDuration = 5000; // 5 seconds
      
      const startTime = performance.now();
      let requestCount = 0;
      let successCount = 0;
      
      // Create burst of requests
      const burstPromises: Promise<any>[] = [];
      
      while (performance.now() - startTime < burstDuration) {
        const requestPromise = (async () => {
          const requestStartTime = performance.now();
          requestCount++;
          
          try {
            const response = await request(app)
              .get('/v1/credits/balance')
              .set('Authorization', 'Bearer mock_token')
              .set('x-test-user-id', `burst_user_${requestCount % 50}`) // Cycle through 50 users
              .timeout(5000);
            
            const requestEndTime = performance.now();
            performanceMetrics.apiResponseTimes.push(requestEndTime - requestStartTime);
            
            if (response.status === 200) {
              successCount++;
              return { success: true };
            } else {
              return { success: false, status: response.status };
            }
          } catch (error) {
            return { 
              success: false, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            };
          }
        })();
        
        burstPromises.push(requestPromise);
        
        if (burstPromises.length >= burstSize) {
          break;
        }
        
        // Small delay to create realistic burst pattern
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      
      // Wait for all burst requests to complete
      const results = await Promise.all(burstPromises);
      const endTime = performance.now();
      
      const actualSuccessCount = results.filter(r => r.success).length;
      const errorRate = ((requestCount - actualSuccessCount) / requestCount) * 100;
      
      performanceMetrics.errorRates.push(errorRate);
      
      console.log(`✅ Burst traffic test completed in ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`📊 Total requests: ${requestCount}`);
      console.log(`📊 Successful requests: ${actualSuccessCount}`);
      console.log(`📊 Error rate: ${errorRate.toFixed(2)}%`);
      console.log(`📊 Average response time: ${calculateAverage(performanceMetrics.apiResponseTimes).toFixed(2)}ms`);
      
      // Performance assertions
      expect(errorRate).toBeLessThan(10); // Less than 10% error rate under burst
      expect(calculateAverage(performanceMetrics.apiResponseTimes)).toBeLessThan(3000); // Under 3 seconds
      expect(actualSuccessCount).toBeGreaterThanOrEqual(requestCount * 0.9); // 90% success rate
      
    }, 30000); // 30 second timeout
  });

  describe('Payment Processing Scalability and Reliability', () => {
    it('should handle concurrent payment processing efficiently', async () => {
      console.log('💳 Testing concurrent payment processing...');
      
      const concurrentPayments = 20;
      const paymentAmount = 1000; // credits
      
      const startTime = performance.now();
      
      // Create concurrent payment requests
      const paymentPromises = Array.from({ length: concurrentPayments }, async (_, paymentIndex) => {
        const userId = `payment_user_${paymentIndex}`;
        const paymentStartTime = performance.now();
        
        try {
          // Initiate payment
          const paymentResponse = await request(app)
            .post('/v1/payments/traditional')
            .set('Authorization', 'Bearer mock_token')
            .set('x-test-user-id', userId)
            .set('idempotency-key', `perf_payment_${paymentIndex}_${Date.now()}`)
            .send({
              creditAmount: paymentAmount,
              paymentMethod: PaymentMethod.CREDIT_CARD,
              customerInfo: {
                name: `Test User ${paymentIndex}`,
                email: `test${paymentIndex}@example.com`
              },
              billingAddress: {
                line1: '123 Test St',
                city: 'Test City',
                state: 'TS',
                postalCode: '12345',
                country: 'US'
              }
            });
          
          if (paymentResponse.status !== 200) {
            throw new Error(`Payment initiation failed: ${paymentResponse.status}`);
          }
          
          const paymentId = paymentResponse.body.data.paymentId;
          
          // Confirm payment
          const confirmationResponse = await request(app)
            .post('/v1/payments/confirm')
            .set('Authorization', 'Bearer mock_token')
            .set('x-test-user-id', userId)
            .send({
              paymentId,
              provider: 'stripe',
              paymentMethodId: `pm_test_card_${paymentIndex}`
            });
          
          const paymentEndTime = performance.now();
          performanceMetrics.paymentProcessingTimes.push(paymentEndTime - paymentStartTime);
          
          return {
            paymentIndex,
            paymentId,
            success: confirmationResponse.status === 200,
            processingTime: paymentEndTime - paymentStartTime
          };
        } catch (error) {
          const paymentEndTime = performance.now();
          performanceMetrics.paymentProcessingTimes.push(paymentEndTime - paymentStartTime);
          
          return {
            paymentIndex,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });
      
      const results = await Promise.all(paymentPromises);
      const endTime = performance.now();
      
      // Analyze results
      const successfulPayments = results.filter(r => r.success).length;
      const errorRate = ((concurrentPayments - successfulPayments) / concurrentPayments) * 100;
      
      performanceMetrics.errorRates.push(errorRate);
      
      console.log(`✅ Payment processing test completed in ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`📊 Successful payments: ${successfulPayments}/${concurrentPayments}`);
      console.log(`📊 Error rate: ${errorRate.toFixed(2)}%`);
      console.log(`📊 Average processing time: ${calculateAverage(performanceMetrics.paymentProcessingTimes).toFixed(2)}ms`);
      
      // Performance assertions
      expect(successfulPayments).toBeGreaterThanOrEqual(concurrentPayments * 0.95); // 95% success rate
      expect(calculateAverage(performanceMetrics.paymentProcessingTimes)).toBeLessThan(5000); // Under 5 seconds
      expect(errorRate).toBeLessThan(5); // Less than 5% error rate
      
    }, 120000); // 2 minute timeout
  });

  describe('Model Selection and Switching Performance', () => {
    it('should handle rapid model switching without performance degradation', async () => {
      console.log('🔄 Testing model selection and switching performance...');
      
      const switchingOperations = 100;
      const availableModels = [
        'meta-llama/Meta-Llama-3.1-8B-Instruct',
        'google/gemma-2-2b-it',
        'google/gemma-3-27b-it',
        'nvidia/Nemotron-Nano-V2-12b'
      ];
      
      const userId = 'model_switch_user';
      await setupUserForPerformanceTest(userId, 2000);
      
      const startTime = performance.now();
      
      // Create conversation
      const conversationResponse = await request(app)
        .post('/v1/chat/conversations')
        .set('Authorization', 'Bearer mock_token')
        .set('x-test-user-id', userId)
        .send({
          title: 'Model Switching Performance Test',
          initialMessage: 'Testing model switching performance'
        });
      
      expect(conversationResponse.status).toBe(201);
      const conversationId = conversationResponse.body.data.conversationId;
      
      // Perform rapid model switching
      const switchingPromises = Array.from({ length: switchingOperations }, async (_, index) => {
        const switchStartTime = performance.now();
        
        try {
          const selectedModel = availableModels[index % availableModels.length];
          
          const messageResponse = await request(app)
            .post(`/v1/chat/conversations/${conversationId}/messages`)
            .set('Authorization', 'Bearer mock_token')
            .set('x-test-user-id', userId)
            .send({
              message: `Model switch test ${index}`,
              modelOverride: selectedModel
            });
          
          const switchEndTime = performance.now();
          performanceMetrics.apiResponseTimes.push(switchEndTime - switchStartTime);
          
          // Simulate AI processing with different model
          await simulateAIProcessingWithTiming(userId, conversationId, 15, selectedModel);
          
          return {
            index,
            model: selectedModel,
            success: messageResponse.status === 200,
            responseTime: switchEndTime - switchStartTime
          };
        } catch (error) {
          return {
            index,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });
      
      const results = await Promise.all(switchingPromises);
      const endTime = performance.now();
      
      // Analyze results
      const successfulSwitches = results.filter(r => r.success).length;
      const errorRate = ((switchingOperations - successfulSwitches) / switchingOperations) * 100;
      
      performanceMetrics.errorRates.push(errorRate);
      
      console.log(`✅ Model switching test completed in ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`📊 Successful switches: ${successfulSwitches}/${switchingOperations}`);
      console.log(`📊 Error rate: ${errorRate.toFixed(2)}%`);
      console.log(`📊 Average switch time: ${calculateAverage(performanceMetrics.apiResponseTimes).toFixed(2)}ms`);
      
      // Verify model usage distribution
      const modelUsage = results.reduce((acc, result) => {
        if (result.success && result.model) {
          acc[result.model] = (acc[result.model] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);
      
      console.log('📊 Model usage distribution:', modelUsage);
      
      // Performance assertions
      expect(successfulSwitches).toBeGreaterThanOrEqual(switchingOperations * 0.98); // 98% success rate
      expect(calculateAverage(performanceMetrics.apiResponseTimes)).toBeLessThan(1000); // Under 1 second
      expect(errorRate).toBeLessThan(2); // Less than 2% error rate
      
      // Verify all models were used
      expect(Object.keys(modelUsage).length).toBe(availableModels.length);
      
    }, 90000); // 1.5 minute timeout
  });

  describe('Memory Usage and Resource Management', () => {
    it('should maintain stable memory usage under load', async () => {
      console.log('🧠 Testing memory usage and resource management...');
      
      const iterations = 50;
      const operationsPerIteration = 20;
      
      // Track memory usage throughout the test
      const memorySnapshots: number[] = [];
      
      for (let iteration = 0; iteration < iterations; iteration++) {
        const iterationStartTime = performance.now();
        
        // Record memory usage
        const memoryUsage = process.memoryUsage();
        const memoryMB = memoryUsage.heapUsed / 1024 / 1024;
        memorySnapshots.push(memoryMB);
        performanceMetrics.memoryUsage.push(memoryMB);
        
        // Perform operations
        const operationPromises = Array.from({ length: operationsPerIteration }, async (_, opIndex) => {
          const userId = `memory_test_user_${iteration}_${opIndex}`;
          
          try {
            // Create conversation
            const conversationResponse = await request(app)
              .post('/v1/chat/conversations')
              .set('Authorization', 'Bearer mock_token')
              .set('x-test-user-id', userId)
              .send({
                title: `Memory Test Conversation ${iteration}-${opIndex}`,
                initialMessage: 'Memory usage test message'
              });
            
            if (conversationResponse.status === 201) {
              const conversationId = conversationResponse.body.data.conversationId;
              
              // Send message
              await request(app)
                .post(`/v1/chat/conversations/${conversationId}/messages`)
                .set('Authorization', 'Bearer mock_token')
                .set('x-test-user-id', userId)
                .send({
                  message: 'Testing memory usage'
                });
            }
            
            return { success: true };
          } catch (error) {
            return { success: false };
          }
        });
        
        await Promise.all(operationPromises);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        const iterationEndTime = performance.now();
        
        if (iteration % 10 === 0) {
          console.log(`📊 Iteration ${iteration}: Memory usage ${memoryMB.toFixed(2)}MB, Time: ${(iterationEndTime - iterationStartTime).toFixed(2)}ms`);
        }
      }
      
      // Analyze memory usage patterns
      const initialMemory = memorySnapshots[0];
      const finalMemory = memorySnapshots[memorySnapshots.length - 1];
      const peakMemory = Math.max(...memorySnapshots);
      const memoryGrowth = finalMemory - initialMemory;
      const memoryGrowthPercentage = (memoryGrowth / initialMemory) * 100;
      
      console.log(`✅ Memory usage test completed`);
      console.log(`📊 Initial memory: ${initialMemory.toFixed(2)}MB`);
      console.log(`📊 Final memory: ${finalMemory.toFixed(2)}MB`);
      console.log(`📊 Peak memory: ${peakMemory.toFixed(2)}MB`);
      console.log(`📊 Memory growth: ${memoryGrowth.toFixed(2)}MB (${memoryGrowthPercentage.toFixed(2)}%)`);
      
      // Memory usage assertions
      expect(memoryGrowthPercentage).toBeLessThan(50); // Less than 50% memory growth
      expect(peakMemory).toBeLessThan(500); // Less than 500MB peak usage
      expect(finalMemory).toBeLessThan(initialMemory * 1.3); // Final memory within 30% of initial
      
    }, 120000); // 2 minute timeout
  });

  // Helper Functions
  async function setupUserForPerformanceTest(userId: string, creditAmount: number): Promise<void> {
    // Simulate user setup with credits
    await request(app)
      .post('/v1/credits/welcome-bonus')
      .set('Authorization', 'Bearer mock_token')
      .set('x-test-user-id', userId)
      .send({
        deviceFingerprint: `perf_device_${userId}`
      });
    
    // Add additional credits if needed
    if (creditAmount > 1000) {
      // Simulate payment credit addition
      await creditService.addCredits(userId, creditAmount - 1000, 'payment_credit' as any, {
        paymentId: `perf_payment_${userId}`,
        amount: (creditAmount - 1000) * 0.024
      });
    }
  }

  async function simulateAIProcessingWithTiming(
    userId: string, 
    conversationId: string, 
    creditsUsed: number, 
    model?: string
  ): Promise<void> {
    const processingStartTime = performance.now();
    
    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50)); // 50-150ms
    
    // Deduct credits
    await creditService.deductCredits(userId, creditsUsed, 'ai_usage' as any, {
      conversationId,
      model: model || 'meta-llama/Meta-Llama-3.1-8B-Instruct',
      tokensUsed: creditsUsed * 10
    });
    
    const processingEndTime = performance.now();
    performanceMetrics.creditOperationTimes.push(processingEndTime - processingStartTime);
  }

  async function simulateRealtimeSync(userId: string): Promise<void> {
    const syncStartTime = performance.now();
    
    // Simulate real-time synchronization delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10)); // 10-60ms
    
    const syncEndTime = performance.now();
    performanceMetrics.realtimeSyncTimes.push(syncEndTime - syncStartTime);
  }

  function calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  }
});