/**
 * Request Validation Middleware
 * Input validation and sanitization for API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { ValidationError } from './error-handling';
import { logger } from '../../shared/observability/logger';
import { z } from 'zod';

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'email' | 'url' | 'uuid' | 'array' | 'object';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: string[];
  custom?: (value: any) => boolean | string;
}

export interface ValidationSchema {
  body?: ValidationRule[];
  query?: ValidationRule[];
  params?: ValidationRule[];
}

export type ZodValidationSchema = z.ZodSchema<any>;

/**
 * Create validation middleware for request validation
 */
export function validateRequest(schema: ValidationSchema | ZodValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Check if it's a Zod schema
      if ('parse' in schema) {
        // Handle Zod schema
        try {
          (schema as ZodValidationSchema).parse(req.body);
          next();
          return;
        } catch (error) {
          if (error instanceof z.ZodError) {
            const errors = error.issues.map((err: any) => `${err.path.join('.')}: ${err.message}`);
            logger.warn('Zod validation failed', {
              errors,
              method: req.method,
              url: req.originalUrl,
            });
            
            res.status(400).json({
              success: false,
              error: 'Validation failed',
              details: errors
            });
            return;
          }
          throw error;
        }
      }

      // Handle legacy ValidationSchema
      const validationSchema = schema as ValidationSchema;
      const errors: string[] = [];

      // Validate body
      if (validationSchema.body) {
        const bodyErrors = validateObject(req.body || {}, validationSchema.body, 'body');
        errors.push(...bodyErrors);
      }

      // Validate query parameters
      if (validationSchema.query) {
        const queryErrors = validateObject(req.query || {}, validationSchema.query, 'query');
        errors.push(...queryErrors);
      }

      // Validate URL parameters
      if (validationSchema.params) {
        const paramErrors = validateObject(req.params || {}, validationSchema.params, 'params');
        errors.push(...paramErrors);
      }

      if (errors.length > 0) {
        logger.warn('Request validation failed', {
          errors,
          method: req.method,
          url: req.originalUrl,
          userId: (req as any).user?.uid
        });

        throw new ValidationError('Request validation failed', { errors });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Validate an object against validation rules
 */
function validateObject(obj: any, rules: ValidationRule[], context: string): string[] {
  const errors: string[] = [];

  for (const rule of rules) {
    const value = obj[rule.field];
    const fieldPath = `${context}.${rule.field}`;

    // Check required fields
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push(`${fieldPath} is required`);
      continue;
    }

    // Skip validation if field is not required and not provided
    if (!rule.required && (value === undefined || value === null)) {
      continue;
    }

    // Type validation
    const typeError = validateType(value, rule.type, fieldPath);
    if (typeError) {
      errors.push(typeError);
      continue;
    }

    // Length/range validation
    if (rule.min !== undefined || rule.max !== undefined) {
      const rangeError = validateRange(value, rule.min, rule.max, rule.type, fieldPath);
      if (rangeError) {
        errors.push(rangeError);
      }
    }

    // Pattern validation
    if (rule.pattern && typeof value === 'string') {
      if (!rule.pattern.test(value)) {
        errors.push(`${fieldPath} does not match required pattern`);
      }
    }

    // Enum validation
    if (rule.enum && !rule.enum.includes(value)) {
      errors.push(`${fieldPath} must be one of: ${rule.enum.join(', ')}`);
    }

    // Custom validation
    if (rule.custom) {
      const customResult = rule.custom(value);
      if (customResult !== true) {
        const errorMessage = typeof customResult === 'string' ? customResult : `${fieldPath} failed custom validation`;
        errors.push(errorMessage);
      }
    }
  }

  return errors;
}

/**
 * Validate value type
 */
function validateType(value: any, type: string, fieldPath: string): string | null {
  switch (type) {
    case 'string':
      if (typeof value !== 'string') {
        return `${fieldPath} must be a string`;
      }
      break;

    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        return `${fieldPath} must be a valid number`;
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        return `${fieldPath} must be a boolean`;
      }
      break;

    case 'email':
      if (typeof value !== 'string' || !isValidEmail(value)) {
        return `${fieldPath} must be a valid email address`;
      }
      break;

    case 'url':
      if (typeof value !== 'string' || !isValidUrl(value)) {
        return `${fieldPath} must be a valid URL`;
      }
      break;

    case 'uuid':
      if (typeof value !== 'string' || !isValidUuid(value)) {
        return `${fieldPath} must be a valid UUID`;
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        return `${fieldPath} must be an array`;
      }
      break;

    case 'object':
      if (typeof value !== 'object' || Array.isArray(value) || value === null) {
        return `${fieldPath} must be an object`;
      }
      break;

    default:
      return `Unknown validation type: ${type}`;
  }

  return null;
}

/**
 * Validate value range/length
 */
function validateRange(value: any, min?: number, max?: number, type?: string, fieldPath?: string): string | null {
  let length: number;

  switch (type) {
    case 'string':
      length = value.length;
      break;
    case 'array':
      length = value.length;
      break;
    case 'number':
      length = value;
      break;
    default:
      return null;
  }

  if (min !== undefined && length < min) {
    if (type === 'string') {
      return `${fieldPath} must be at least ${min} characters long`;
    } else if (type === 'array') {
      return `${fieldPath} must contain at least ${min} items`;
    } else if (type === 'number') {
      return `${fieldPath} must be at least ${min}`;
    }
  }

  if (max !== undefined && length > max) {
    if (type === 'string') {
      return `${fieldPath} must be at most ${max} characters long`;
    } else if (type === 'array') {
      return `${fieldPath} must contain at most ${max} items`;
    } else if (type === 'number') {
      return `${fieldPath} must be at most ${max}`;
    }
  }

  return null;
}

/**
 * Email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * URL validation
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * UUID validation
 */
function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/[\x00-\x1f\x7f]/g, ''); // Remove control characters
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (obj && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Request sanitization middleware
 */
export function sanitizeRequest(req: Request, res: Response, next: NextFunction): void {
  try {
    // Sanitize body
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    logger.error('Request sanitization failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      method: req.method,
      url: req.originalUrl
    });

    next(error);
  }
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // Pagination
  pagination: {
    query: [
      { field: 'limit', type: 'number' as const, min: 1, max: 100 },
      { field: 'offset', type: 'number' as const, min: 0 }
    ]
  },

  // ID parameter
  idParam: {
    params: [
      { field: 'id', type: 'string' as const, required: true, min: 1 }
    ]
  },

  // User ID in body
  userId: {
    body: [
      { field: 'userId', type: 'string' as const, required: true, min: 1 }
    ]
  },

  // Credit amount
  creditAmount: {
    body: [
      { field: 'amount', type: 'number' as const, required: true, min: 1 }
    ]
  },

  // Message content
  messageContent: {
    body: [
      { field: 'message', type: 'string' as const, required: true, min: 1, max: 10000 }
    ]
  },

  // Image generation
  imageGeneration: {
    body: [
      { field: 'prompt', type: 'string' as const, required: true, min: 1, max: 1000 },
      { field: 'model', type: 'string' as const },
      { field: 'size', type: 'string' as const, enum: ['512x512', '768x768', '1024x1024', '1024x1792', '1792x1024'] },
      { field: 'quality', type: 'string' as const, enum: ['standard', 'hd'] }
    ]
  }
};