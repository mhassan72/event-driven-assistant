/**
 * Image Generation Types
 * Core interfaces for image generation, processing, and management
 */

// ============================================================================
// Image Generation Request and Response
// ============================================================================

/**
 * Image generation request with comprehensive options
 */
export interface ImageGenerationRequest {
  userId: string;
  prompt: string;
  negativePrompt?: string;
  model: ImageModel;
  size: ImageSize;
  quality: ImageQuality;
  style?: ImageStyle;
  count: number;
  seed?: number;
  guidanceScale?: number;
  steps?: number;
  
  // Advanced options
  aspectRatio?: AspectRatio;
  outputFormat?: ImageFormat;
  safetyFilter?: boolean;
  
  // Cost and timing
  estimatedCost?: number;
  maxWaitTime?: number;
  priority?: GenerationPriority;
  
  // Metadata and tracking
  metadata?: ImageGenerationMetadata;
  correlationId?: string;
  idempotencyKey: string;
}

/**
 * Image generation result with comprehensive data
 */
export interface ImageGenerationResult {
  taskId: string;
  userId: string;
  requestId: string;
  images: GeneratedImage[];
  status: GenerationStatus;
  creditsUsed: number;
  generationTime: number;
  metadata: ImageGenerationMetadata;
  
  // Error handling
  error?: ImageGenerationError;
  retryCount?: number;
  
  // Timing
  createdAt: Date;
  completedAt?: Date;
  expiresAt?: Date;
}

// ============================================================================
// Generated Image Types
// ============================================================================

/**
 * Individual generated image with metadata
 */
export interface GeneratedImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  size: ImageSize;
  format: ImageFormat;
  fileSize: number;
  
  // Generation details
  prompt: string;
  model: ImageModel;
  seed?: number;
  actualSteps?: number;
  actualGuidanceScale?: number;
  
  // Storage and access
  storageProvider: StorageProvider;
  storagePath: string;
  publicUrl?: string;
  downloadUrl?: string;
  
  // Metadata
  createdAt: Date;
  expiresAt?: Date;
  downloadCount?: number;
  lastAccessed?: Date;
  
  // Content analysis
  contentAnalysis?: ImageContentAnalysis;
  safetyScore?: number;
  tags?: string[];
}

/**
 * Image content analysis results
 */
export interface ImageContentAnalysis {
  objects: DetectedObject[];
  faces: DetectedFace[];
  text: DetectedText[];
  colors: DominantColor[];
  style: ImageStyleAnalysis;
  quality: ImageQualityMetrics;
  safety: SafetyAnalysis;
}

// ============================================================================
// Enums and Constants
// ============================================================================

export enum ImageModel {
  FLUX_SCHNELL = 'black-forest-labs/flux-schnell',
  FLUX_DEV = 'black-forest-labs/flux-dev',
  DALL_E_3 = 'dall-e-3',
  DALL_E_2 = 'dall-e-2',
  MIDJOURNEY = 'midjourney',
  STABLE_DIFFUSION = 'stable-diffusion'
}

export enum ImageSize {
  SQUARE_256 = '256x256',
  SQUARE_512 = '512x512',
  SQUARE_1024 = '1024x1024',
  PORTRAIT_512_768 = '512x768',
  LANDSCAPE_768_512 = '768x512',
  PORTRAIT_1024_1536 = '1024x1536',
  LANDSCAPE_1536_1024 = '1536x1024',
  ULTRA_WIDE_2048_1024 = '2048x1024',
  ULTRA_TALL_1024_2048 = '1024x2048'
}

export enum ImageQuality {
  DRAFT = 'draft',
  STANDARD = 'standard',
  HD = 'hd',
  ULTRA_HD = 'ultra_hd'
}

export enum ImageStyle {
  PHOTOREALISTIC = 'photorealistic',
  ARTISTIC = 'artistic',
  CARTOON = 'cartoon',
  ANIME = 'anime',
  SKETCH = 'sketch',
  PAINTING = 'painting',
  DIGITAL_ART = 'digital_art',
  CONCEPT_ART = 'concept_art',
  PORTRAIT = 'portrait',
  LANDSCAPE = 'landscape'
}

export enum AspectRatio {
  SQUARE = '1:1',
  PORTRAIT = '3:4',
  LANDSCAPE = '4:3',
  WIDE = '16:9',
  ULTRA_WIDE = '21:9',
  VERTICAL = '9:16'
}

export enum ImageFormat {
  PNG = 'png',
  JPEG = 'jpeg',
  WEBP = 'webp',
  SVG = 'svg',
  GIF = 'gif'
}

export enum GenerationStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

export enum GenerationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum StorageProvider {
  FIREBASE_STORAGE = 'firebase_storage',
  AWS_S3 = 'aws_s3',
  GOOGLE_CLOUD_STORAGE = 'google_cloud_storage',
  CLOUDINARY = 'cloudinary'
}

// ============================================================================
// Image Processing and Enhancement
// ============================================================================

/**
 * Image enhancement request
 */
export interface ImageEnhancementRequest {
  userId: string;
  imageId: string;
  enhancements: ImageEnhancement[];
  outputQuality?: ImageQuality;
  outputFormat?: ImageFormat;
  metadata?: Record<string, any>;
  idempotencyKey: string;
}

/**
 * Image enhancement operation
 */
export interface ImageEnhancement {
  type: EnhancementType;
  parameters: EnhancementParameters;
  priority: number;
}

export enum EnhancementType {
  UPSCALE = 'upscale',
  DENOISE = 'denoise',
  SHARPEN = 'sharpen',
  COLOR_CORRECTION = 'color_correction',
  BRIGHTNESS_CONTRAST = 'brightness_contrast',
  SATURATION = 'saturation',
  CROP = 'crop',
  RESIZE = 'resize',
  ROTATE = 'rotate',
  FLIP = 'flip'
}

/**
 * Enhancement parameters
 */
export interface EnhancementParameters {
  // Upscaling
  scaleFactor?: number;
  algorithm?: UpscaleAlgorithm;
  
  // Noise reduction
  noiseLevel?: number;
  preserveDetails?: boolean;
  
  // Sharpening
  sharpnessAmount?: number;
  radius?: number;
  
  // Color adjustments
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hue?: number;
  
  // Geometric transformations
  cropArea?: CropArea;
  newSize?: ImageSize;
  rotationAngle?: number;
  flipDirection?: FlipDirection;
}

export enum UpscaleAlgorithm {
  BICUBIC = 'bicubic',
  LANCZOS = 'lanczos',
  AI_ENHANCED = 'ai_enhanced',
  REAL_ESRGAN = 'real_esrgan'
}

/**
 * Crop area specification
 */
export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export enum FlipDirection {
  HORIZONTAL = 'horizontal',
  VERTICAL = 'vertical',
  BOTH = 'both'
}

// ============================================================================
// Image Editing Types
// ============================================================================

/**
 * Image editing request
 */
export interface ImageEditRequest {
  userId: string;
  imageId: string;
  edits: ImageEdit[];
  outputQuality?: ImageQuality;
  outputFormat?: ImageFormat;
  metadata?: Record<string, any>;
  idempotencyKey: string;
}

/**
 * Image edit operation
 */
export interface ImageEdit {
  type: EditType;
  parameters: EditParameters;
  maskArea?: MaskArea;
}

export enum EditType {
  INPAINT = 'inpaint',
  OUTPAINT = 'outpaint',
  OBJECT_REMOVAL = 'object_removal',
  BACKGROUND_REMOVAL = 'background_removal',
  BACKGROUND_REPLACEMENT = 'background_replacement',
  STYLE_TRANSFER = 'style_transfer',
  COLOR_REPLACEMENT = 'color_replacement',
  TEXT_OVERLAY = 'text_overlay'
}

/**
 * Edit parameters
 */
export interface EditParameters {
  // Inpainting/Outpainting
  prompt?: string;
  negativePrompt?: string;
  strength?: number;
  
  // Background operations
  newBackground?: string;
  backgroundPrompt?: string;
  
  // Style transfer
  styleReference?: string;
  styleStrength?: number;
  
  // Color replacement
  targetColor?: string;
  replacementColor?: string;
  tolerance?: number;
  
  // Text overlay
  text?: string;
  font?: string;
  fontSize?: number;
  textColor?: string;
  position?: TextPosition;
}

/**
 * Mask area for selective editing
 */
export interface MaskArea {
  type: MaskType;
  coordinates?: Coordinate[];
  polygons?: Polygon[];
  automaticDetection?: AutoDetectionConfig;
}

export enum MaskType {
  RECTANGLE = 'rectangle',
  CIRCLE = 'circle',
  POLYGON = 'polygon',
  FREEFORM = 'freeform',
  AUTOMATIC = 'automatic'
}

/**
 * Coordinate point
 */
export interface Coordinate {
  x: number;
  y: number;
}

/**
 * Polygon definition
 */
export interface Polygon {
  points: Coordinate[];
  closed: boolean;
}

/**
 * Automatic detection configuration
 */
export interface AutoDetectionConfig {
  objectType: DetectionObjectType;
  confidence: number;
  includeEdges: boolean;
}

export enum DetectionObjectType {
  PERSON = 'person',
  FACE = 'face',
  OBJECT = 'object',
  BACKGROUND = 'background',
  TEXT = 'text'
}

/**
 * Text position for overlays
 */
export interface TextPosition {
  x: number;
  y: number;
  alignment: TextAlignment;
  rotation?: number;
}

export enum TextAlignment {
  LEFT = 'left',
  CENTER = 'center',
  RIGHT = 'right',
  TOP = 'top',
  MIDDLE = 'middle',
  BOTTOM = 'bottom'
}

// ============================================================================
// Content Analysis Types
// ============================================================================

/**
 * Detected object in image
 */
export interface DetectedObject {
  id: string;
  label: string;
  confidence: number;
  boundingBox: BoundingBox;
  attributes?: ObjectAttribute[];
}

/**
 * Detected face in image
 */
export interface DetectedFace {
  id: string;
  confidence: number;
  boundingBox: BoundingBox;
  landmarks?: FaceLandmark[];
  attributes?: FaceAttribute[];
  emotions?: EmotionScore[];
}

/**
 * Detected text in image
 */
export interface DetectedText {
  id: string;
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
  language?: string;
  font?: string;
}

/**
 * Bounding box coordinates
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Object attribute
 */
export interface ObjectAttribute {
  name: string;
  value: string;
  confidence: number;
}

/**
 * Face landmark point
 */
export interface FaceLandmark {
  type: LandmarkType;
  x: number;
  y: number;
}

export enum LandmarkType {
  LEFT_EYE = 'left_eye',
  RIGHT_EYE = 'right_eye',
  NOSE = 'nose',
  MOUTH = 'mouth',
  LEFT_EYEBROW = 'left_eyebrow',
  RIGHT_EYEBROW = 'right_eyebrow'
}

/**
 * Face attribute
 */
export interface FaceAttribute {
  name: string;
  value: string;
  confidence: number;
}

/**
 * Emotion score
 */
export interface EmotionScore {
  emotion: EmotionType;
  score: number;
}

export enum EmotionType {
  HAPPY = 'happy',
  SAD = 'sad',
  ANGRY = 'angry',
  SURPRISED = 'surprised',
  FEARFUL = 'fearful',
  DISGUSTED = 'disgusted',
  NEUTRAL = 'neutral'
}

/**
 * Dominant color in image
 */
export interface DominantColor {
  color: string; // Hex color code
  percentage: number;
  rgb: RGBColor;
  hsv: HSVColor;
}

/**
 * RGB color values
 */
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/**
 * HSV color values
 */
export interface HSVColor {
  h: number;
  s: number;
  v: number;
}

/**
 * Image style analysis
 */
export interface ImageStyleAnalysis {
  primaryStyle: ImageStyle;
  styleConfidence: number;
  secondaryStyles: StyleScore[];
  artisticElements: ArtisticElement[];
}

/**
 * Style score
 */
export interface StyleScore {
  style: ImageStyle;
  score: number;
}

/**
 * Artistic element detected
 */
export interface ArtisticElement {
  element: ArtisticElementType;
  presence: number; // 0-1
  description: string;
}

export enum ArtisticElementType {
  BRUSH_STROKES = 'brush_strokes',
  TEXTURE = 'texture',
  LIGHTING = 'lighting',
  COMPOSITION = 'composition',
  COLOR_HARMONY = 'color_harmony',
  PERSPECTIVE = 'perspective'
}

/**
 * Image quality metrics
 */
export interface ImageQualityMetrics {
  overallScore: number; // 0-100
  sharpness: number;
  brightness: number;
  contrast: number;
  saturation: number;
  noise: number;
  artifacts: QualityArtifact[];
}

/**
 * Quality artifact detected
 */
export interface QualityArtifact {
  type: ArtifactType;
  severity: ArtifactSeverity;
  location?: BoundingBox;
  description: string;
}

export enum ArtifactType {
  BLUR = 'blur',
  NOISE = 'noise',
  COMPRESSION = 'compression',
  DISTORTION = 'distortion',
  OVERSATURATION = 'oversaturation',
  UNDEREXPOSURE = 'underexposure',
  OVEREXPOSURE = 'overexposure'
}

export enum ArtifactSeverity {
  MINOR = 'minor',
  MODERATE = 'moderate',
  SEVERE = 'severe'
}

/**
 * Safety analysis results
 */
export interface SafetyAnalysis {
  overallSafetyScore: number; // 0-100
  contentFlags: ContentFlag[];
  ageRating: AgeRating;
  recommendations: SafetyRecommendation[];
}

/**
 * Content flag for safety
 */
export interface ContentFlag {
  type: ContentFlagType;
  severity: ContentSeverity;
  confidence: number;
  description: string;
}

export enum ContentFlagType {
  ADULT_CONTENT = 'adult_content',
  VIOLENCE = 'violence',
  HATE_SPEECH = 'hate_speech',
  ILLEGAL_ACTIVITY = 'illegal_activity',
  COPYRIGHTED_MATERIAL = 'copyrighted_material',
  PERSONAL_INFORMATION = 'personal_information'
}

export enum ContentSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum AgeRating {
  GENERAL = 'general',
  TEEN = 'teen',
  MATURE = 'mature',
  ADULT = 'adult'
}

/**
 * Safety recommendation
 */
export interface SafetyRecommendation {
  type: RecommendationType;
  message: string;
  action: RecommendedAction;
}

export enum RecommendationType {
  CONTENT_WARNING = 'content_warning',
  AGE_RESTRICTION = 'age_restriction',
  CONTENT_REMOVAL = 'content_removal',
  MANUAL_REVIEW = 'manual_review'
}

export enum RecommendedAction {
  ALLOW = 'allow',
  WARN = 'warn',
  RESTRICT = 'restrict',
  BLOCK = 'block',
  REVIEW = 'review'
}

// ============================================================================
// Metadata and Configuration
// ============================================================================

/**
 * Image generation metadata
 */
export interface ImageGenerationMetadata {
  // Request context
  sessionId?: string;
  userAgent?: string;
  ipAddress?: string;
  
  // Generation details
  modelVersion?: string;
  engineVersion?: string;
  processingNode?: string;
  
  // Performance metrics
  queueTime?: number;
  processingTime?: number;
  totalTime?: number;
  
  // Resource usage
  gpuTime?: number;
  memoryUsage?: number;
  computeUnits?: number;
  
  // Quality metrics
  outputQualityScore?: number;
  promptAdherence?: number;
  artisticQuality?: number;
  
  // Custom fields
  [key: string]: any;
}

/**
 * Image generation error
 */
export interface ImageGenerationError {
  code: string;
  message: string;
  type: ErrorType;
  retryable: boolean;
  details?: Record<string, any>;
}

export enum ErrorType {
  VALIDATION_ERROR = 'validation_error',
  QUOTA_EXCEEDED = 'quota_exceeded',
  MODEL_UNAVAILABLE = 'model_unavailable',
  PROCESSING_ERROR = 'processing_error',
  TIMEOUT_ERROR = 'timeout_error',
  CONTENT_POLICY_VIOLATION = 'content_policy_violation',
  INSUFFICIENT_CREDITS = 'insufficient_credits',
  SYSTEM_ERROR = 'system_error'
}