import { SchemaRegistry, SchemaType } from '@kafkajs/confluent-schema-registry';
import { z } from 'zod';
import { SchemaRegistryConfig } from '../schemas';
import Ajv, { ValidateFunction } from 'ajv';
import { createAjvInstance } from '../utils/ajv';

interface SchemaInfo {
  id: number;
  version: number;
  subject: string;
  schema: any; // Raw schema from registry
}

interface CachedSchema extends SchemaInfo {
  jsonSchema?: object; // Parsed JSON schema for validation
  validator?: ValidateFunction; // Compiled validator
}

export class SchemaRegistryClient {
  public get aRegistry(): SchemaRegistry {
    return this.registry;
  }
  // Schema ID-based cache (immutable, no TTL)
  private schemaIdCache = new Map<number, CachedSchema>();
  // Subject-based cache (startup only, no TTL)
  private subjectCache = new Map<string, CachedSchema>();
  private config: SchemaRegistryConfig;
  private ajv: Ajv;

  constructor(config: SchemaRegistryConfig) {
    this.config = config;

    // Initialize AJV for JSON schema validation
    this.ajv = createAjvInstance();

    const registryOptions: any = {
      host: config.url
    };

    if (config.auth) {
      registryOptions.auth = {
        username: config.auth.username,
        password: config.auth.password
      };
    }

    // Configure Schema Registry with AJV instance
    this.registry = new SchemaRegistry(registryOptions, {
      [SchemaType.JSON]: {
        ajvInstance: this.ajv
      }
    });
  }

  public disconnect(): void {
    // Placeholder for future implementation if the underlying library supports it.
  }

  

  // Producer method: Look up schema ID and encode data.
  async encode(subject: string, schema: z.ZodSchema<any>, data: unknown): Promise<Buffer> {
    try {
      // 1. Convert Zod schema to a canonical JSON schema string.
      const { zodToJsonSchema } = await import('zod-to-json-schema');
      const jsonSchema = zodToJsonSchema(schema, { target: 'jsonSchema7' });
      const canonicalSchemaString = JSON.stringify(jsonSchema);

      // 2. Look up the schema ID using the method you pointed out.
      // This will throw an error if the schema is not found.
      const id = await this.getRegistryIdBySchema(subject, canonicalSchemaString);

      // 3. Encode the data using the specific ID.
      return this.registry.encode(id, data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Re-throw a more specific error for validation failures.
      if (/invalid payload/i.test(message)) {
        throw new Error(`Schema validation failed for subject ${subject}: ${message}`);
      }

      throw new Error(`Failed to encode data for subject ${subject}: ${message}`);
    }
  }

  private async getSchemaForConsumer(schemaId: number): Promise<CachedSchema> {
    if (this.schemaIdCache.has(schemaId)) {
      const cached = this.schemaIdCache.get(schemaId);
      if (cached) {
        return cached;
      }
    }

    try {
      const schema = await this.registry.getSchema(schemaId);

      const cachedSchema: CachedSchema = {
        id: schemaId,
        version: -1, // Version not available when fetching by ID
        subject: '', // Subject not available when fetching by ID
        schema: schema,
        jsonSchema: typeof schema === 'object' ? schema : JSON.parse(schema as string),
        validator: undefined // Will be compiled on demand
      };

      // Compile JSON Schema validator if it's a JSON Schema
      if (cachedSchema.jsonSchema) {
        try {
          cachedSchema.validator = this.ajv.compile(cachedSchema.jsonSchema);
        } catch (_compileError) {
          // ignore compile error
        }
      }

      this.schemaIdCache.set(schemaId, cachedSchema);

      return cachedSchema;
    } catch (error) {
      throw new Error(`Failed to fetch schema with ID ${schemaId}: ${error}`);
    }
  }

  async getRegistryIdBySchema(subject: string, schemaString: string): Promise<number> {
    return this.registry.getRegistryIdBySchema(subject, {
      type: SchemaType.JSON,
      schema: schemaString,
    });
  }

  // Consumer method: Decode and optionally validate with cached schema
  async decodeAndValidate(
    buffer: Buffer,
    validateAgainstSchema = false
  ): Promise<{
    value: unknown;
    schemaId: number;
    valid?: boolean;
    validationErrors?: any[];
  }> {
    try {
      // Check if buffer has Schema Registry magic byte
      if (buffer.length < 5 || buffer[0] !== 0) {
        throw new Error('Buffer is not Schema Registry encoded');
      }

      const decodedValue = await this.registry.decode(buffer);
      const schemaId = buffer.readInt32BE(1);

      if (validateAgainstSchema) {
        const cachedSchema = await this.getSchemaForConsumer(schemaId);
        
        if (!cachedSchema.validator) {
            return { value: decodedValue, schemaId, valid: true }; // Skip validation
        }

        const valid = cachedSchema.validator(decodedValue);
        const errors = !valid ? cachedSchema.validator.errors || [] : [];

        return {
          value: decodedValue,
          schemaId,
          valid,
          validationErrors: errors,
        };
      }

      return { value: decodedValue, schemaId };
    } catch (error) {
      throw new Error(`Failed to decode Schema Registry buffer: ${error}`);
    }
  }

  /**
   * Validate a decoded value against a schema by ID using the cached validator.
   * Returns { valid, errors }. If no validator is available, returns valid: true.
   */
  async validateValue(schemaId: number, value: unknown): Promise<{ valid: boolean; errors: any[] }> {
    try {
      const cachedSchema = await this.getSchemaForConsumer(schemaId);
      if (!cachedSchema.validator) {
        return { valid: true, errors: [] };
      }

      const isValid = cachedSchema.validator(value);
      return { valid: !!isValid, errors: isValid ? [] : cachedSchema.validator.errors || [] };
    } catch (error) {
      // Consider validation inconclusive as a schema error
      return { valid: false, errors: [{ message: String(error) }] };
    }
  }

  static isSchemaRegistryEncoded(buffer: Buffer): boolean {
    return buffer.length >= 5 && buffer[0] === 0;
  }

  // Cache management and utility methods
  getCacheStats(): {
    schemaIdCache: { size: number; schemaIds: number[] };
    subjectCache: { size: number; subjects: string[] };
  } {
    return {
      schemaIdCache: {
        size: this.schemaIdCache.size,
        schemaIds: Array.from(this.schemaIdCache.keys())
      },
      subjectCache: {
        size: this.subjectCache.size,
        subjects: Array.from(this.subjectCache.keys())
      }
    };
  }

  clearCaches(): void {
    this.schemaIdCache.clear();
    this.subjectCache.clear();
  }

  // Get subject name from topic and event code to avoid collisions
  getSubjectFromTopicAndEventCode(topic: string, eventCode: string): string {
    // Format: {topic}-{event-code} to avoid cross-topic collisions (no -value suffix)
    // Use same kebab-case logic as CLI and preserve existing hyphenation in eventCode
    return `${this.toKebabCase(topic)}-${this.toKebabCase(eventCode)}`;
  }

  // Register schema for testing purposes (clean naming)
  async registerSchema(eventName: string, schema: any): Promise<number> {
    try {
      // Convert event name to kebab-case subject (no confusing -value suffix)
      const subject = `${this.toKebabCase(eventName)}`;

      // Convert Zod schema to JSON schema (flat structure for Schema Registry)
      const { zodToJsonSchema } = await import('zod-to-json-schema');
      const { SchemaRegistryEventSchema } = await import('../schemas');
      // Merge business schema with internal SR envelope to include `source`
      const mergedSchema =
        schema && typeof (schema as any).merge === 'function' ? (SchemaRegistryEventSchema as any).merge(schema as any) : SchemaRegistryEventSchema;

      const jsonSchema = zodToJsonSchema(mergedSchema as any, {
        target: 'jsonSchema7'
      });

      // Register with Schema Registry
      const registrationResult = await this.registry.register(
        {
          type: SchemaType.JSON,
          schema: JSON.stringify(jsonSchema)
        },
        { subject }
      );

      // Extract schema ID from result
      const schemaId = typeof registrationResult === 'object' ? registrationResult.id : registrationResult;

      return schemaId as number;
    } catch (error) {
      throw new Error(`Failed to register schema for event ${eventName}: ${error}`);
    }
  }

  // Helper method to convert to kebab-case (following MVP pattern)
  private toKebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }
}
