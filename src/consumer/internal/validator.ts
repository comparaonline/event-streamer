import type { z } from 'zod';
import type { SchemaValidationResult } from '../../schemas';

export class Validator<T extends z.ZodTypeAny> {
  private readonly schema: T;

  constructor(schema: T) {
    this.schema = schema;
  }

  validate(value: unknown): SchemaValidationResult {
    const result = this.schema.safeParse(value);
    if (result.success) return { valid: true };
    return { valid: false, errors: result.error.errors.map((e) => e.message) };
  }
}
