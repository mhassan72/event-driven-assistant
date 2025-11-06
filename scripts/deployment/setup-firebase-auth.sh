#!/bin/bash

# Firebase Auth Production Setup Script
# This script configures Firebase Auth for production use

set -e

echo "🔐 Setting up Firebase Auth for production..."

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Error: Firebase CLI not installed"
    exit 1
fi

# Set project
firebase use sports-news-5fd0a

echo "📋 Firebase Auth Configuration Instructions:"
echo ""
echo "1. Go to Firebase Console: https://console.firebase.google.com/project/sports-news-5fd0a/authentication"
echo "2. Enable the following sign-in methods:"
echo "   - Email/Password"
echo "   - Google"
echo "   - Anonymous (for guest users)"
echo ""
echo "3. Configure authorized domains:"
echo "   - localhost (for development)"
echo "   - your-production-domain.com"
echo ""
echo "4. Set up password policy:"
echo "   - Minimum 8 characters"
echo "   - Require uppercase, lowercase, number"
echo ""
echo "5. Configure user management:"
echo "   - Enable email verification"
echo "   - Set up password reset templates"
echo ""
echo "6. Set up custom claims for admin users:"
echo "   - Use Firebase Admin SDK to set admin claims"
echo ""

# Create custom claims setup script
cat > functions/scripts/setup-admin-claims.js << 'EOF'
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

async function setAdminClaim(email) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`✅ Admin claim set for ${email}`);
  } catch (error) {
    console.error(`❌ Error setting admin claim for ${email}:`, error);
  }
}

// Set admin claims for specified emails
const adminEmails = [
  // Add admin email addresses here
  // 'admin@yourdomain.com'
];

async function setupAdminUsers() {
  for (const email of adminEmails) {
    await setAdminClaim(email);
  }
  process.exit(0);
}

setupAdminUsers();
EOF

echo "✅ Firebase Auth setup instructions provided!"
echo "📝 Edit functions/scripts/setup-admin-claims.js to add admin emails"
echo "🚀 Run: node functions/scripts/setup-admin-claims.js (after deployment)"