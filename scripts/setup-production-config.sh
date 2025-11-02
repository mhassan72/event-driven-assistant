#!/bin/bash

# Production Configuration Setup Script
# This script sets up Firebase Functions configuration for production

set -e

echo "🔧 Setting up production configuration for Integrated Credit System..."

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Error: Firebase CLI not installed. Run: npm install -g firebase-tools"
    exit 1
fi

# Set project
firebase use sports-news-5fd0a

echo "🔑 Setting up Firebase Functions configuration..."

# Prompt for required secrets
echo "Please provide the following production secrets:"

read -p "Nebius API Key: " NEBIUS_API_KEY
read -s -p "Stripe Secret Key: " STRIPE_SECRET_KEY
echo
read -s -p "Stripe Webhook Secret: " STRIPE_WEBHOOK_SECRET
echo
read -s -p "JWT Secret (32+ characters): " JWT_SECRET
echo
read -s -p "Encryption Key (32+ characters): " ENCRYPTION_KEY
echo

# Set Firebase Functions configuration
echo "🔧 Setting Firebase Functions config..."

firebase functions:config:set \
  nebius.api_key="$NEBIUS_API_KEY" \
  stripe.secret_key="$STRIPE_SECRET_KEY" \
  stripe.webhook_secret="$STRIPE_WEBHOOK_SECRET" \
  security.jwt_secret="$JWT_SECRET" \
  security.encryption_key="$ENCRYPTION_KEY"

# Set additional configuration
firebase functions:config:set \
  app.environment="production" \
  app.log_level="info" \
  credit.welcome_bonus="1000" \
  credit.min_purchase="21" \
  credit.usd_rate="0.024" \
  payment.web3_enabled="true" \
  monitoring.enabled="true"

echo "✅ Production configuration completed!"
echo "📋 View config: firebase functions:config:get"
echo "🚀 Ready for production deployment!"