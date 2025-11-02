#!/bin/bash

# Development Deployment Script for Integrated Credit System
# This script deploys to development environment for testing

set -e  # Exit on any error

echo "🚀 Starting development deployment for Integrated Credit System..."

# Set development environment
export NODE_ENV=development
export FIREBASE_PROJECT=sports-news-5fd0a-dev

echo "📋 Environment: $NODE_ENV"
echo "📋 Project: $FIREBASE_PROJECT"

# Quick build and deploy
echo "🔨 Building..."
npm run build

echo "🚀 Deploying to development..."
firebase use $FIREBASE_PROJECT --add

firebase deploy \
    --only functions \
    --project $FIREBASE_PROJECT

echo "✅ Development deployment completed!"