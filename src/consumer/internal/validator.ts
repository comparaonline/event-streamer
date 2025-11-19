import { z } from 'zod';
import { SchemaRegistryClient } from '../../schema-registry/client';

export class Validator {
  private readonly client?: SchemaRegistryClient;

  constructor(client?: SchemaRegistryClient) {
    this.client = client;
  }

  async validateWithRegistry(schemaId: number | undefined, value: unknown, enabled: boolean): Promise<void> {
    if (!enabled || !this.client || schemaId == null) return;
    const result = await this.client.validateValue(schemaId, value);
    if (!result.valid) {
      throw new Error(`Schema Registry validation failed: ${result.errors.map((e) => e.message || String(e)).join(', ')}`);
    }
  }

  validateWithZod<T>(schema: z.ZodSchema<T> | undefined, value: unknown): void {
    if (!schema) return;
    const validation = schema.safeParse(value);
    if (!validation.success) {
      const errorDetails = validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new Error(`Route schema validation failed: ${errorDetails}`);
    }
  }
}
