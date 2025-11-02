#!/bin/bash

# Staging Deployment Script for Integrated Credit System
# This script deploys to staging environment for testing

set -e  # Exit on any error

echo "🚀 Starting staging deployment for Integrated Credit System..."

# Check if we're in the functions directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must run from functions directory"
    exit 1
fi

# Set staging environment
export NODE_ENV=staging
export FIREBASE_PROJECT=sports-news-5fd0a-staging

echo "📋 Environment: $NODE_ENV"
echo "📋 Project: $FIREBASE_PROJECT"

# Clean and build
echo "🧹 Cleaning previous build..."
rm -rf lib/

echo "📦 Installing dependencies..."
npm ci

echo "🔨 Building TypeScript..."
npm run build

# Run comprehensive tests
echo "🧪 Running staging tests..."
npm run test:all

# Deploy with staging configuration
echo "🚀 Deploying to staging..."
firebase use $FIREBASE_PROJECT --add

firebase deploy \
    --only functions,firestore:rules,firestore:indexes,database \
    --project $FIREBASE_PROJECT

echo "✅ Staging deployment completed!"
echo "🔗 Staging URL: https://us-central1-$FIREBASE_PROJECT.cloudfunctions.net"