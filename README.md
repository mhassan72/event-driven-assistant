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

## 🏗️ Architecture

### System Components
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client Apps   │    │  Firebase Auth   │    │  Express API    │
│  (Web/Mobile)   │───▶│  Authentication  │───▶│   Gateway       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
┌─────────────────────────────────────────────────────────────────┐
│                Firebase Realtime Database                       │
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
│ (LangChain) │        │   Service   │        │   Service   │
└─────────────┘        └─────────────┘        └─────────────┘
        │                       │                       │
┌─────────────┐        ┌─────────────┐        ┌─────────────┐
│ AI Models   │        │  Firestore  │        │  External   │
│ (OpenAI     │        │ (Blockchain │        │  Payment    │
│ Compatible) │        │   Ledger)   │        │  Providers  │
└─────────────┘        └─────────────┘        └─────────────┘
```

### Supported AI Models
- **Text Generation**: `meta-llama/Meta-Llama-3.1-8B-Instruct`, `google/gemma-2-2b-it`
- **Vision Models**: `google/gemma-3-27b-it`, `Qwen/Qwen2.5-VL-72B-Instruct`, `nvidia/Nemotron-Nano-V2-12b`
- **Image Generation**: `black-forest-labs/flux-schnell`, `black-forest-labs/flux-dev`
- **Embeddings**: `BAAI/bge-en-icl`

## 🛠️ Technology Stack

- **Backend**: Firebase Functions Gen 2, Express.js, TypeScript
- **Authentication**: Firebase Auth
- **Database**: Firebase Realtime Database (orchestration), Firestore (persistence)
- **AI Framework**: LangChain, LangGraph
- **Payments**: Stripe, PayPal, Web3 wallets
- **Security**: Blockchain-style cryptographic ledger
- **Testing**: Jest, Firebase Emulator Suite

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
│   │   ├── orchestration/            # Event orchestration
│   │   ├── config/                   # Configuration
│   │   ├── container/                # Dependency injection
│   │   └── utils/                    # Utilities
│   └── functions.ts                  # Firebase Functions definitions
├── test/                             # Tests mirroring src structure
└── .kiro/specs/integrated-credit-system/  # Implementation spec
```

## 🚦 Getting Started

### Prerequisites
- Node.js 18+
- Firebase CLI
- Firebase project with Functions, Auth, Realtime Database, and Firestore enabled

### Installation
```bash
# Install dependencies
npm install

# Set up Firebase emulators
firebase init emulators

# Configure environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Development
```bash
# Start Firebase emulators
npm run emulators

# Run tests
npm test

# Deploy to Firebase
npm run deploy
```

## 📋 Implementation Plan

The system is built following a comprehensive spec located in `.kiro/specs/integrated-credit-system/`. The implementation is organized into 16 major phases:

1. **Firebase Infrastructure Setup** - Core Firebase configuration
2. **Data Models & Types** - TypeScript interfaces and models
3. **Realtime Database Orchestration** - Central coordination system
4. **Firebase Auth Integration** - Authentication and authorization
5. **Dynamic Model Management** - AI model configuration and selection
6. **AI Assistant Core** - LangChain/LangGraph integration
7. **Agentic Cloud Functions** - Long-running AI task execution
8. **Credit Management** - Blockchain-secured credit system
9. **Payment Processing** - Traditional and Web3 payments
10. **Express.js API Layer** - RESTful API with versioning
11. **Notifications & Alerts** - User and system notifications
12. **Admin & Monitoring** - Administrative tools and analytics
13. **User Interface** - Real-time UI components
14. **Error Handling** - Production-ready error management
15. **Integration Testing** - Comprehensive test suite
16. **Production Deployment** - Production configuration and monitoring

### Starting Implementation
To begin implementation, open `.kiro/specs/integrated-credit-system/tasks.md` and start with task 1. Each task includes:
- Clear implementation objectives
- Specific requirement references
- Detailed acceptance criteria
- Testing requirements

## 🔐 Security Features

- **Firebase Auth Integration**: Secure user authentication with multiple providers
- **Blockchain-style Ledger**: Immutable transaction records with cryptographic verification
- **API Security**: Rate limiting, request validation, and comprehensive middleware
- **Payment Security**: PCI-compliant payment processing with fraud detection
- **Data Protection**: Encrypted sensitive data with proper access controls

## 📊 Monitoring & Analytics

- **Real-time Dashboards**: System health and business metrics
- **Performance Monitoring**: API latency, function execution times, and error rates
- **Usage Analytics**: AI model usage, credit consumption, and user behavior
- **Financial Reporting**: Revenue tracking and payment analytics
- **Alerting**: Automated alerts for system issues and business events

## 🤝 Contributing

1. Follow the implementation spec in `.kiro/specs/integrated-credit-system/`
2. Maintain the feature-based architecture
3. Write comprehensive tests for all functionality
4. Follow clean code principles (OOP, DRY, dynamic configuration)
5. Ensure production-ready error handling and monitoring

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.