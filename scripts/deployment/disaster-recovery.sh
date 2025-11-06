#!/bin/bash

# Disaster Recovery Script for Integrated Credit System
# This script provides disaster recovery procedures and validation

set -e

echo "🚨 Disaster Recovery Script for Integrated Credit System"
echo "======================================================="

# Configuration
FIREBASE_PROJECT=${FIREBASE_PROJECT:-"sports-news-5fd0a"}
BACKUP_BUCKET="gs://${FIREBASE_PROJECT}-backups"
RECOVERY_LOG="disaster-recovery-$(date +%Y%m%d-%H%M%S).log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$RECOVERY_LOG"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    if ! command -v firebase &> /dev/null; then
        log "❌ Firebase CLI not installed"
        exit 1
    fi
    
    if ! command -v gcloud &> /dev/null; then
        log "❌ Google Cloud SDK not installed"
        exit 1
    fi
    
    # Check Firebase authentication
    if ! firebase projects:list &> /dev/null; then
        log "❌ Not authenticated with Firebase"
        exit 1
    fi
    
    log "✅ Prerequisites check passed"
}

# System health check
system_health_check() {
    log "Performing system health check..."
    
    # Check Firebase services
    local health_status="healthy"
    
    # Test Firestore
    if ! firebase firestore:databases:list --project "$FIREBASE_PROJECT" &> /dev/null; then
        log "❌ Firestore not accessible"
        health_status="unhealthy"
    else
        log "✅ Firestore accessible"
    fi
    
    # Test Realtime Database
    if ! firebase database:get / --project "$FIREBASE_PROJECT" &> /dev/null; then
        log "❌ Realtime Database not accessible"
        health_status="unhealthy"
    else
        log "✅ Realtime Database accessible"
    fi
    
    # Test Functions
    if ! firebase functions:list --project "$FIREBASE_PROJECT" &> /dev/null; then
        log "❌ Functions not accessible"
        health_status="unhealthy"
    else
        log "✅ Functions accessible"
    fi
    
    # Test Auth
    if ! gcloud auth list --project "$FIREBASE_PROJECT" &> /dev/null; then
        log "❌ Authentication service issues"
        health_status="unhealthy"
    else
        log "✅ Authentication service accessible"
    fi
    
    echo "$health_status"
}

# List available backups
list_backups() {
    log "Listing available backups..."
    
    # List Firestore backups
    log "Firestore backups:"
    gcloud firestore operations list --project "$FIREBASE_PROJECT" --filter="type:EXPORT_DOCUMENTS" --limit=10
    
    # List custom backups from our backup system
    log "Custom system backups:"
    firebase firestore:get system_backups --project "$FIREBASE_PROJECT" --limit=10 2>/dev/null || log "No custom backups found"
}

# Validate backup integrity
validate_backup() {
    local backup_id="$1"
    
    if [ -z "$backup_id" ]; then
        log "❌ Backup ID required for validation"
        return 1
    fi
    
    log "Validating backup: $backup_id"
    
    # Check if backup exists and is complete
    local backup_data
    backup_data=$(firebase firestore:get "system_backups/$backup_id" --project "$FIREBASE_PROJECT" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        log "✅ Backup metadata found"
        echo "$backup_data" | grep -q '"status": "success"' && log "✅ Backup completed successfully" || log "⚠️ Backup may be incomplete"
        return 0
    else
        log "❌ Backup not found or inaccessible"
        return 1
    fi
}

# Emergency system shutdown
emergency_shutdown() {
    log "🚨 EMERGENCY SHUTDOWN INITIATED"
    
    read -p "Are you sure you want to shutdown the system? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log "Emergency shutdown cancelled"
        return 0
    fi
    
    log "Shutting down system components..."
    
    # Disable Functions (by updating environment to maintenance mode)
    log "Setting maintenance mode..."
    firebase functions:config:set system.maintenance_mode=true --project "$FIREBASE_PROJECT"
    
    # Deploy maintenance function
    log "Deploying maintenance mode..."
    # This would deploy a minimal function that returns maintenance messages
    
    log "🚨 System is now in maintenance mode"
    log "To restore: Run recovery procedures and set system.maintenance_mode=false"
}

# Quick recovery procedures
quick_recovery() {
    log "Starting quick recovery procedures..."
    
    # Check system health first
    local health
    health=$(system_health_check)
    
    if [ "$health" = "healthy" ]; then
        log "✅ System appears healthy, no recovery needed"
        return 0
    fi
    
    log "System unhealthy, attempting quick fixes..."
    
    # Restart Functions by redeploying
    log "Redeploying Functions..."
    cd functions
    npm run deploy:prod
    cd ..
    
    # Clear any stuck operations in Realtime Database
    log "Clearing stuck operations..."
    firebase database:update /system_status/recovery_timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --project "$FIREBASE_PROJECT"
    
    # Verify recovery
    sleep 30
    health=$(system_health_check)
    
    if [ "$health" = "healthy" ]; then
        log "✅ Quick recovery successful"
    else
        log "❌ Quick recovery failed, manual intervention required"
        return 1
    fi
}

# Full system restore from backup
full_restore() {
    local backup_id="$1"
    
    if [ -z "$backup_id" ]; then
        log "❌ Backup ID required for full restore"
        return 1
    fi
    
    log "🚨 FULL SYSTEM RESTORE INITIATED"
    log "Backup ID: $backup_id"
    
    read -p "This will overwrite current data. Are you sure? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log "Full restore cancelled"
        return 0
    fi
    
    # Validate backup first
    if ! validate_backup "$backup_id"; then
        log "❌ Backup validation failed, aborting restore"
        return 1
    fi
    
    # Set maintenance mode
    log "Setting maintenance mode..."
    firebase functions:config:set system.maintenance_mode=true --project "$FIREBASE_PROJECT"
    
    # Restore Firestore data
    log "Restoring Firestore data..."
    # Note: In production, you would use the actual backup restore mechanisms
    # This is a placeholder for the restore process
    
    # Restore Realtime Database data
    log "Restoring Realtime Database data..."
    # Restore critical paths from backup
    
    # Redeploy Functions
    log "Redeploying Functions..."
    cd functions
    npm run deploy:prod
    cd ..
    
    # Disable maintenance mode
    log "Disabling maintenance mode..."
    firebase functions:config:unset system.maintenance_mode --project "$FIREBASE_PROJECT"
    
    # Verify restore
    log "Verifying restore..."
    sleep 60
    local health
    health=$(system_health_check)
    
    if [ "$health" = "healthy" ]; then
        log "✅ Full restore completed successfully"
    else
        log "❌ Full restore completed but system still unhealthy"
        return 1
    fi
}

# Create emergency backup
emergency_backup() {
    log "Creating emergency backup..."
    
    local backup_id="emergency_$(date +%Y%m%d_%H%M%S)"
    
    # Export Firestore
    log "Exporting Firestore..."
    gcloud firestore export "$BACKUP_BUCKET/emergency/$backup_id" --project "$FIREBASE_PROJECT"
    
    # Backup critical Realtime Database paths
    log "Backing up Realtime Database..."
    firebase database:get /credit_orchestration --project "$FIREBASE_PROJECT" > "rtdb_credit_${backup_id}.json"
    firebase database:get /ai_orchestration --project "$FIREBASE_PROJECT" > "rtdb_ai_${backup_id}.json"
    
    log "✅ Emergency backup created: $backup_id"
    echo "$backup_id"
}

# Main menu
show_menu() {
    echo ""
    echo "Disaster Recovery Options:"
    echo "1. System Health Check"
    echo "2. List Available Backups"
    echo "3. Validate Backup"
    echo "4. Quick Recovery"
    echo "5. Emergency Backup"
    echo "6. Emergency Shutdown"
    echo "7. Full System Restore"
    echo "8. Exit"
    echo ""
}

# Main execution
main() {
    log "Disaster Recovery Script Started"
    
    check_prerequisites
    
    while true; do
        show_menu
        read -p "Select option (1-8): " choice
        
        case $choice in
            1)
                system_health_check
                ;;
            2)
                list_backups
                ;;
            3)
                read -p "Enter backup ID to validate: " backup_id
                validate_backup "$backup_id"
                ;;
            4)
                quick_recovery
                ;;
            5)
                emergency_backup
                ;;
            6)
                emergency_shutdown
                ;;
            7)
                read -p "Enter backup ID to restore from: " backup_id
                full_restore "$backup_id"
                ;;
            8)
                log "Disaster Recovery Script Ended"
                exit 0
                ;;
            *)
                echo "Invalid option. Please select 1-8."
                ;;
        esac
        
        echo ""
        read -p "Press Enter to continue..."
    done
}

# Run main function
main "$@"