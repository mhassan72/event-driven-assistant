/**
 * API Documentation Routes
 * OpenAPI/Swagger documentation and API testing endpoints
 */

import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handling';

const docsRouter = Router();

// OpenAPI specification
const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Integrated Credit System API',
    version: '1.0.0',
    description: 'AI Assistant with credit-based payment system and Firebase Auth integration',
    contact: {
      name: 'API Support',
      email: 'support@example.com'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: process.env.NODE_ENV === 'production' 
        ? 'https://your-domain.com/v1' 
        : 'http://localhost:5001/your-project/us-central1/api/v1',
      description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
    }
  ],
  components: {
    securitySchemes: {
      FirebaseAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Firebase ID token'
      }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          requestId: { type: 'string' }
        }
      },
      CreditBalance: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          currentBalance: { type: 'number' },
          availableBalance: { type: 'number' },
          reservedCredits: { type: 'number' },
          accountStatus: { type: 'string', enum: ['active', 'suspended', 'closed'] },
          lifetimeCreditsEarned: { type: 'number' },
          lifetimeCreditsSpent: { type: 'number' },
          lastUpdated: { type: 'string', format: 'date-time' }
        }
      },
      Conversation: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          messages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                role: { type: 'string', enum: ['user', 'assistant'] },
                content: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' },
                creditsUsed: { type: 'number' }
              }
            }
          },
          createdAt: { type: 'string', format: 'date-time' },
          lastMessageAt: { type: 'string', format: 'date-time' },
          totalCreditsUsed: { type: 'number' }
        }
      },
      AIModel: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string', enum: ['text_generation', 'vision', 'image_generation', 'embeddings'] },
          provider: { type: 'string' },
          isActive: { type: 'boolean' },
          capabilities: {
            type: 'object',
            properties: {
              maxTokens: { type: 'number' },
              supportsStreaming: { type: 'boolean' },
              supportsImages: { type: 'boolean' },
              supportsTools: { type: 'boolean' }
            }
          },
          pricing: {
            type: 'object',
            properties: {
              costPer1kInputTokens: { type: 'number' },
              costPer1kOutputTokens: { type: 'number' },
              minimumCost: { type: 'number' },
              currency: { type: 'string' }
            }
          }
        }
      },
      GeneratedImage: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          prompt: { type: 'string' },
          model: { type: 'string' },
          size: { type: 'string' },
          quality: { type: 'string', enum: ['standard', 'hd'] },
          url: { type: 'string', format: 'uri' },
          thumbnailUrl: { type: 'string', format: 'uri' },
          createdAt: { type: 'string', format: 'date-time' },
          creditsUsed: { type: 'number' }
        }
      },
      Payment: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          amount: { type: 'number' },
          currency: { type: 'string' },
          creditAmount: { type: 'number' },
          paymentMethod: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'] },
          createdAt: { type: 'string', format: 'date-time' },
          processedAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  },
  security: [
    {
      FirebaseAuth: []
    }
  ],
  paths: {
    '/credits/balance': {
      get: {
        summary: 'Get current credit balance',
        tags: ['Credits'],
        security: [{ FirebaseAuth: [] }],
        responses: {
          '200': {
            description: 'Credit balance retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { $ref: '#/components/schemas/CreditBalance' }
                  }
                }
              }
            }
          },
          '401': {
            description: 'Unauthorized',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/chat/conversations': {
      get: {
        summary: 'List user conversations',
        tags: ['Chat'],
        security: [{ FirebaseAuth: [] }],
        parameters: [
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
          },
          {
            name: 'offset',
            in: 'query',
            schema: { type: 'integer', minimum: 0, default: 0 }
          }
        ],
        responses: {
          '200': {
            description: 'Conversations retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        conversations: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/Conversation' }
                        },
                        pagination: {
                          type: 'object',
                          properties: {
                            limit: { type: 'integer' },
                            offset: { type: 'integer' },
                            total: { type: 'integer' },
                            hasMore: { type: 'boolean' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        summary: 'Start new conversation',
        tags: ['Chat'],
        security: [{ FirebaseAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['initialMessage'],
                properties: {
                  title: { type: 'string' },
                  initialMessage: { type: 'string' },
                  modelPreferences: { type: 'object' }
                }
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Conversation created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        conversationId: { type: 'string' },
                        title: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                        status: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/models': {
      get: {
        summary: 'Get available AI models',
        tags: ['Models'],
        security: [{ FirebaseAuth: [] }],
        parameters: [
          {
            name: 'category',
            in: 'query',
            schema: { type: 'string', enum: ['text_generation', 'vision', 'image_generation', 'embeddings'] }
          },
          {
            name: 'provider',
            in: 'query',
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'Models retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        models: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/AIModel' }
                        },
                        totalCount: { type: 'integer' },
                        categories: { type: 'array', items: { type: 'string' } },
                        providers: { type: 'array', items: { type: 'string' } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/images/generate': {
      post: {
        summary: 'Generate image',
        tags: ['Images'],
        security: [{ FirebaseAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['prompt'],
                properties: {
                  prompt: { type: 'string', maxLength: 1000 },
                  model: { type: 'string', default: 'black-forest-labs/flux-schnell' },
                  size: { type: 'string', enum: ['512x512', '768x768', '1024x1024', '1024x1792', '1792x1024'], default: '1024x1024' },
                  quality: { type: 'string', enum: ['standard', 'hd'], default: 'standard' },
                  style: { type: 'string' },
                  negativePrompt: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Image generation task created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        taskId: { type: 'string' },
                        status: { type: 'string' },
                        estimatedCredits: { type: 'number' },
                        estimatedDuration: { type: 'number' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/payments/options': {
      get: {
        summary: 'Get payment options and credit packages',
        tags: ['Payments'],
        security: [{ FirebaseAuth: [] }],
        responses: {
          '200': {
            description: 'Payment options retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        creditPackages: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              credits: { type: 'number' },
                              price: { type: 'number' },
                              currency: { type: 'string' },
                              discount: { type: 'number' }
                            }
                          }
                        },
                        paymentMethods: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              name: { type: 'string' },
                              description: { type: 'string' },
                              provider: { type: 'string' }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

// Get OpenAPI specification
docsRouter.get('/openapi.json', asyncHandler(async (req: any, res: any) => {
  res.json(openApiSpec);
}));

// Swagger UI HTML
docsRouter.get('/swagger', asyncHandler(async (req: any, res: any) => {
  const swaggerHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Integrated Credit System API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui.css" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin:0;
      background: #fafafa;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '/v1/docs/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.send(swaggerHtml);
}));

// API status and health information
docsRouter.get('/status', asyncHandler(async (req: any, res: any) => {
  const status = {
    api: {
      name: 'Integrated Credit System API',
      version: '1.0.0',
      status: 'operational',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    },
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      environment: process.env.NODE_ENV || 'development'
    },
    services: {
      firebase: {
        auth: 'operational',
        firestore: 'operational',
        realtimeDatabase: 'operational',
        functions: 'operational'
      },
      external: {
        stripe: 'operational',
        paypal: 'operational',
        nebiusAI: 'operational'
      }
    },
    features: {
      authentication: 'enabled',
      creditSystem: 'enabled',
      aiAssistant: 'enabled',
      imageGeneration: 'enabled',
      payments: 'enabled',
      web3Payments: 'enabled'
    },
    limits: {
      rateLimiting: 'enabled',
      requestTimeout: '30s',
      maxRequestSize: '10MB',
      maxResponseSize: '50MB'
    },
    metrics: {
      totalRequests: 0, // In production, get from metrics service
      averageResponseTime: 0,
      errorRate: 0,
      activeUsers: 0
    }
  };
  
  res.json(status);
}));

// API endpoints discovery
docsRouter.get('/endpoints', asyncHandler(async (req: any, res: any) => {
  const endpoints = {
    authentication: {
      login: 'POST /v1/auth/login',
      logout: 'POST /v1/auth/logout',
      refresh: 'POST /v1/auth/refresh',
      profile: 'GET /v1/auth/profile'
    },
    credits: {
      balance: 'GET /v1/credits/balance',
      history: 'GET /v1/credits/history',
      analytics: 'GET /v1/credits/analytics',
      verify: 'GET /v1/credits/verify/:transactionId',
      reserve: 'POST /v1/credits/reserve',
      welcomeBonus: 'POST /v1/credits/welcome-bonus'
    },
    chat: {
      conversations: 'GET /v1/chat/conversations',
      createConversation: 'POST /v1/chat/conversations',
      getConversation: 'GET /v1/chat/conversations/:id',
      sendMessage: 'POST /v1/chat/conversations/:id/messages',
      agentTasks: 'POST /v1/chat/agent-tasks',
      taskStatus: 'GET /v1/chat/agent-tasks/:taskId'
    },
    models: {
      list: 'GET /v1/models',
      preferences: 'GET /v1/models/preferences',
      updatePreferences: 'PUT /v1/models/preferences',
      estimateCost: 'POST /v1/models/estimate-cost',
      analytics: 'GET /v1/models/:modelId/analytics',
      recommendations: 'GET /v1/models/recommendations'
    },
    images: {
      generate: 'POST /v1/images/generate',
      status: 'GET /v1/images/generate/:taskId',
      list: 'GET /v1/images',
      get: 'GET /v1/images/:imageId',
      delete: 'DELETE /v1/images/:imageId',
      batchDelete: 'POST /v1/images/batch-delete'
    },
    payments: {
      options: 'GET /v1/payments/options',
      traditional: 'POST /v1/payments/traditional',
      confirm: 'POST /v1/payments/confirm',
      crypto: 'POST /v1/payments/crypto',
      cryptoConnect: 'POST /v1/payments/crypto/connect',
      cryptoEstimate: 'POST /v1/payments/crypto/estimate',
      status: 'GET /v1/payments/status/:paymentId',
      history: 'GET /v1/payments/history'
    },
    admin: {
      users: 'GET /v1/admin/users',
      credits: 'GET /v1/admin/credits',
      payments: 'GET /v1/admin/payments',
      models: 'GET /v1/admin/models',
      analytics: 'GET /v1/admin/analytics'
    },
    monitoring: {
      health: 'GET /v1/monitoring/health',
      metrics: 'GET /v1/monitoring/metrics',
      logs: 'GET /v1/monitoring/logs'
    }
  };
  
  res.json({
    success: true,
    data: {
      endpoints,
      totalEndpoints: Object.values(endpoints).reduce((total, category) => total + Object.keys(category).length, 0),
      categories: Object.keys(endpoints)
    }
  });
}));

// API testing playground
docsRouter.get('/playground', asyncHandler(async (req: any, res: any) => {
  const playgroundHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>API Testing Playground</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .endpoint { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
    .method { display: inline-block; padding: 5px 10px; color: white; border-radius: 3px; font-weight: bold; }
    .get { background-color: #61affe; }
    .post { background-color: #49cc90; }
    .put { background-color: #fca130; }
    .delete { background-color: #f93e3e; }
    textarea { width: 100%; height: 100px; margin: 10px 0; }
    button { padding: 10px 20px; background-color: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer; }
    .response { background-color: #f8f9fa; padding: 10px; border-radius: 3px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>API Testing Playground</h1>
    <p>Test API endpoints directly from your browser. Make sure to include your Firebase ID token in the Authorization header.</p>
    
    <div class="endpoint">
      <h3><span class="method get">GET</span> /v1/credits/balance</h3>
      <p>Get current credit balance</p>
      <button onclick="testEndpoint('GET', '/v1/credits/balance')">Test</button>
      <div id="response-credits-balance" class="response" style="display: none;"></div>
    </div>
    
    <div class="endpoint">
      <h3><span class="method get">GET</span> /v1/models</h3>
      <p>Get available AI models</p>
      <button onclick="testEndpoint('GET', '/v1/models')">Test</button>
      <div id="response-models" class="response" style="display: none;"></div>
    </div>
    
    <div class="endpoint">
      <h3><span class="method post">POST</span> /v1/chat/conversations</h3>
      <p>Start new conversation</p>
      <textarea id="body-chat-conversations" placeholder='{"title": "Test Conversation", "initialMessage": "Hello, AI!"}'></textarea>
      <button onclick="testEndpoint('POST', '/v1/chat/conversations', 'body-chat-conversations')">Test</button>
      <div id="response-chat-conversations" class="response" style="display: none;"></div>
    </div>
    
    <div class="endpoint">
      <h3><span class="method post">POST</span> /v1/images/generate</h3>
      <p>Generate image</p>
      <textarea id="body-images-generate" placeholder='{"prompt": "A beautiful sunset over mountains", "size": "1024x1024", "quality": "standard"}'></textarea>
      <button onclick="testEndpoint('POST', '/v1/images/generate', 'body-images-generate')">Test</button>
      <div id="response-images-generate" class="response" style="display: none;"></div>
    </div>
    
    <div style="margin-top: 30px;">
      <h3>Authentication</h3>
      <p>Enter your Firebase ID token:</p>
      <input type="text" id="auth-token" placeholder="Firebase ID Token" style="width: 100%; padding: 10px;">
    </div>
  </div>
  
  <script>
    async function testEndpoint(method, endpoint, bodyElementId = null) {
      const token = document.getElementById('auth-token').value;
      const responseElementId = 'response-' + endpoint.replace(/\//g, '-').replace(/^-v1-/, '');
      const responseElement = document.getElementById(responseElementId);
      
      const options = {
        method: method,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      if (token) {
        options.headers['Authorization'] = 'Bearer ' + token;
      }
      
      if (bodyElementId && method !== 'GET') {
        const bodyElement = document.getElementById(bodyElementId);
        if (bodyElement && bodyElement.value) {
          try {
            options.body = bodyElement.value;
          } catch (e) {
            responseElement.innerHTML = '<strong>Error:</strong> Invalid JSON in request body';
            responseElement.style.display = 'block';
            return;
          }
        }
      }
      
      try {
        responseElement.innerHTML = 'Loading...';
        responseElement.style.display = 'block';
        
        const response = await fetch(endpoint, options);
        const data = await response.json();
        
        responseElement.innerHTML = '<strong>Status:</strong> ' + response.status + '<br><strong>Response:</strong><pre>' + JSON.stringify(data, null, 2) + '</pre>';
      } catch (error) {
        responseElement.innerHTML = '<strong>Error:</strong> ' + error.message;
      }
    }
  </script>
</body>
</html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.send(playgroundHtml);
}));

export { docsRouter };