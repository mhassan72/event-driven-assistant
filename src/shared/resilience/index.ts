/**
 * System Resilience Module
 * Comprehensive resilience and fault tolerance systems
 */

// Distributed locks and optimistic concurrency control
export {
  LockConfig,
  LockInfo,
  LockAcquisitionResult,
  OptimisticLockVersion,
  OptimisticUpdateResult,
  DistributedLockManager,
  OptimisticConcurrencyManager
} from './distributed-locks';

// Automatic failover and disaster recovery
export {
  ServiceHealthStatus,
  FailoverStrategy,
  RecoveryStrategy,
  ServiceConfig,
  HealthCheckResult,
  FailoverEvent,
  RecoveryEvent,
  ServiceRegistryEntry,
  FailoverRecoveryManager
} from './failover-recovery';

// Data consistency validation and repair
export {
  ConsistencyCheckType,
  ConsistencyViolationSeverity,
  RepairStrategy,
  ConsistencyRule,
  ConsistencyViolation,
  ViolationStatus,
  RepairAttempt,
  RepairChange,
  FieldChange,
  ConsistencyCheckResult,
  DataConsistencyManager
} from './data-consistency';

// Graceful degradation
export {
  DegradationLevel,
  FeaturePriority,
  DegradationStrategy,
  FeatureConfig,
  DegradationRule,
  DegradationTrigger,
  DegradationAction,
  DegradationState,
  FeatureStatus,
  GracefulDegradationManager
} from './graceful-degradation';