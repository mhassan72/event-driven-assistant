/**
 * Automatic Failover and Disaster Recovery
 * Provides system resilience through automatic failover and recovery mechanisms
 */

import { Database } from 'firebase-admin/database';
import { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { IStructuredLogger } from '../observability/logger';
import { IMetricsCollector } from '../observability/metrics';

/**
 * Service health status
 */
export enum ServiceHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  CRITICAL = 'critical',
  UNKNOWN = 'unknown'
}

/**
 * Failover strategy
 */
export enum FailoverStrategy {
  IMMEDIATE = 'immediate',           // Immediate failover
  GRACEFUL = 'graceful',            // Graceful failover with cleanup
  MANUAL = 'manual',                // Manual intervention required
  CIRCUIT_BREAKER = 'circuit_breaker' // Circuit breaker pattern
}

/**
 * Recovery strategy
 */
export enum RecoveryStrategy {
  AUTOMATIC = 'automatic',          // Automatic recovery
  SEMI_AUTOMATIC = 'semi_automatic', // Automatic with confirmation
  MANUAL = 'manual'                 // Manual recovery only
}

/**
 * Service configuration
 */
export interface ServiceConfig {
  name: string;
  type: 'primary' | 'secondary' | 'backup';
  priority: number;
  
  // Health check configuration
  healthCheckUrl?: string;
  healthCheckInterval: number;
  healthCheckTimeout: number;
  
  // Failover configuration
  failoverStrategy: FailoverStrategy;
  failoverThreshold: number;        // Number of failures before failover
  failoverCooldown: number;         // Cooldown period after failover
  
  // Recovery configuration
  recoveryStrategy: RecoveryStrategy;
  recoveryCheckInterval: number;
  recoveryThreshold: number;        // Number of successful checks for recovery
  
  // Service-specific configuration
  endpoint?: string;
  credentials?: Record<string, any>;
  metadata: Record<string, any>;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  service: string;
  status: ServiceHealthStatus;
  responseTime: number;
  timestamp: Date;
  details: Record<string, any>;
  error?: string;
}

/**
 * Failover event
 */
export interface FailoverEvent {
  id: string;
  fromService: string;
  toService: string;
  reason: string;
  strategy: FailoverStrategy;
  timestamp: Date;
  duration?: number;
  success: boolean;
  metadata: Record<string, any>;
}

/**
 * Recovery event
 */
export interface RecoveryEvent {
  id: string;
  service: string;
  strategy: RecoveryStrategy;
  timestamp: Date;
  duration?: number;
  success: boolean;
  metadata: Record<string, any>;
}

/**
 * Service registry entry
 */
export interface ServiceRegistryEntry {
  config: ServiceConfig;
  currentStatus: ServiceHealthStatus;
  lastHealthCheck: Date;
  failureCount: number;
  lastFailover?: Date;
  isActive: boolean;
  healthHistory: HealthCheckResult[];
}

/**
 * Failover and Recovery Manager
 */
export class FailoverRecoveryManager {
  private realtimeDB: Database;
  private _firestore: Firestore;
  private logger: IStructuredLogger;
  private _metrics: IMetricsCollector;
  
  // Service registry
  private services: Map<string, ServiceRegistryEntry> = new Map();
  private activeServices: Map<string, string> = new Map(); // service type -> active service name
  
  // Health monitoring
  private healthCheckTimers: Map<string, NodeJS.Timeout> = new Map();
  private recoveryCheckTimers: Map<string, NodeJS.Timeout> = new Map();
  
  // Event tracking
  private failoverEvents: FailoverEvent[] = [];
  private recoveryEvents: RecoveryEvent[] = [];
  
  constructor(dependencies: {
    realtimeDB: Database;
    firestore: Firestore;
    logger: IStructuredLogger;
    metrics: IMetricsCollector;
  }) {
    this.realtimeDB = dependencies.realtimeDB;
    this._firestore = dependencies.firestore;
    this.logger = dependencies.logger;
    this._metrics = dependencies.metrics;
    
    this.initializeFailoverManager();
  }
  
  /**
   * Initialize failover manager
   */
  private async initializeFailoverManager(): Promise<void> {
    this.logger.info('Initializing Failover Recovery Manager');
    
    // Load service configurations from Firestore
    await this.loadServiceConfigurations();
    
    // Start health monitoring for all services
    this.startHealthMonitoring();
    
    // Setup periodic cleanup
    setInterval(() => {
      this.cleanupOldEvents();
    }, 60 * 60 * 1000); // Every hour
  }
  
  /**
   * Register service for failover management
   */
  async registerService(config: ServiceConfig): Promise<void> {
    try {
      this.logger.info('Registering service for failover management', {
        serviceName: config.name,
        serviceType: config.type,
        priority: config.priority
      });
      
      // Create registry entry
      const registryEntry: ServiceRegistryEntry = {
        config,
        currentStatus: ServiceHealthStatus.UNKNOWN,
        lastHealthCheck: new Date(),
        failureCount: 0,
        isActive: config.type === 'primary',
        healthHistory: []
      };
      
      this.services.set(config.name, registryEntry);
      
      // Set as active if it's the highest priority service of its type
      await this.updateActiveService(config);
      
      // Persist to Firestore
      await this._firestore.collection('service_registry').doc(config.name).set({
        ...config,
        registeredAt: new Date().toISOString(),
        isActive: registryEntry.isActive
      });
      
      // Start health monitoring
      this.startServiceHealthCheck(config.name);
      
      this._metrics.incrementCounter('failover_manager.services_registered', {
        service_type: config.type,
        service_name: config.name
      });
      
    } catch (error) {
      this.logger.error('Failed to register service', {
        serviceName: config.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw error;
    }
  }
  
  /**
   * Unregister service
   */
  async unregisterService(serviceName: string): Promise<void> {
    try {
      const service = this.services.get(serviceName);
      if (!service) {
        this.logger.warn('Attempted to unregister unknown service', { serviceName });
        return;
      }
      
      this.logger.info('Unregistering service', { serviceName });
      
      // Stop health monitoring
      this.stopServiceHealthCheck(serviceName);
      
      // If this was the active service, failover to backup
      if (service.isActive) {
        await this.triggerFailover(serviceName, 'Service unregistered');
      }
      
      // Remove from registry
      this.services.delete(serviceName);
      
      // Remove from Firestore
      await this._firestore.collection('service_registry').doc(serviceName).delete();
      
      this._metrics.incrementCounter('failover_manager.services_unregistered', {
        service_name: serviceName
      });
      
    } catch (error) {
      this.logger.error('Failed to unregister service', {
        serviceName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Perform health check for service
   */
  async performHealthCheck(serviceName: string): Promise<HealthCheckResult> {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service not found: ${serviceName}`);
    }
    
    const startTime = Date.now();
    
    try {
      // Perform actual health check based on service configuration
      const healthResult = await this.executeHealthCheck(service.config);
      
      const result: HealthCheckResult = {
        service: serviceName,
        status: healthResult.status,
        responseTime: Date.now() - startTime,
        timestamp: new Date(),
        details: healthResult.details
      };
      
      // Update service status
      await this.updateServiceHealth(serviceName, result);
      
      return result;
      
    } catch (error) {
      const result: HealthCheckResult = {
        service: serviceName,
        status: ServiceHealthStatus.UNHEALTHY,
        responseTime: Date.now() - startTime,
        timestamp: new Date(),
        details: {},
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      // Update service status
      await this.updateServiceHealth(serviceName, result);
      
      return result;
    }
  }
  
  /**
   * Execute health check based on service configuration
   */
  private async executeHealthCheck(config: ServiceConfig): Promise<{
    status: ServiceHealthStatus;
    details: Record<string, any>;
  }> {
    // Default health check implementation
    // In practice, this would be customized based on service type
    
    if (config.healthCheckUrl) {
      // HTTP health check
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.healthCheckTimeout);
        
        const response = await fetch(config.healthCheckUrl, {
          signal: controller.signal,
          method: 'GET',
          headers: {
            'User-Agent': 'FailoverManager/1.0'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          return {
            status: ServiceHealthStatus.HEALTHY,
            details: {
              statusCode: response.status,
              statusText: response.statusText
            }
          };
        } else {
          return {
            status: ServiceHealthStatus.DEGRADED,
            details: {
              statusCode: response.status,
              statusText: response.statusText
            }
          };
        }
        
      } catch (error) {
        return {
          status: ServiceHealthStatus.UNHEALTHY,
          details: {
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        };
      }
    } else {
      // Custom health check logic based on service type
      return this.performCustomHealthCheck(config);
    }
  }
  
  /**
   * Perform custom health check for specific service types
   */
  private async performCustomHealthCheck(config: ServiceConfig): Promise<{
    status: ServiceHealthStatus;
    details: Record<string, any>;
  }> {
    // Implement custom health checks based on service metadata
    const serviceType = config.metadata.type;
    
    switch (serviceType) {
      case 'database':
        return this.checkDatabaseHealth(config);
      case 'external_api':
        return this.checkExternalApiHealth(config);
      case 'ai_model':
        return this.checkAIModelHealth(config);
      default:
        // Default to healthy if no specific check is implemented
        return {
          status: ServiceHealthStatus.HEALTHY,
          details: { message: 'No specific health check implemented' }
        };
    }
  }
  
  /**
   * Check database health
   */
  private async checkDatabaseHealth(config: ServiceConfig): Promise<{
    status: ServiceHealthStatus;
    details: Record<string, any>;
  }> {
    try {
      // Simple Firestore connectivity check
      await this._firestore.collection('_health_check').doc('test').get();
      
      return {
        status: ServiceHealthStatus.HEALTHY,
        details: {
          connected: true,
          latency: Date.now() - Date.now() // Placeholder
        }
      };
      
    } catch (error) {
      return {
        status: ServiceHealthStatus.UNHEALTHY,
        details: {
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }
  
  /**
   * Check external API health
   */
  private async checkExternalApiHealth(config: ServiceConfig): Promise<{
    status: ServiceHealthStatus;
    details: Record<string, any>;
  }> {
    // Implement external API health check
    // This is a placeholder implementation
    return {
      status: ServiceHealthStatus.HEALTHY,
      details: { message: 'External API health check not implemented' }
    };
  }
  
  /**
   * Check AI model health
   */
  private async checkAIModelHealth(config: ServiceConfig): Promise<{
    status: ServiceHealthStatus;
    details: Record<string, any>;
  }> {
    // Implement AI model health check
    // This is a placeholder implementation
    return {
      status: ServiceHealthStatus.HEALTHY,
      details: { message: 'AI model health check not implemented' }
    };
  }
  
  /**
   * Update service health status
   */
  private async updateServiceHealth(serviceName: string, healthResult: HealthCheckResult): Promise<void> {
    const service = this.services.get(serviceName);
    if (!service) {
      return;
    }
    
    // Update service status
    const previousStatus = service.currentStatus;
    service.currentStatus = healthResult.status;
    service.lastHealthCheck = healthResult.timestamp;
    
    // Add to health history (keep last 100 entries)
    service.healthHistory.push(healthResult);
    if (service.healthHistory.length > 100) {
      service.healthHistory.shift();
    }
    
    // Update failure count
    if (healthResult.status === ServiceHealthStatus.UNHEALTHY || 
        healthResult.status === ServiceHealthStatus.CRITICAL) {
      service.failureCount++;
    } else if (healthResult.status === ServiceHealthStatus.HEALTHY) {
      service.failureCount = 0; // Reset on successful health check
    }
    
    // Log status changes
    if (previousStatus !== healthResult.status) {
      this.logger.info('Service health status changed', {
        serviceName,
        previousStatus,
        newStatus: healthResult.status,
        failureCount: service.failureCount
      });
      
      this._metrics.incrementCounter('failover_manager.health_status_changes', {
        service_name: serviceName,
        from_status: previousStatus,
        to_status: healthResult.status
      });
    }
    
    // Check if failover is needed
    if (service.isActive && this.shouldTriggerFailover(service)) {
      await this.triggerFailover(serviceName, `Health check failures: ${service.failureCount}`);
    }
    
    // Update metrics
    this._metrics.gauge('failover_manager.service_health', this.getHealthStatusValue(healthResult.status), {
      service_name: serviceName
    });
    
    this._metrics.histogram('failover_manager.health_check_response_time', healthResult.responseTime, {
      service_name: serviceName,
      status: healthResult.status
    });
  }
  
  /**
   * Check if failover should be triggered
   */
  private shouldTriggerFailover(service: ServiceRegistryEntry): boolean {
    // Check failure threshold
    if (service.failureCount >= service.config.failoverThreshold) {
      return true;
    }
    
    // Check if service is in critical state
    if (service.currentStatus === ServiceHealthStatus.CRITICAL) {
      return true;
    }
    
    // Check failover cooldown
    if (service.lastFailover) {
      const timeSinceLastFailover = Date.now() - service.lastFailover.getTime();
      if (timeSinceLastFailover < service.config.failoverCooldown) {
        return false;
      }
    }
    
    return false;
  }
  
  /**
   * Trigger failover from current service to backup
   */
  async triggerFailover(fromServiceName: string, reason: string): Promise<boolean> {
    try {
      const fromService = this.services.get(fromServiceName);
      if (!fromService) {
        this.logger.error('Cannot failover from unknown service', { fromServiceName });
        return false;
      }
      
      // Find backup service
      const backupService = this.findBackupService(fromService.config.type);
      if (!backupService) {
        this.logger.error('No backup service available for failover', {
          fromServiceName,
          serviceType: fromService.config.type
        });
        
        this._metrics.incrementCounter('failover_manager.failover_no_backup', {
          service_name: fromServiceName,
          service_type: fromService.config.type
        });
        
        return false;
      }
      
      const failoverStartTime = Date.now();
      const failoverId = `failover_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      this.logger.warn('Triggering failover', {
        failoverId,
        fromService: fromServiceName,
        toService: backupService.config.name,
        reason,
        strategy: fromService.config.failoverStrategy
      });
      
      // Execute failover based on strategy
      let success = false;
      
      switch (fromService.config.failoverStrategy) {
        case FailoverStrategy.IMMEDIATE:
          success = await this.executeImmediateFailover(fromService, backupService);
          break;
        case FailoverStrategy.GRACEFUL:
          success = await this.executeGracefulFailover(fromService, backupService);
          break;
        case FailoverStrategy.CIRCUIT_BREAKER:
          success = await this.executeCircuitBreakerFailover(fromService, backupService);
          break;
        case FailoverStrategy.MANUAL:
          success = await this.requestManualFailover(fromService, backupService, reason);
          break;
      }
      
      const failoverDuration = Date.now() - failoverStartTime;
      
      // Record failover event
      const failoverEvent: FailoverEvent = {
        id: failoverId,
        fromService: fromServiceName,
        toService: backupService.config.name,
        reason,
        strategy: fromService.config.failoverStrategy,
        timestamp: new Date(),
        duration: failoverDuration,
        success,
        metadata: {
          fromServiceType: fromService.config.type,
          toServiceType: backupService.config.type
        }
      };
      
      this.failoverEvents.push(failoverEvent);
      
      // Persist event
      await this._firestore.collection('failover_events').doc(failoverId).set({
        ...failoverEvent,
        timestamp: failoverEvent.timestamp.toISOString()
      });
      
      if (success) {
        this.logger.info('Failover completed successfully', {
          failoverId,
          fromService: fromServiceName,
          toService: backupService.config.name,
          duration: failoverDuration
        });
        
        this._metrics.incrementCounter('failover_manager.failovers_success', {
          from_service: fromServiceName,
          to_service: backupService.config.name,
          strategy: fromService.config.failoverStrategy
        });
        
        this._metrics.recordHistogram('failover_manager.failover_duration', failoverDuration, {
          strategy: fromService.config.failoverStrategy,
          success: 'true'
        });
        
        // Start recovery monitoring for failed service
        this.startRecoveryMonitoring(fromServiceName);
        
      } else {
        this.logger.error('Failover failed', {
          failoverId,
          fromService: fromServiceName,
          toService: backupService.config.name,
          duration: failoverDuration
        });
        
        this._metrics.incrementCounter('failover_manager.failovers_failed', {
          from_service: fromServiceName,
          to_service: backupService.config.name,
          strategy: fromService.config.failoverStrategy
        });
      }
      
      return success;
      
    } catch (error) {
      this.logger.error('Failover execution failed', {
        fromServiceName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }
  
  /**
   * Execute immediate failover
   */
  private async executeImmediateFailover(
    fromService: ServiceRegistryEntry,
    toService: ServiceRegistryEntry
  ): Promise<boolean> {
    try {
      // Deactivate current service
      fromService.isActive = false;
      fromService.lastFailover = new Date();
      
      // Activate backup service
      toService.isActive = true;
      
      // Update active service mapping
      this.activeServices.set(fromService.config.type, toService.config.name);
      
      // Update Realtime Database for immediate effect
      await this.realtimeDB.ref(`active_services/${fromService.config.type}`).set({
        serviceName: toService.config.name,
        activatedAt: new Date().toISOString(),
        reason: 'immediate_failover'
      });
      
      return true;
      
    } catch (error) {
      this.logger.error('Immediate failover failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }
  
  /**
   * Execute graceful failover
   */
  private async executeGracefulFailover(
    fromService: ServiceRegistryEntry,
    toService: ServiceRegistryEntry
  ): Promise<boolean> {
    try {
      // TODO: Implement graceful shutdown procedures
      // This would include draining connections, completing in-flight requests, etc.
      
      // For now, perform immediate failover
      return await this.executeImmediateFailover(fromService, toService);
      
    } catch (error) {
      this.logger.error('Graceful failover failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }
  
  /**
   * Execute circuit breaker failover
   */
  private async executeCircuitBreakerFailover(
    fromService: ServiceRegistryEntry,
    toService: ServiceRegistryEntry
  ): Promise<boolean> {
    try {
      // Implement circuit breaker pattern
      // This would integrate with the circuit breaker system
      
      return await this.executeImmediateFailover(fromService, toService);
      
    } catch (error) {
      this.logger.error('Circuit breaker failover failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }
  
  /**
   * Request manual failover
   */
  private async requestManualFailover(
    fromService: ServiceRegistryEntry,
    toService: ServiceRegistryEntry,
    reason: string
  ): Promise<boolean> {
    try {
      // Create manual intervention request
      const requestId = `manual_failover_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await this._firestore.collection('manual_failover_requests').doc(requestId).set({
        fromService: fromService.config.name,
        toService: toService.config.name,
        reason,
        requestedAt: new Date().toISOString(),
        status: 'pending',
        metadata: {
          fromServiceType: fromService.config.type,
          toServiceType: toService.config.type
        }
      });
      
      this.logger.warn('Manual failover requested', {
        requestId,
        fromService: fromService.config.name,
        toService: toService.config.name,
        reason
      });
      
      // TODO: Send alert to operations team
      
      return false; // Manual failover doesn't complete automatically
      
    } catch (error) {
      this.logger.error('Manual failover request failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }
  
  /**
   * Find backup service for failover
   */
  private findBackupService(serviceType: string): ServiceRegistryEntry | null {
    const candidates = Array.from(this.services.values())
      .filter(service => 
        service.config.type === serviceType &&
        !service.isActive &&
        (service.currentStatus === ServiceHealthStatus.HEALTHY || 
         service.currentStatus === ServiceHealthStatus.DEGRADED)
      )
      .sort((a, b) => b.config.priority - a.config.priority); // Higher priority first
    
    return candidates.length > 0 ? candidates[0] : null;
  }
  
  /**
   * Start recovery monitoring for failed service
   */
  private startRecoveryMonitoring(serviceName: string): void {
    const service = this.services.get(serviceName);
    if (!service) {
      return;
    }
    
    // Clear existing recovery timer
    const existingTimer = this.recoveryCheckTimers.get(serviceName);
    if (existingTimer) {
      clearInterval(existingTimer);
    }
    
    // Start recovery monitoring
    const recoveryTimer = setInterval(async () => {
      await this.checkServiceRecovery(serviceName);
    }, service.config.recoveryCheckInterval);
    
    this.recoveryCheckTimers.set(serviceName, recoveryTimer);
    
    this.logger.info('Started recovery monitoring', {
      serviceName,
      checkInterval: service.config.recoveryCheckInterval
    });
  }
  
  /**
   * Check if service has recovered
   */
  private async checkServiceRecovery(serviceName: string): Promise<void> {
    const service = this.services.get(serviceName);
    if (!service || service.isActive) {
      return;
    }
    
    try {
      // Perform health check
      const healthResult = await this.performHealthCheck(serviceName);
      
      // Check if service has recovered
      if (healthResult.status === ServiceHealthStatus.HEALTHY) {
        const recentHealthyChecks = service.healthHistory
          .slice(-service.config.recoveryThreshold)
          .filter(check => check.status === ServiceHealthStatus.HEALTHY);
        
        if (recentHealthyChecks.length >= service.config.recoveryThreshold) {
          await this.attemptServiceRecovery(serviceName);
        }
      }
      
    } catch (error) {
      this.logger.error('Recovery check failed', {
        serviceName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Attempt service recovery
   */
  private async attemptServiceRecovery(serviceName: string): Promise<boolean> {
    const service = this.services.get(serviceName);
    if (!service) {
      return false;
    }
    
    const recoveryStartTime = Date.now();
    const recoveryId = `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      this.logger.info('Attempting service recovery', {
        recoveryId,
        serviceName,
        strategy: service.config.recoveryStrategy
      });
      
      let success = false;
      
      switch (service.config.recoveryStrategy) {
        case RecoveryStrategy.AUTOMATIC:
          success = await this.executeAutomaticRecovery(service);
          break;
        case RecoveryStrategy.SEMI_AUTOMATIC:
          success = await this.executeSemiAutomaticRecovery(service);
          break;
        case RecoveryStrategy.MANUAL:
          success = await this.requestManualRecovery(service);
          break;
      }
      
      const recoveryDuration = Date.now() - recoveryStartTime;
      
      // Record recovery event
      const recoveryEvent: RecoveryEvent = {
        id: recoveryId,
        service: serviceName,
        strategy: service.config.recoveryStrategy,
        timestamp: new Date(),
        duration: recoveryDuration,
        success,
        metadata: {
          serviceType: service.config.type,
          healthChecksPassed: service.config.recoveryThreshold
        }
      };
      
      this.recoveryEvents.push(recoveryEvent);
      
      // Persist event
      await this._firestore.collection('recovery_events').doc(recoveryId).set({
        ...recoveryEvent,
        timestamp: recoveryEvent.timestamp.toISOString()
      });
      
      if (success) {
        this.logger.info('Service recovery completed successfully', {
          recoveryId,
          serviceName,
          duration: recoveryDuration
        });
        
        // Stop recovery monitoring
        const recoveryTimer = this.recoveryCheckTimers.get(serviceName);
        if (recoveryTimer) {
          clearInterval(recoveryTimer);
          this.recoveryCheckTimers.delete(serviceName);
        }
        
        this._metrics.incrementCounter('failover_manager.recoveries_success', {
          service_name: serviceName,
          strategy: service.config.recoveryStrategy
        });
        
      } else {
        this.logger.warn('Service recovery failed', {
          recoveryId,
          serviceName,
          duration: recoveryDuration
        });
        
        this._metrics.incrementCounter('failover_manager.recoveries_failed', {
          service_name: serviceName,
          strategy: service.config.recoveryStrategy
        });
      }
      
      return success;
      
    } catch (error) {
      this.logger.error('Service recovery failed', {
        serviceName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }
  
  /**
   * Execute automatic recovery
   */
  private async executeAutomaticRecovery(service: ServiceRegistryEntry): Promise<boolean> {
    try {
      // Check if this service should become active again
      const currentActiveService = this.activeServices.get(service.config.type);
      const currentActive = currentActiveService ? this.services.get(currentActiveService) : null;
      
      // Only recover if this service has higher priority or current active is unhealthy
      if (currentActive && 
          currentActive.config.priority >= service.config.priority &&
          currentActive.currentStatus === ServiceHealthStatus.HEALTHY) {
        return false; // Don't recover, current service is fine
      }
      
      // Activate recovered service
      service.isActive = true;
      service.failureCount = 0;
      
      // Deactivate current service if it exists
      if (currentActive) {
        currentActive.isActive = false;
      }
      
      // Update active service mapping
      this.activeServices.set(service.config.type, service.config.name);
      
      // Update Realtime Database
      await this.realtimeDB.ref(`active_services/${service.config.type}`).set({
        serviceName: service.config.name,
        activatedAt: new Date().toISOString(),
        reason: 'automatic_recovery'
      });
      
      return true;
      
    } catch (error) {
      this.logger.error('Automatic recovery failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }
  
  /**
   * Execute semi-automatic recovery
   */
  private async executeSemiAutomaticRecovery(service: ServiceRegistryEntry): Promise<boolean> {
    try {
      // Create recovery confirmation request
      const requestId = `recovery_confirmation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await this._firestore.collection('recovery_confirmations').doc(requestId).set({
        serviceName: service.config.name,
        serviceType: service.config.type,
        requestedAt: new Date().toISOString(),
        status: 'pending',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
        metadata: {
          healthChecksPassed: service.config.recoveryThreshold,
          currentStatus: service.currentStatus
        }
      });
      
      this.logger.info('Semi-automatic recovery confirmation requested', {
        requestId,
        serviceName: service.config.name
      });
      
      // TODO: Send notification to operations team
      
      return false; // Semi-automatic recovery requires confirmation
      
    } catch (error) {
      this.logger.error('Semi-automatic recovery request failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }
  
  /**
   * Request manual recovery
   */
  private async requestManualRecovery(service: ServiceRegistryEntry): Promise<boolean> {
    try {
      // Create manual recovery request
      const requestId = `manual_recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await this._firestore.collection('manual_recovery_requests').doc(requestId).set({
        serviceName: service.config.name,
        serviceType: service.config.type,
        requestedAt: new Date().toISOString(),
        status: 'pending',
        metadata: {
          healthChecksPassed: service.config.recoveryThreshold,
          currentStatus: service.currentStatus
        }
      });
      
      this.logger.info('Manual recovery requested', {
        requestId,
        serviceName: service.config.name
      });
      
      // TODO: Send alert to operations team
      
      return false; // Manual recovery doesn't complete automatically
      
    } catch (error) {
      this.logger.error('Manual recovery request failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }
  
  /**
   * Load service configurations from Firestore
   */
  private async loadServiceConfigurations(): Promise<void> {
    try {
      const snapshot = await this._firestore.collection('service_registry').get();
      
      snapshot.forEach((doc: QueryDocumentSnapshot) => {
        const config = doc.data() as ServiceConfig;
        
        const registryEntry: ServiceRegistryEntry = {
          config,
          currentStatus: ServiceHealthStatus.UNKNOWN,
          lastHealthCheck: new Date(),
          failureCount: 0,
          isActive: config.type === 'primary',
          healthHistory: []
        };
        
        this.services.set(config.name, registryEntry);
        
        if (registryEntry.isActive) {
          this.activeServices.set(config.type, config.name);
        }
      });
      
      this.logger.info('Loaded service configurations', {
        serviceCount: this.services.size
      });
      
    } catch (error) {
      this.logger.error('Failed to load service configurations', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Update active service for service type
   */
  private async updateActiveService(config: ServiceConfig): Promise<void> {
    const currentActive = this.activeServices.get(config.type);
    
    if (!currentActive || config.priority > (this.services.get(currentActive)?.config.priority || 0)) {
      this.activeServices.set(config.type, config.name);
      
      // Deactivate previous active service
      if (currentActive) {
        const previousService = this.services.get(currentActive);
        if (previousService) {
          previousService.isActive = false;
        }
      }
      
      // Activate new service
      const newService = this.services.get(config.name);
      if (newService) {
        newService.isActive = true;
      }
    }
  }
  
  /**
   * Start health monitoring for all services
   */
  private startHealthMonitoring(): void {
    for (const serviceName of this.services.keys()) {
      this.startServiceHealthCheck(serviceName);
    }
    
    this.logger.info('Started health monitoring for all services');
  }
  
  /**
   * Start health check for specific service
   */
  private startServiceHealthCheck(serviceName: string): void {
    const service = this.services.get(serviceName);
    if (!service) {
      return;
    }
    
    // Clear existing timer
    const existingTimer = this.healthCheckTimers.get(serviceName);
    if (existingTimer) {
      clearInterval(existingTimer);
    }
    
    // Start health check timer
    const healthCheckTimer = setInterval(async () => {
      try {
        await this.performHealthCheck(serviceName);
      } catch (error) {
        this.logger.error('Health check failed', {
          serviceName,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, service.config.healthCheckInterval);
    
    this.healthCheckTimers.set(serviceName, healthCheckTimer);
    
    // Perform initial health check
    this.performHealthCheck(serviceName).catch(error => {
      this.logger.error('Initial health check failed', {
        serviceName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    });
  }
  
  /**
   * Stop health check for specific service
   */
  private stopServiceHealthCheck(serviceName: string): void {
    const timer = this.healthCheckTimers.get(serviceName);
    if (timer) {
      clearInterval(timer);
      this.healthCheckTimers.delete(serviceName);
    }
    
    const recoveryTimer = this.recoveryCheckTimers.get(serviceName);
    if (recoveryTimer) {
      clearInterval(recoveryTimer);
      this.recoveryCheckTimers.delete(serviceName);
    }
  }
  
  /**
   * Get health status numeric value for metrics
   */
  private getHealthStatusValue(status: ServiceHealthStatus): number {
    switch (status) {
      case ServiceHealthStatus.HEALTHY: return 1;
      case ServiceHealthStatus.DEGRADED: return 0.5;
      case ServiceHealthStatus.UNHEALTHY: return 0;
      case ServiceHealthStatus.CRITICAL: return -1;
      case ServiceHealthStatus.UNKNOWN: return -0.5;
      default: return 0;
    }
  }
  
  /**
   * Clean up old events
   */
  private cleanupOldEvents(): void {
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    
    this.failoverEvents = this.failoverEvents.filter(event => 
      event.timestamp.getTime() > cutoffTime
    );
    
    this.recoveryEvents = this.recoveryEvents.filter(event => 
      event.timestamp.getTime() > cutoffTime
    );
  }
  
  /**
   * Get active service for service type
   */
  getActiveService(serviceType: string): string | null {
    return this.activeServices.get(serviceType) || null;
  }
  
  /**
   * Get service health status
   */
  getServiceHealth(serviceName: string): ServiceHealthStatus | null {
    const service = this.services.get(serviceName);
    return service ? service.currentStatus : null;
  }
  
  /**
   * Get all services
   */
  getAllServices(): ServiceRegistryEntry[] {
    return Array.from(this.services.values());
  }
  
  /**
   * Get failover statistics
   */
  getFailoverStats(): {
    totalServices: number;
    activeServices: number;
    healthyServices: number;
    failoverEvents: number;
    recoveryEvents: number;
  } {
    const services = Array.from(this.services.values());
    
    return {
      totalServices: services.length,
      activeServices: services.filter(s => s.isActive).length,
      healthyServices: services.filter(s => s.currentStatus === ServiceHealthStatus.HEALTHY).length,
      failoverEvents: this.failoverEvents.length,
      recoveryEvents: this.recoveryEvents.length
    };
  }
  
  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clear all timers
    for (const timer of this.healthCheckTimers.values()) {
      clearInterval(timer);
    }
    
    for (const timer of this.recoveryCheckTimers.values()) {
      clearInterval(timer);
    }
    
    this.healthCheckTimers.clear();
    this.recoveryCheckTimers.clear();
    
    this.logger.info('Failover Recovery Manager cleaned up');
  }
}