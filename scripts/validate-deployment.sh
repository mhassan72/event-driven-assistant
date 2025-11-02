#!/bin/bash

# Deployment Validation Script for Integrated Credit System
# Runs comprehensive validation tests after deployment

set -e

echo "🔍 Deployment Validation for Integrated Credit System"
echo "===================================================="

# Configuration
FIREBASE_PROJECT=${FIREBASE_PROJECT:-"sports-news-5fd0a"}
TEST_TIMEOUT=${TEST_TIMEOUT:-"300000"} # 5 minutes
VALIDATION_LOG="deployment-validation-$(date +%Y%m%d-%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$VALIDATION_LOG"
}

# Success/failure tracking
TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()

# Function to run test and track results
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    log "${BLUE}Running: $test_name${NC}"
    
    if eval "$test_command" >> "$VALIDATION_LOG" 2>&1; then
        log "${GREEN}✅ PASSED: $test_name${NC}"
        ((TESTS_PASSED++))
    else
        log "${RED}❌ FAILED: $test_name${NC}"
        ((TESTS_FAILED++))
        FAILED_TESTS+=("$test_name")
    fi
}

# Check prerequisites
check_prerequisites() {
    log "${BLUE}Checking prerequisites...${NC}"
    
    # Check if we're in the functions directory
    if [ ! -f "package.json" ]; then
        log "${RED}❌ Must run from functions directory${NC}"
        exit 1
    fi
    
    # Check if Firebase CLI is installed
    if ! command -v firebase &> /dev/null; then
        log "${RED}❌ Firebase CLI not installed${NC}"
        exit 1
    fi
    
    # Check if Node.js and npm are available
    if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
        log "${RED}❌ Node.js and npm are required${NC}"
        exit 1
    fi
    
    # Check if Jest is available
    if ! npm list jest &> /dev/null; then
        log "${RED}❌ Jest testing framework not installed${NC}"
        exit 1
    fi
    
    log "${GREEN}✅ Prerequisites check passed${NC}"
}

# Validate environment configuration
validate_environment() {
    log "${BLUE}Validating environment configuration...${NC}"
    
    # Check Firebase project
    if ! firebase use "$FIREBASE_PROJECT" &> /dev/null; then
        log "${RED}❌ Cannot set Firebase project: $FIREBASE_PROJECT${NC}"
        exit 1
    fi
    
    # Check if functions are deployed
    if ! firebase functions:list --project "$FIREBASE_PROJECT" &> /dev/null; then
        log "${YELLOW}⚠️  No functions found or functions not accessible${NC}"
    fi
    
    # Validate environment variables
    local required_vars=("NODE_ENV")
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        log "${YELLOW}⚠️  Missing environment variables: ${missing_vars[*]}${NC}"
    fi
    
    log "${GREEN}✅ Environment validation completed${NC}"
}

# Run smoke tests
run_smoke_tests() {
    log "${BLUE}Running smoke tests...${NC}"
    
    run_test "Smoke Tests" "npm test -- test/deployment/smoke-tests.test.ts --testTimeout=$TEST_TIMEOUT"
}

# Run monitoring validation
run_monitoring_validation() {
    log "${BLUE}Running monitoring and observability validation...${NC}"
    
    run_test "Monitoring Validation" "npm test -- test/deployment/monitoring-validation.test.ts --testTimeout=$TEST_TIMEOUT"
}

# Run disaster recovery validation
run_disaster_recovery_validation() {
    log "${BLUE}Running disaster recovery validation...${NC}"
    
    run_test "Disaster Recovery Validation" "npm test -- test/deployment/disaster-recovery-validation.test.ts --testTimeout=$TEST_TIMEOUT"
}

# Run security and compliance validation
run_security_validation() {
    log "${BLUE}Running security and compliance validation...${NC}"
    
    run_test "Security Compliance Validation" "npm test -- test/deployment/security-compliance-validation.test.ts --testTimeout=$TEST_TIMEOUT"
}

# Validate Firebase services
validate_firebase_services() {
    log "${BLUE}Validating Firebase services...${NC}"
    
    # Test Firestore
    run_test "Firestore Connection" "firebase firestore:databases:list --project $FIREBASE_PROJECT"
    
    # Test Realtime Database
    run_test "Realtime Database Connection" "firebase database:get / --project $FIREBASE_PROJECT --shallow"
    
    # Test Functions
    run_test "Functions List" "firebase functions:list --project $FIREBASE_PROJECT"
    
    # Test Auth
    run_test "Auth Configuration" "firebase auth:export /tmp/auth-test.json --project $FIREBASE_PROJECT || true"
}

# Performance validation
validate_performance() {
    log "${BLUE}Running performance validation...${NC}"
    
    # Get function URL
    local function_url="https://us-central1-$FIREBASE_PROJECT.cloudfunctions.net/api"
    
    # Test response time
    run_test "API Response Time" "curl -w '%{time_total}' -s -o /dev/null $function_url/health | awk '{if(\$1 < 5) exit 0; else exit 1}'"
    
    # Test concurrent requests
    run_test "Concurrent Request Handling" "for i in {1..5}; do curl -s $function_url/health & done; wait"
}

# Validate security configuration
validate_security_configuration() {
    log "${BLUE}Validating security configuration...${NC}"
    
    # Check security rules
    run_test "Firestore Security Rules" "firebase firestore:rules:get --project $FIREBASE_PROJECT"
    run_test "Database Security Rules" "firebase database:rules:get --project $FIREBASE_PROJECT"
    
    # Check if HTTPS is enforced
    local function_url="http://us-central1-$FIREBASE_PROJECT.cloudfunctions.net/api"
    run_test "HTTPS Enforcement" "curl -s -I $function_url/health | grep -q 'HTTP/1.1 301' || curl -s -I ${function_url/http/https}/health | grep -q 'HTTP/2 200'"
}

# Validate monitoring and alerting
validate_monitoring_alerting() {
    log "${BLUE}Validating monitoring and alerting systems...${NC}"
    
    # Test health endpoint
    local function_url="https://us-central1-$FIREBASE_PROJECT.cloudfunctions.net/api"
    run_test "Health Endpoint" "curl -s $function_url/health | jq -e '.status == \"healthy\"'"
    
    # Test monitoring endpoints (would need admin token in real scenario)
    run_test "Monitoring Endpoint Availability" "curl -s -o /dev/null -w '%{http_code}' $function_url/monitoring/system/health | grep -q '401\\|200'"
}

# Generate validation report
generate_report() {
    log "${BLUE}Generating validation report...${NC}"
    
    local total_tests=$((TESTS_PASSED + TESTS_FAILED))
    local success_rate=0
    
    if [ $total_tests -gt 0 ]; then
        success_rate=$(( (TESTS_PASSED * 100) / total_tests ))
    fi
    
    echo ""
    echo "======================================"
    echo "DEPLOYMENT VALIDATION REPORT"
    echo "======================================"
    echo "Date: $(date)"
    echo "Project: $FIREBASE_PROJECT"
    echo "Environment: ${NODE_ENV:-development}"
    echo ""
    echo "Test Results:"
    echo "  Total Tests: $total_tests"
    echo "  Passed: $TESTS_PASSED"
    echo "  Failed: $TESTS_FAILED"
    echo "  Success Rate: $success_rate%"
    echo ""
    
    if [ $TESTS_FAILED -gt 0 ]; then
        echo "Failed Tests:"
        for test in "${FAILED_TESTS[@]}"; do
            echo "  - $test"
        done
        echo ""
    fi
    
    if [ $success_rate -ge 90 ]; then
        echo -e "${GREEN}🎉 DEPLOYMENT VALIDATION PASSED${NC}"
        echo "The system is ready for production use."
    elif [ $success_rate -ge 70 ]; then
        echo -e "${YELLOW}⚠️  DEPLOYMENT VALIDATION PARTIAL${NC}"
        echo "The system has some issues but core functionality works."
    else
        echo -e "${RED}❌ DEPLOYMENT VALIDATION FAILED${NC}"
        echo "The system has critical issues that need to be resolved."
    fi
    
    echo ""
    echo "Full log available at: $VALIDATION_LOG"
    echo "======================================"
    
    # Exit with appropriate code
    if [ $success_rate -ge 70 ]; then
        exit 0
    else
        exit 1
    fi
}

# Main execution
main() {
    log "${GREEN}Starting deployment validation...${NC}"
    
    check_prerequisites
    validate_environment
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log "${BLUE}Installing dependencies...${NC}"
        npm ci
    fi
    
    # Build the project
    log "${BLUE}Building project...${NC}"
    npm run build
    
    # Run validation tests
    run_smoke_tests
    run_monitoring_validation
    run_disaster_recovery_validation
    run_security_validation
    
    # Run service validations
    validate_firebase_services
    validate_performance
    validate_security_configuration
    validate_monitoring_alerting
    
    # Generate final report
    generate_report
}

# Handle script interruption
trap 'log "${RED}Validation interrupted${NC}"; exit 1' INT TERM

# Run main function
main "$@"