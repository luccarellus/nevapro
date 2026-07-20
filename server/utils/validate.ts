/**
 * Simple request body validation helper for CRUD endpoints.
 * Validates field types and required fields before they reach the database.
 * Prevents injection of malformed data via CRUD endpoints.
 */

interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  maxLength?: number;
  allowedValues?: readonly string[];
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized: Record<string, unknown>;
}

/**
 * Validates and sanitizes a request body against a schema.
 * Returns sanitized data or error messages.
 */
export function validateBody(
  body: Record<string, unknown>,
  rules: ValidationRule[],
): ValidationResult {
  const errors: string[] = [];
  const sanitized: Record<string, unknown> = {};

  for (const rule of rules) {
    const value = body[rule.field];

    // Check required
    if (value === undefined || value === null || value === '') {
      if (rule.required) {
        errors.push(`Campo '${rule.field}' é obrigatório.`);
      }
      continue;
    }

    // Check type
    if (rule.type === 'array') {
      if (!Array.isArray(value)) {
        errors.push(`Campo '${rule.field}' deve ser uma lista.`);
        continue;
      }
    } else if (typeof value !== rule.type) {
      errors.push(`Campo '${rule.field}' deve ser do tipo ${rule.type}.`);
      continue;
    }

    // Check max length for strings
    if (rule.type === 'string' && rule.maxLength && typeof value === 'string') {
      if (value.length > rule.maxLength) {
        errors.push(`Campo '${rule.field}' deve ter no máximo ${rule.maxLength} caracteres.`);
        continue;
      }
    }

    // Check allowed values
    if (rule.allowedValues && typeof value === 'string') {
      if (!rule.allowedValues.includes(value)) {
        errors.push(
          `Campo '${rule.field}' deve ser um dos valores: ${rule.allowedValues.join(', ')}.`,
        );
        continue;
      }
    }

    sanitized[rule.field] = value;
  }

  return { valid: errors.length === 0, errors, sanitized };
}

/**
 * Pre-defined validation schemas for CRUD endpoints.
 */
export const schemas = {
  material: {
    create: [
      { field: 'title', type: 'string' as const, required: true, maxLength: 255 },
      { field: 'type', type: 'string' as const, required: true, allowedValues: ['pdf', 'video', 'link'] as const },
      { field: 'url', type: 'string' as const, required: true, maxLength: 2048 },
      { field: 'subject', type: 'string' as const, maxLength: 255 },
      { field: 'foco', type: 'string' as const, maxLength: 255 },
      { field: 'description', type: 'string' as const, maxLength: 2000 },
    ],
  },
  event: {
    create: [
      { field: 'title', type: 'string' as const, required: true, maxLength: 255 },
      { field: 'date', type: 'string' as const, required: true, maxLength: 50 },
      { field: 'type', type: 'string' as const, required: true, maxLength: 50 },
      { field: 'description', type: 'string' as const, maxLength: 2000 },
      { field: 'time', type: 'string' as const, maxLength: 50 },
      { field: 'category', type: 'string' as const, maxLength: 100 },
      { field: 'observation', type: 'string' as const, maxLength: 2000 },
    ],
  },
  mural: {
    create: [
      { field: 'title', type: 'string' as const, required: true, maxLength: 255 },
      { field: 'content', type: 'string' as const, maxLength: 5000 },
      { field: 'type', type: 'string' as const, maxLength: 50 },
      { field: 'tag', type: 'string' as const, maxLength: 100 },
    ],
  },
} as const;
