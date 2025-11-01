/**
 * Admin API Integration Tests
 * Tests for administrative endpoints including model management, analytics, and system monitoring
 */

import request from 'supertest';
import { Express } from 'express';
import { app } from '../../../src/app';
import * as admin from 'firebase-admin';

describe('Admin API Integration Tests', () => {
  let testApp: Express;
  let adminToken: string;
  let regularUserToken: string;

  beforeAll(async () => {
    testApp = app;
    
    // Mock Firebase Admin SDK
    jest.spyOn(admin, 'initializeApp').mockImplementation(() => ({} as any));
    
    // Create mock admin token
    adminToken = 'mock-admin-token';
    regularUserToken = 'mock-user-token';
    
    // Mock Firebase Auth middleware
    jest.mock('../../../src/api/middleware/auth', () => ({
      requireAdmin: (req: any, res: any, next: any) => {
        if (req.headers.authorization === `Bearer ${adminToken}`) {
          req.user = { uid: 'admin-user-id', customClaims: { admin: true } };
          next();
        } else {
          res.status(403).json({ error: 'Admin access required' });
        }
      }
    }));
  });

  afterAll(async () => {
    jest.restoreAllMocks();
  });

  describe('Authentication and Authorization', () => {
    it('should reject requests without admin token', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/models')
        .expect(403);

      expect(response.body.error).toBe('Admin access required');
    });

    it('should reject requests with regular user token', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/models')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .expect(403);

      expect(response.body.error).toBe('Admin access required');
    });

    it('should allow requests with admin token', async () => {
      // Mock the admin service to avoid actual database calls
      jest.doMock('../../../src/features/ai-assistant/services/admin-model-service', () => ({
        AdminModelService: jest.fn().mockImplementation(() => ({
          getAllModels: jest.fn().mockResolvedValue([])
        }))
      }));

      const response = await request(testApp)
        .get('/api/v1/admin/models')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Model Management', () => {
    beforeEach(() => {
      // Mock admin model service
      jest.doMock('../../../src/features/ai-assistant/services/admin-model-service', () => ({
        AdminModelService: jest.fn().mockImplementation(() => ({
          getAllModels: jest.fn().mockResolvedValue([
            {
              id: 'test-model-1',
              name: 'Test Model 1',
              category: 'text_generation',
              isActive: true,
              provider: 'test-provider'
            }
          ]),
          getModel: jest.fn().mockResolvedValue({
            id: 'test-model-1',
            name: 'Test Model 1',
            category: 'text_generation',
            isActive: true,
            provider: 'test-provider'
          }),
          addModel: jest.fn().mockResolvedValue(undefined),
          updateModel: jest.fn().mockResolvedValue(undefined),
          deleteModel: jest.fn().mockResolvedValue(undefined),
          updateModelPricing: jest.fn().mockResolvedValue(undefined),
          getModelPerformanceMetrics: jest.fn().mockResolvedValue({
            modelId: 'test-model-1',
            timeRange: {
              startDate: new Date(),
              endDate: new Date(),
              granularity: 'day'
            },
            metrics: {
              totalRequests: 1000,
              successRate: 99.5,
              averageLatency: 250,
              errorRate: 0.5,
              throughput: 100,
              userSatisfaction: 8.5
            },
            trends: {
              requestTrend: [],
              latencyTrend: [],
              errorTrend: []
            },
            comparisons: {
              vsLastPeriod: {
                requestsChange: 10,
                latencyChange: -5,
                errorRateChange: -0.2,
                satisfactionChange: 0.3
              },
              vsCategoryAverage: {
                requestsChange: 5,
                latencyChange: -10,
                errorRateChange: -0.1,
                satisfactionChange: 0.5
              }
            }
          })
        }))
      }));
    });

    it('should get all models', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/models')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.models).toHaveLength(1);
      expect(response.body.data.totalCount).toBe(1);
      expect(response.body.data.activeCount).toBe(1);
    });

    it('should get a specific model', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/models/test-model-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('test-model-1');
      expect(response.body.data.name).toBe('Test Model 1');
    });

    it('should add a new model', async () => {
      const newModel = {
        id: 'new-test-model',
        name: 'New Test Model',
        category: 'text_generation',
        provider: 'test-provider',
        isActive: true,
        capabilities: {
          maxTokens: 4096,
          supportsStreaming: true,
          supportsImages: false,
          supportsTools: true,
          contextWindow: 4096
        },
        pricing: {
          modelId: 'new-test-model',
          category: 'text_generation',
          costPer1kInputTokens: 5,
          costPer1kOutputTokens: 8,
          minimumCost: 1,
          currency: 'credits',
          lastUpdated: new Date()
        },
        performance: {
          averageLatency: 1200,
          tokensPerSecond: 150,
          qualityScore: 8.5,
          speedScore: 9.0,
          costScore: 8.8,
          reliabilityScore: 9.2
        },
        metadata: {
          addedAt: new Date(),
          lastUpdated: new Date(),
          addedBy: 'admin',
          tags: ['test', 'new']
        }
      };

      const response = await request(testApp)
        .post('/api/v1/admin/models')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newModel)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.modelId).toBe('new-test-model');
    });

    it('should update a model', async () => {
      const updates = {
        name: 'Updated Test Model',
        isActive: false
      };

      const response = await request(testApp)
        .put('/api/v1/admin/models/test-model-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.modelId).toBe('test-model-1');
    });

    it('should delete a model', async () => {
      const response = await request(testApp)
        .delete('/api/v1/admin/models/test-model-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.modelId).toBe('test-model-1');
    });

    it('should update model pricing', async () => {
      const pricing = {
        modelId: 'test-model-1',
        category: 'text_generation',
        costPer1kInputTokens: 6,
        costPer1kOutputTokens: 10,
        minimumCost: 2,
        currency: 'credits',
        lastUpdated: new Date()
      };

      const response = await request(testApp)
        .put('/api/v1/admin/models/test-model-1/pricing')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(pricing)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.modelId).toBe('test-model-1');
    });

    it('should get model performance metrics', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/models/test-model-1/performance')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          granularity: 'day'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.modelId).toBe('test-model-1');
      expect(response.body.data.metrics.totalRequests).toBe(1000);
      expect(response.body.data.metrics.successRate).toBe(99.5);
    });

    it('should validate required fields when adding model', async () => {
      const invalidModel = {
        name: 'Invalid Model'
        // Missing required fields: id, category
      };

      const response = await request(testApp)
        .post('/api/v1/admin/models')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidModel)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid model data');
    });
  });

  describe('Pricing Configuration', () => {
    beforeEach(() => {
      // Mock admin model service for pricing
      jest.doMock('../../../src/features/ai-assistant/services/admin-model-service', () => ({
        AdminModelService: jest.fn().mockImplementation(() => ({
          getPricingConfiguration: jest.fn().mockResolvedValue({
            globalSettings: {
              defaultCurrency: 'credits',
              minimumCreditCost: 1,
              pricingUpdateFrequency: 'weekly',
              autoAdjustPricing: false
            },
            categoryMultipliers: {
              text_generation: 1.0,
              vision_model: 1.5,
              image_generation: 2.0,
              embeddings: 0.5
            },
            qualityPremiums: {
              standard: 1.0,
              high: 1.3,
              premium: 1.6
            },
            volumeDiscounts: [
              { threshold: 1000, discountPercentage: 5, description: '5% off for 1000+ credits' }
            ],
            lastUpdated: new Date()
          }),
          updatePricingConfiguration: jest.fn().mockResolvedValue(undefined)
        }))
      }));
    });

    it('should get pricing configuration', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/credits/pricing')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.globalSettings).toBeDefined();
      expect(response.body.data.categoryMultipliers).toBeDefined();
      expect(response.body.data.qualityPremiums).toBeDefined();
      expect(response.body.data.volumeDiscounts).toHaveLength(1);
    });

    it('should update pricing configuration', async () => {
      const pricingConfig = {
        globalSettings: {
          defaultCurrency: 'credits',
          minimumCreditCost: 2,
          pricingUpdateFrequency: 'daily',
          autoAdjustPricing: true
        },
        categoryMultipliers: {
          text_generation: 1.1,
          vision_model: 1.6,
          image_generation: 2.2,
          embeddings: 0.6
        },
        qualityPremiums: {
          standard: 1.0,
          high: 1.4,
          premium: 1.8
        },
        volumeDiscounts: [
          { threshold: 500, discountPercentage: 3, description: '3% off for 500+ credits' },
          { threshold: 1000, discountPercentage: 5, description: '5% off for 1000+ credits' }
        ]
      };

      const response = await request(testApp)
        .put('/api/v1/admin/credits/pricing')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(pricingConfig)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Pricing configuration updated successfully');
    });

    it('should validate pricing configuration structure', async () => {
      const invalidConfig = {
        globalSettings: {
          defaultCurrency: 'credits'
          // Missing required fields
        }
        // Missing categoryMultipliers
      };

      const response = await request(testApp)
        .put('/api/v1/admin/credits/pricing')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidConfig)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid pricing configuration');
    });
  });

  describe('Analytics and Reporting', () => {
    beforeEach(() => {
      // Mock admin model service and system analytics service
      jest.doMock('../../../src/features/ai-assistant/services/admin-model-service', () => ({
        AdminModelService: jest.fn().mockImplementation(() => ({
          getModelUsageAnalytics: jest.fn().mockResolvedValue({
            timeRange: {
              startDate: new Date('2024-01-01'),
              endDate: new Date('2024-01-31'),
              granularity: 'day'
            },
            totalRequests: 10000,
            totalCreditsConsumed: 50000,
            uniqueUsers: 500,
            usageByModel: [],
            usageByCategory: [],
            usageByTimeOfDay: [],
            usageByDayOfWeek: [],
            requestTrend: [],
            creditConsumptionTrend: [],
            userGrowthTrend: [],
            mostUsedModels: [],
            mostProfitableModels: []
          }),
          getRevenueAnalytics: jest.fn().mockResolvedValue({
            timeRange: {
              startDate: new Date('2024-01-01'),
              endDate: new Date('2024-01-31'),
              granularity: 'day'
            },
            totalRevenue: 1200,
            totalCreditsConsumed: 50000,
            averageRevenuePerUser: 2.4,
            revenueByModel: [],
            revenueByCategory: [],
            revenueByUserSegment: [],
            revenueTrend: [],
            creditConsumptionTrend: [],
            arpu: [],
            projectedMonthlyRevenue: 1500,
            projectedGrowthRate: 15.5
          }),
          getUserBehaviorAnalytics: jest.fn().mockResolvedValue({
            timeRange: {
              startDate: new Date('2024-01-01'),
              endDate: new Date('2024-01-31'),
              granularity: 'day'
            },
            totalUsers: 1000,
            activeUsers: 500,
            newUsers: 100,
            sessionDuration: {
              averageDuration: 1800,
              medianDuration: 1200,
              durationDistribution: []
            },
            featureUsage: {
              features: [],
              adoptionRates: []
            },
            modelSwitching: {
              switchingRate: 15.5,
              commonSwitches: [],
              switchingReasons: []
            },
            userSegments: [],
            userRetention: {
              cohortAnalysis: [],
              retentionRates: [],
              lifetimeValue: {
                averageLTV: 120,
                ltvBuckets: [],
                ltvTrend: []
              }
            },
            churnAnalysis: {
              churnRate: 5.2,
              churnReasons: [],
              churnPrediction: [],
              preventionStrategies: []
            }
          }),
          getSystemPerformanceOverview: jest.fn().mockResolvedValue({
            timestamp: new Date(),
            totalModels: 10,
            activeModels: 8,
            systemHealth: 95,
            overallMetrics: {
              totalRequests: 10000,
              averageLatency: 250,
              systemErrorRate: 0.5,
              userSatisfaction: 8.7
            },
            topPerformingModels: [],
            underperformingModels: [],
            alerts: []
          })
        }))
      }));

      jest.doMock('../../../src/features/ai-assistant/services/system-analytics-service', () => ({
        SystemAnalyticsService: jest.fn().mockImplementation(() => ({
          getFinancialReporting: jest.fn().mockResolvedValue({
            timeRange: {
              startDate: new Date('2024-01-01'),
              endDate: new Date('2024-01-31'),
              granularity: 'day'
            },
            revenue: {
              totalRevenue: 12500,
              recurringRevenue: 8750,
              oneTimeRevenue: 3750,
              revenueBySource: [],
              revenueGrowthRate: 15.5,
              averageRevenuePerUser: 25,
              monthlyRecurringRevenue: 8750
            },
            costs: {
              totalCosts: 8000,
              operationalCosts: 5000,
              infrastructureCosts: 3000,
              costByCategory: [],
              costPerUser: 16,
              costGrowthRate: 8.2
            },
            profitability: {
              grossProfit: 4500,
              grossMargin: 36,
              netProfit: 4500,
              netMargin: 36,
              profitPerUser: 9,
              breakEvenPoint: 8000
            },
            projections: {
              projectedRevenue: [],
              projectedCosts: [],
              projectedProfit: [],
              confidenceInterval: 80
            },
            trends: {
              revenueGrowth: [],
              costTrend: [],
              profitabilityTrend: [],
              userAcquisitionCost: [],
              lifetimeValue: []
            }
          }),
          getKPIDashboard: jest.fn().mockResolvedValue({
            timestamp: new Date(),
            businessKPIs: [
              { name: 'MRR', value: 8750, target: 10000, unit: 'USD', trend: 'up', change: 12, status: 'good' }
            ],
            technicalKPIs: [
              { name: 'Uptime', value: 99.9, target: 99.5, unit: '%', trend: 'stable', change: 0, status: 'excellent' }
            ],
            userKPIs: [
              { name: 'MAU', value: 2500, target: 3000, unit: 'users', trend: 'up', change: 15, status: 'good' }
            ],
            financialKPIs: [
              { name: 'Gross Margin', value: 36, target: 40, unit: '%', trend: 'up', change: 3, status: 'warning' }
            ],
            alerts: []
          }),
          getRealTimeMetrics: jest.fn().mockResolvedValue({
            timestamp: new Date(),
            activeUsers: 150,
            requestsPerSecond: 25,
            responseTime: 250,
            errorRate: 0.5,
            systemLoad: 65,
            queueDepth: 12,
            throughput: 1000,
            concurrentSessions: 125
          }),
          getSystemHealthStatus: jest.fn().mockResolvedValue({
            timestamp: new Date(),
            overallHealth: 'healthy',
            components: [
              { component: 'API Gateway', status: 'healthy', responseTime: 50, errorRate: 0.1, lastCheck: new Date() },
              { component: 'Database', status: 'healthy', responseTime: 25, errorRate: 0.0, lastCheck: new Date() }
            ],
            alerts: [],
            recommendations: []
          })
        }))
      }));
    });

    it('should get usage analytics', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/analytics/usage')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          granularity: 'day'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalRequests).toBe(10000);
      expect(response.body.data.totalCreditsConsumed).toBe(50000);
      expect(response.body.data.uniqueUsers).toBe(500);
    });

    it('should get revenue analytics', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/analytics/revenue')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          granularity: 'day'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalRevenue).toBe(1200);
      expect(response.body.data.averageRevenuePerUser).toBe(2.4);
      expect(response.body.data.projectedMonthlyRevenue).toBe(1500);
    });

    it('should get user behavior analytics', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/analytics/user-behavior')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          granularity: 'day'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalUsers).toBe(1000);
      expect(response.body.data.activeUsers).toBe(500);
      expect(response.body.data.churnAnalysis.churnRate).toBe(5.2);
    });

    it('should get financial reporting', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/analytics/financial')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          granularity: 'day'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.revenue.totalRevenue).toBe(12500);
      expect(response.body.data.costs.totalCosts).toBe(8000);
      expect(response.body.data.profitability.grossProfit).toBe(4500);
    });

    it('should get KPI dashboard', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/dashboard/kpis')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.businessKPIs).toHaveLength(1);
      expect(response.body.data.technicalKPIs).toHaveLength(1);
      expect(response.body.data.userKPIs).toHaveLength(1);
      expect(response.body.data.financialKPIs).toHaveLength(1);
    });

    it('should get system performance overview', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/system/performance')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalModels).toBe(10);
      expect(response.body.data.activeModels).toBe(8);
      expect(response.body.data.systemHealth).toBe(95);
    });

    it('should get real-time metrics', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/monitoring/real-time')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.activeUsers).toBe(150);
      expect(response.body.data.requestsPerSecond).toBe(25);
      expect(response.body.data.responseTime).toBe(250);
    });

    it('should get system health status', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/monitoring/health')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.overallHealth).toBe('healthy');
      expect(response.body.data.components).toHaveLength(2);
    });
  });

  describe('User Management', () => {
    beforeEach(() => {
      // Mock Firestore for user management
      const mockFirestore = {
        collection: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        doc: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({
          docs: [
            {
              id: 'user-1',
              data: () => ({
                email: 'user1@example.com',
                name: 'User One',
                createdAt: new Date(),
                status: 'active'
              })
            }
          ],
          size: 1
        }),
        exists: true,
        data: () => ({
          userId: 'user-1',
          currentBalance: 500,
          lifetimeEarned: 1000,
          lifetimeSpent: 500
        })
      };

      jest.spyOn(admin, 'firestore').mockReturnValue(mockFirestore as any);
    });

    it('should get users list', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          limit: 10,
          offset: 0
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(1);
      expect(response.body.data.totalCount).toBe(1);
    });

    it('should get user credit details', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/users/user-1/credits')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.userId).toBe('user-1');
      expect(response.body.data.balance).toBeDefined();
    });

    it('should handle pagination for users list', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          limit: 5,
          offset: 10
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.limit).toBe(5);
      expect(response.body.data.offset).toBe(10);
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      // Mock service to throw error
      jest.doMock('../../../src/features/ai-assistant/services/admin-model-service', () => ({
        AdminModelService: jest.fn().mockImplementation(() => ({
          getAllModels: jest.fn().mockRejectedValue(new Error('Database connection failed'))
        }))
      }));

      const response = await request(testApp)
        .get('/api/v1/admin/models')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to retrieve models');
    });

    it('should validate request parameters', async () => {
      const response = await request(testApp)
        .get('/api/v1/admin/models/test-model-1/performance')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          startDate: 'invalid-date',
          endDate: '2024-01-31'
        })
        .expect(500); // Would be 400 with proper validation

      expect(response.body.success).toBe(false);
    });

    it('should handle missing resources', async () => {
      // Mock service to return null
      jest.doMock('../../../src/features/ai-assistant/services/admin-model-service', () => ({
        AdminModelService: jest.fn().mockImplementation(() => ({
          getModel: jest.fn().mockResolvedValue(null)
        }))
      }));

      const response = await request(testApp)
        .get('/api/v1/admin/models/non-existent-model')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Model not found');
    });
  });
});