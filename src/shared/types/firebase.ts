/**
 * Firebase Shared Types
 * Common Firebase-related types and interfaces
 */

// Re-export Firebase Auth types
export * from './firebase-auth';

// ============================================================================
// Firebase Configuration Types
// ============================================================================

/**
 * Firebase project configuration
 */
export interface FirebaseConfig {
  projectId: string;
  databaseURL: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
}

/**
 * Firebase Admin configuration
 */
export interface FirebaseAdminConfig {
  projectId: string;
  databaseURL: string;
  storageBucket: string;
  serviceAccountPath?: string;
  serviceAccount?: ServiceAccountConfig;
}

/**
 * Service account configuration
 */
export interface ServiceAccountConfig {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

// ============================================================================
// Firestore Types
// ============================================================================

/**
 * Firestore document reference
 */
export interface FirestoreDocumentRef {
  collection: string;
  id: string;
  path: string;
}

/**
 * Firestore query configuration
 */
export interface FirestoreQuery {
  collection: string;
  where?: FirestoreWhereClause[];
  orderBy?: FirestoreOrderBy[];
  limit?: number;
  offset?: number;
  startAfter?: any;
  endBefore?: any;
}

/**
 * Firestore where clause
 */
export interface FirestoreWhereClause {
  field: string;
  operator: FirestoreOperator;
  value: any;
}

export enum FirestoreOperator {
  EQUAL = '==',
  NOT_EQUAL = '!=',
  LESS_THAN = '<',
  LESS_THAN_OR_EQUAL = '<=',
  GREATER_THAN = '>',
  GREATER_THAN_OR_EQUAL = '>=',
  ARRAY_CONTAINS = 'array-contains',
  ARRAY_CONTAINS_ANY = 'array-contains-any',
  IN = 'in',
  NOT_IN = 'not-in'
}

/**
 * Firestore order by clause
 */
export interface FirestoreOrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Firestore batch operation
 */
export interface FirestoreBatchOperation {
  type: 'create' | 'update' | 'delete';
  ref: FirestoreDocumentRef;
  data?: any;
}

/**
 * Firestore transaction result
 */
export interface FirestoreTransactionResult<T = any> {
  success: boolean;
  result?: T;
  error?: FirestoreError;
}

/**
 * Firestore error
 */
export interface FirestoreError {
  code: string;
  message: string;
  details?: any;
}

// ============================================================================
// Realtime Database Types
// ============================================================================

/**
 * Realtime Database reference
 */
export interface RTDBReference {
  path: string;
  key?: string;
}

/**
 * Realtime Database query
 */
export interface RTDBQuery {
  path: string;
  orderBy?: string;
  limitToFirst?: number;
  limitToLast?: number;
  startAt?: any;
  endAt?: any;
  equalTo?: any;
}

/**
 * Realtime Database snapshot
 */
export interface RTDBSnapshot {
  key: string | null;
  value: any;
  exists: boolean;
  numChildren: number;
}

/**
 * Realtime Database event
 */
export interface RTDBEvent {
  type: RTDBEventType;
  snapshot: RTDBSnapshot;
  previousChildKey?: string | null;
}

export enum RTDBEventType {
  VALUE = 'value',
  CHILD_ADDED = 'child_added',
  CHILD_CHANGED = 'child_changed',
  CHILD_REMOVED = 'child_removed',
  CHILD_MOVED = 'child_moved'
}

// ============================================================================
// Firebase Functions Types
// ============================================================================

/**
 * Firebase Functions configuration
 */
export interface FunctionsConfig {
  region: string;
  memory: FunctionsMemory;
  timeout: number;
  maxInstances?: number;
  minInstances?: number;
  concurrency?: number;
  vpcConnector?: string;
  ingressSettings?: IngressSettings;
  egressSettings?: EgressSettings;
}

export enum FunctionsMemory {
  MB_128 = '128MB',
  MB_256 = '256MB',
  MB_512 = '512MB',
  GB_1 = '1GB',
  GB_2 = '2GB',
  GB_4 = '4GB',
  GB_8 = '8GB'
}

export enum IngressSettings {
  ALLOW_ALL = 'ALLOW_ALL',
  ALLOW_INTERNAL_ONLY = 'ALLOW_INTERNAL_ONLY',
  ALLOW_INTERNAL_AND_GCLB = 'ALLOW_INTERNAL_AND_GCLB'
}

export enum EgressSettings {
  PRIVATE_RANGES_ONLY = 'PRIVATE_RANGES_ONLY',
  ALL = 'ALL'
}

/**
 * Firebase Functions trigger
 */
export interface FunctionsTrigger {
  type: TriggerType;
  resource?: string;
  eventType?: string;
  httpsTrigger?: HttpsTrigger;
  eventTrigger?: EventTrigger;
  scheduleTrigger?: ScheduleTrigger;
}

export enum TriggerType {
  HTTPS = 'https',
  EVENT = 'event',
  SCHEDULE = 'schedule'
}

/**
 * HTTPS trigger configuration
 */
export interface HttpsTrigger {
  cors?: CorsConfig;
  invoker?: string[];
}

/**
 * CORS configuration
 */
export interface CorsConfig {
  origin: string | string[] | boolean;
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

/**
 * Event trigger configuration
 */
export interface EventTrigger {
  eventType: string;
  resource: string;
  service?: string;
  failurePolicy?: FailurePolicy;
}

/**
 * Schedule trigger configuration
 */
export interface ScheduleTrigger {
  schedule: string;
  timeZone?: string;
  retryConfig?: RetryConfig;
}

/**
 * Failure policy for event triggers
 */
export interface FailurePolicy {
  retry: boolean;
}

/**
 * Retry configuration for scheduled functions
 */
export interface RetryConfig {
  retryCount?: number;
  maxRetryDuration?: string;
  minBackoffDuration?: string;
  maxBackoffDuration?: string;
  maxDoublings?: number;
}

// ============================================================================
// Firebase Storage Types
// ============================================================================

/**
 * Firebase Storage configuration
 */
export interface StorageConfig {
  bucket: string;
  maxUploadSize: number;
  allowedMimeTypes: string[];
  publicRead?: boolean;
}

/**
 * Storage file metadata
 */
export interface StorageFileMetadata {
  name: string;
  bucket: string;
  generation: string;
  metageneration: string;
  contentType: string;
  size: number;
  md5Hash: string;
  crc32c: string;
  etag: string;
  timeCreated: Date;
  updated: Date;
  customMetadata?: Record<string, string>;
}

/**
 * Storage upload options
 */
export interface StorageUploadOptions {
  destination?: string;
  metadata?: Partial<StorageFileMetadata>;
  predefinedAcl?: PredefinedAcl;
  public?: boolean;
  resumable?: boolean;
  validation?: boolean;
}

export enum PredefinedAcl {
  AUTHENTICATED_READ = 'authenticatedRead',
  BUCKET_OWNER_FULL_CONTROL = 'bucketOwnerFullControl',
  BUCKET_OWNER_READ = 'bucketOwnerRead',
  PRIVATE = 'private',
  PROJECT_PRIVATE = 'projectPrivate',
  PUBLIC_READ = 'publicRead',
  PUBLIC_READ_WRITE = 'publicReadWrite'
}

// ============================================================================
// Firebase Messaging Types
// ============================================================================

/**
 * Firebase Cloud Messaging configuration
 */
export interface FCMConfig {
  serverKey: string;
  senderId: string;
  vapidKey?: string;
}

/**
 * FCM message
 */
export interface FCMMessage {
  token?: string;
  topic?: string;
  condition?: string;
  notification?: FCMNotification;
  data?: Record<string, string>;
  android?: AndroidConfig;
  apns?: ApnsConfig;
  webpush?: WebpushConfig;
  fcmOptions?: FCMOptions;
}

/**
 * FCM notification
 */
export interface FCMNotification {
  title?: string;
  body?: string;
  image?: string;
}

/**
 * Android-specific configuration
 */
export interface AndroidConfig {
  collapseKey?: string;
  priority?: AndroidMessagePriority;
  ttl?: number;
  restrictedPackageName?: string;
  data?: Record<string, string>;
  notification?: AndroidNotification;
  fcmOptions?: AndroidFcmOptions;
}

export enum AndroidMessagePriority {
  NORMAL = 'normal',
  HIGH = 'high'
}

/**
 * Android notification
 */
export interface AndroidNotification {
  title?: string;
  body?: string;
  icon?: string;
  color?: string;
  sound?: string;
  tag?: string;
  clickAction?: string;
  bodyLocKey?: string;
  bodyLocArgs?: string[];
  titleLocKey?: string;
  titleLocArgs?: string[];
  channelId?: string;
  ticker?: string;
  sticky?: boolean;
  eventTime?: Date;
  localOnly?: boolean;
  notificationPriority?: NotificationPriority;
  defaultSound?: boolean;
  defaultVibrateTimings?: boolean;
  defaultLightSettings?: boolean;
  vibrateTimings?: number[];
  visibility?: Visibility;
  notificationCount?: number;
  lightSettings?: LightSettings;
  image?: string;
}

export enum NotificationPriority {
  PRIORITY_UNSPECIFIED = 'PRIORITY_UNSPECIFIED',
  PRIORITY_MIN = 'PRIORITY_MIN',
  PRIORITY_LOW = 'PRIORITY_LOW',
  PRIORITY_DEFAULT = 'PRIORITY_DEFAULT',
  PRIORITY_HIGH = 'PRIORITY_HIGH',
  PRIORITY_MAX = 'PRIORITY_MAX'
}

export enum Visibility {
  VISIBILITY_UNSPECIFIED = 'VISIBILITY_UNSPECIFIED',
  PRIVATE = 'PRIVATE',
  PUBLIC = 'PUBLIC',
  SECRET = 'SECRET'
}

/**
 * Light settings for Android notifications
 */
export interface LightSettings {
  color: Color;
  lightOnDuration: number;
  lightOffDuration: number;
}

/**
 * Color representation
 */
export interface Color {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

/**
 * Android FCM options
 */
export interface AndroidFcmOptions {
  analyticsLabel?: string;
}

/**
 * APNS (iOS) configuration
 */
export interface ApnsConfig {
  headers?: Record<string, string>;
  payload?: ApnsPayload;
  fcmOptions?: ApnsFcmOptions;
}

/**
 * APNS payload
 */
export interface ApnsPayload {
  aps?: Aps;
  [key: string]: any;
}

/**
 * APNS APS
 */
export interface Aps {
  alert?: string | ApsAlert;
  badge?: number;
  sound?: string | CriticalSound;
  contentAvailable?: boolean;
  mutableContent?: boolean;
  category?: string;
  threadId?: string;
  targetContentId?: string;
}

/**
 * APNS alert
 */
export interface ApsAlert {
  title?: string;
  subtitle?: string;
  body?: string;
  locKey?: string;
  locArgs?: string[];
  titleLocKey?: string;
  titleLocArgs?: string[];
  subtitleLocKey?: string;
  subtitleLocArgs?: string[];
  actionLocKey?: string;
  launchImage?: string;
}

/**
 * Critical sound for APNS
 */
export interface CriticalSound {
  critical?: boolean;
  name?: string;
  volume?: number;
}

/**
 * APNS FCM options
 */
export interface ApnsFcmOptions {
  analyticsLabel?: string;
  image?: string;
}

/**
 * Web push configuration
 */
export interface WebpushConfig {
  headers?: Record<string, string>;
  data?: Record<string, string>;
  notification?: WebpushNotification;
  fcmOptions?: WebpushFcmOptions;
}

/**
 * Web push notification
 */
export interface WebpushNotification {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  image?: string;
  lang?: string;
  tag?: string;
  dir?: 'auto' | 'ltr' | 'rtl';
  renotify?: boolean;
  requireInteraction?: boolean;
  silent?: boolean;
  timestamp?: number;
  vibrate?: number[];
  actions?: NotificationAction[];
  data?: any;
}

/**
 * Notification action
 */
export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

/**
 * Web push FCM options
 */
export interface WebpushFcmOptions {
  link?: string;
  analyticsLabel?: string;
}

/**
 * FCM options
 */
export interface FCMOptions {
  analyticsLabel?: string;
}

// ============================================================================
// Firebase Security Rules Types
// ============================================================================

/**
 * Security rules configuration
 */
export interface SecurityRulesConfig {
  rules: SecurityRule[];
  version: string;
  service: SecurityService;
}

export enum SecurityService {
  FIRESTORE = 'cloud.firestore',
  STORAGE = 'firebase.storage',
  REALTIME_DATABASE = 'firebase.database'
}

/**
 * Security rule
 */
export interface SecurityRule {
  match: string;
  allow: AllowRule[];
  functions?: SecurityFunction[];
}

/**
 * Allow rule
 */
export interface AllowRule {
  operations: SecurityOperation[];
  condition: string;
}

export enum SecurityOperation {
  READ = 'read',
  WRITE = 'write',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get'
}

/**
 * Security function
 */
export interface SecurityFunction {
  name: string;
  parameters: string[];
  body: string;
}

// ============================================================================
// Firebase Extensions Types
// ============================================================================

/**
 * Firebase extension configuration
 */
export interface ExtensionConfig {
  name: string;
  version: string;
  params: Record<string, any>;
  eventarcChannel?: string;
  allowedEventTypes?: string[];
}

/**
 * Extension instance
 */
export interface ExtensionInstance {
  name: string;
  createTime: Date;
  updateTime: Date;
  state: ExtensionState;
  config: ExtensionConfig;
  serviceAccountEmail: string;
  errorStatus?: ExtensionError;
}

export enum ExtensionState {
  STATE_UNSPECIFIED = 'STATE_UNSPECIFIED',
  DEPLOYING = 'DEPLOYING',
  UNINSTALLING = 'UNINSTALLING',
  ACTIVE = 'ACTIVE',
  ERRORED = 'ERRORED',
  PAUSED = 'PAUSED'
}

/**
 * Extension error
 */
export interface ExtensionError {
  code: number;
  message: string;
  details?: any[];
}