#!/bin/bash

# Production Deployment Script for Integrated Credit System
# This script deploys the Firebase Functions with production configuration

set -e  # Exit on any error

echo "🚀 Starting production deployment for Integrated Credit System..."

# Check if we're in the functions directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must run from functions directory"
    exit 1
fi

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Error: Firebase CLI not installed. Run: npm install -g firebase-tools"
    exit 1
fi

# Check if user is logged in to Firebase
if ! firebase projects:list &> /dev/null; then
    echo "❌ Error: Not logged in to Firebase. Run: firebase login"
    exit 1
fi

# Set production environment
export NODE_ENV=production
export FIREBASE_PROJECT=sports-news-5fd0a

echo "📋 Environment: $NODE_ENV"
echo "📋 Project: $FIREBASE_PROJECT"

# Validate environment variables
echo "🔍 Validating production environment variables..."
if [ -z "$NEBIUS_API_KEY" ]; then
    echo "⚠️  Warning: NEBIUS_API_KEY not set. Set via: firebase functions:config:set nebius.api_key=YOUR_KEY"
fi

if [ -z "$STRIPE_SECRET_KEY" ]; then
    echo "⚠️  Warning: STRIPE_SECRET_KEY not set. Set via: firebase functions:config:set stripe.secret_key=YOUR_KEY"
fi

# Clean and build
echo "🧹 Cleaning previous build..."
rm -rf lib/
rm -rf node_modules/.cache/

echo "📦 Installing production dependencies..."
npm ci --only=production

echo "🔨 Building TypeScript..."
npm run build:core

# Run production tests
echo "🧪 Running production validation tests..."
npm run test -- --testPathPattern="build-verification|security" --passWithNoTests

# Deploy with production configuration
echo "🚀 Deploying to production..."
firebase use $FIREBASE_PROJECT

# Deploy functions with production memory and timeout settings
firebase deploy \
    --only functions \
    --force \
    --project $FIREBASE_PROJECT

# Deploy Firestore rules and indexes
echo "📋 Deploying Firestore security rules..."
firebase deploy --only firestore:rules --project $FIREBASE_PROJECT

echo "📋 Deploying Firestore indexes..."
firebase deploy --only firestore:indexes --project $FIREBASE_PROJECT

# Deploy Realtime Database rules
echo "📋 Deploying Realtime Database rules..."
firebase deploy --only database --project $FIREBASE_PROJECT

# Verify deployment
echo "✅ Verifying deployment..."
sleep 10

# Test critical endpoints
echo "🔍 Testing critical endpoints..."
FUNCTION_URL="https://us-central1-$FIREBASE_PROJECT.cloudfunctions.net"

# Test health endpoint
if curl -f -s "$FUNCTION_URL/api/health" > /dev/null; then
    echo "✅ Health endpoint responding"
else
    echo "❌ Health endpoint not responding"
    exit 1
fi

echo "🎉 Production deployment completed successfully!"
echo "📊 Monitor at: https://console.firebase.google.com/project/$FIREBASE_PROJECT"
echo "📈 Functions logs: firebase functions:log --project $FIREBASE_PROJECT"