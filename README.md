# AI Assistant with Integrated Credit System

A production-ready, event-driven AI assistant application built on Firebase Functions Gen 2 with an integrated credit-based payment system. Users interact with intelligent AI agents powered by LangChain/LangGraph while consuming credits for each interaction, with seamless payment options for credit top-ups.

## 🚀 Features

### AI Assistant Capabilities
- **Intelligent Conversations**: Multi-model AI chat with context awareness and memory
- **Agentic AI Tasks**: Long-running tasks executed via cloud functions (research, code generation, analysis)
- **Image Generation**: Support for FLUX models (schnell and dev) with real-time progress tracking
- **Vision Analysis**: Advanced vision-language models for image understanding
- **Dynamic Model Selection**: User preference-based model selection with cost optimization

### Credit System
- **Pay-as-you-go Model**: Credit-based usage with transparent consumption tracking
- **Welcome Bonus**: 1000 free credits for new users ($24 value)
- **Real-time Balance**: Live credit balance updates and usage notifications
- **Blockchain Security**: Immutable transaction ledger with cryptographic verification
- **Multiple Payment Methods**: Traditional (Stripe/PayPal) and Web3 cryptocurrency payments

### Production Architecture
- **Firebase Functions Gen 2**: High-performance serverless backend
- **Express.js API**: Versioned REST API with comprehensive middleware
- **Firebase Auth**: Secure authentication with multiple providers
- **Realtime Database**: Central orchestration hub for workflows and real-time sync
- **Firestore**: Long-term data storage for users, models, and transactions
- **Event-Driven Design**: Saga patterns with comprehensive error handling
- **Orchestration System**: Advanced workflow coordination with retry mechanisms and failure recovery

## 🏗️ Architecture

### System Components
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client Apps   │    │  Authentication  │    │   REST API      │
│  (Web/Mobile)   │───▶│     Service      │───▶│   Gateway       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
┌─────────────────────────────────────────────────────────────────┐
│                   Real-time Database                            │
│                 (Central Orchestrator)                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │ Conversation│ │   Credit    │ │  Payment    │ │   User      ││
│  │   Manager   │ │Orchestrator │ │ Workflows   │ │ Sessions    ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
┌─────────────┐        ┌─────────────┐        ┌─────────────┐
│   AI Agent  │        │   Credit    │        │  Payment    │
│  Functions  │        │ Management  │        │ Processing  │
│ (Workflows) │        │   Service   │        │   Service   │
└─────────────┘        └─────────────┘        └─────────────┘
        │                       │                       │
┌─────────────┐        ┌─────────────┐        ┌─────────────┐
│ AI Models   │        │  Document   │        │  External   │
│ (Multi-     │        │  Database   │        │  Payment    │
│ Provider)   │        │ (Ledger)    │        │  Providers  │
└─────────────┘        └─────────────┘        └─────────────┘
```

### Supported AI Models
- **Text Generation**: GPT-compatible models, Meta Llama, Google Gemma
- **Vision Models**: Multi-modal vision-language models for image understanding
- **Image Generation**: FLUX models (schnell and dev variants)
- **Embeddings**: High-performance embedding models for semantic search

## 🛠️ Technology Stack

- **Backend**: Serverless functions, REST API, TypeScript
- **Authentication**: Multi-provider authentication system
- **Database**: Real-time database (orchestration), Document database (persistence)
- **AI Framework**: Advanced AI orchestration and workflow management
- **Payments**: Traditional payment processors and Web3 wallets
- **Security**: Cryptographic ledger with immutable transaction records
- **Testing**: Comprehensive test suite with emulation support

## 📁 Project Structure

```
functions/
├── src/
│   ├── api/                          # Express API layer
│   │   ├── v1/                       # Version 1 API routes
│   │   │   ├── chat.ts               # AI conversation endpoints
│   │   │   ├── credits.ts            # Credit management endpoints
│   │   │   ├── payments.ts           # Payment processing endpoints
│   │   │   ├── models.ts             # Model management endpoints
│   │   │   └── images.ts             # Image generation endpoints
│   │   └── middleware/               # API middleware
│   ├── features/                     # Feature-based modules
│   │   ├── ai-assistant/             # AI assistant with LangChain
│   │   ├── credit-management/        # Credit system
│   │   ├── payment-processing/       # Payment handling
│   │   ├── user-management/          # User operations
│   │   └── authentication/           # Auth services
│   ├── shared/                       # Shared infrastructure
│   │   ├── orchestration/            # Event orchestration system
│   │   │   ├── base-orchestrator.ts  # Abstract orchestrator foundation
│   │   │   ├── rtdb-orchestrator.ts  # Firebase RTDB orchestrator
│   │   │   ├── event-bus.ts          # Event bus with guaranteed delivery
│   │   │   ├── saga-manager.ts       # Distributed transaction management
│   │   │   └── operation-queue.ts    # Priority-based operation queue
│   │   ├── types/                    # TypeScript type definitions
│   │   │   └── orchestration.ts      # Orchestration system types
│   │   ├── config/                   # Configuration
│   │   ├── container/                # Dependency injection
│   │   └── utils/                    # Utilities
│   └── functions.ts                  # Firebase Functions definitions
└── test/                             # Tests mirroring src structure
```

## 🚦 Getting Started

### Prerequisites
- Node.js 18+
- Cloud platform CLI tools
- Cloud project with serverless functions, authentication, and database services enabled

### Installation
```bash
# Install dependencies
npm install

# Set up local development environment
npm run setup

# Configure environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Development
```bash
# Start local development environment
npm run dev

# Run tests
npm test

# Deploy to cloud
npm run deploy
```

## 📋 Implementation Plan

The system is built following a comprehensive implementation specification. The development is organized into 16 major phases:

1. **Cloud Infrastructure Setup** - Core cloud platform configuration
2. **Data Models & Types** - TypeScript interfaces and models
3. **✅ Realtime Database Orchestration** - Central coordination system *(COMPLETED)*
4. **Authentication Integration** - User authentication and authorization
5. **Dynamic Model Management** - AI model configuration and selection
6. **AI Assistant Core** - LangChain/LangGraph integration
7. **Agentic Cloud Functions** - Long-running AI task execution
8. **Credit Management** - Blockchain-secured credit system
9. **Payment Processing** - Traditional and Web3 payments
10. **REST API Layer** - RESTful API with versioning
11. **Notifications & Alerts** - User and system notifications
12. **Admin & Monitoring** - Administrative tools and analytics
13. **User Interface** - Real-time UI components
14. **Error Handling** - Production-ready error management
15. **Integration Testing** - Comprehensive test suite
16. **Production Deployment** - Production configuration and monitoring

### Current Implementation Status

**✅ Phase 3 - Realtime Database Orchestration System (COMPLETED)**
- Real-time database orchestrator service with workflow coordination
- Event bus with guaranteed delivery, retry mechanisms, and dead letter queues
- Saga manager for distributed transactions with compensation patterns
- Operation queue management with priority-based processing and failure recovery
- Comprehensive unit tests covering all orchestration components

### Next Steps
The implementation follows a structured development plan with each phase building upon the previous ones. Each task includes:
- Clear implementation objectives
- Specific requirement references
- Detailed acceptance criteria
- Testing requirements

## 🎯 Orchestration System

The application features a sophisticated orchestration system built on real-time database technology that coordinates all workflows and operations:

### Key Components
- **Central Orchestrator**: Coordination hub for AI tasks and credit operations
- **Event Bus**: Guaranteed message delivery with retry mechanisms and dead letter queues
- **Saga Manager**: Distributed transaction management with automatic compensation
- **Operation Queue**: Priority-based processing with exponential backoff retry
- **Real-time Sync**: Instant state synchronization across all connected clients

### Features
- **Workflow Coordination**: Orchestrates complex AI assistant and credit workflows
- **Security-based Routing**: Automatically routes operations to cloud functions or API endpoints
- **Failure Recovery**: Comprehensive error handling with saga compensation patterns
- **Event-Driven Architecture**: All components communicate through events with guaranteed delivery
- **Priority Processing**: Operations processed by priority with intelligent queuing
- **Monitoring & Metrics**: Extensive observability with health checks and performance tracking

## 🔐 Security Features

- **Multi-Provider Authentication**: Secure user authentication with multiple identity providers
- **Blockchain-style Ledger**: Immutable transaction records with cryptographic verification
- **API Security**: Rate limiting, request validation, and comprehensive middleware
- **Payment Security**: PCI-compliant payment processing with fraud detection
- **Data Protection**: Encrypted sensitive data with proper access controls
- **Orchestration Security**: Security-level based routing with audit trails

## 📊 Monitoring & Analytics

- **Real-time Dashboards**: System health and business metrics
- **Performance Monitoring**: API latency, function execution times, and error rates
- **Usage Analytics**: AI model usage, credit consumption, and user behavior
- **Financial Reporting**: Revenue tracking and payment analytics
- **Alerting**: Automated alerts for system issues and business events

## 🤝 Contributing

1. Follow the structured implementation specification
2. Maintain the feature-based architecture
3. Write comprehensive tests for all functionality
4. Follow clean code principles (OOP, DRY, dynamic configuration)
5. Ensure production-ready error handling and monitoring

## 📄 License

This project is proprietary and confidential. All rights reserved. Unauthorized copying, distribution, or use of this software is strictly prohibited.