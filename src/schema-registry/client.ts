import { SchemaRegistry, SchemaType } from '@kafkajs/confluent-schema-registry';
import { SchemaRegistryConfig } from '../schemas';
import { debug } from '../helpers';
import { Debug } from '../interfaces';
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
  private registry: SchemaRegistry;
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

    debug(Debug.INFO, 'Schema Registry client initialized with dual caching strategy', { url: config.url });
  }

  // Producer method: Get latest schema by subject (startup caching)
  async getLatestSchemaForProducer(subject: string): Promise<CachedSchema> {
    if (this.subjectCache.has(subject)) {
      const cached = this.subjectCache.get(subject);
      if (cached) {
        debug(Debug.TRACE, 'Retrieved schema from subject cache', { subject, schemaId: cached.id });
        return cached;
      }
    }

    try {
      const latestId = await this.registry.getLatestSchemaId(subject);
      const schema = await this.registry.getSchema(latestId);

      const cachedSchema: CachedSchema = {
        id: latestId,
        version: -1, // Version not directly available from latest API
        subject: subject,
        schema: schema,
        jsonSchema: typeof schema === 'object' ? schema : JSON.parse(schema as string),
        validator: undefined // Will be compiled on demand
      };

      // Compile JSON Schema validator if it's a JSON Schema
      if (cachedSchema.jsonSchema) {
        try {
          cachedSchema.validator = this.ajv.compile(cachedSchema.jsonSchema);
        } catch (compileError) {
          debug(Debug.WARN, 'Failed to compile JSON schema validator', { subject, error: compileError });
        }
      }

      this.subjectCache.set(subject, cachedSchema);
      debug(Debug.DEBUG, 'Cached latest schema for producer', { subject, schemaId: latestId });

      return cachedSchema;
    } catch (error) {
      debug(Debug.ERROR, 'Failed to fetch latest schema for producer', { subject, error });
      throw new Error(`Failed to fetch schema for subject ${subject}: ${error}`);
    }
  }

  // Consumer method: Get schema by ID (immutable caching)
  async getSchemaForConsumer(schemaId: number): Promise<CachedSchema> {
    if (this.schemaIdCache.has(schemaId)) {
      const cached = this.schemaIdCache.get(schemaId);
      if (cached) {
        debug(Debug.TRACE, 'Retrieved schema from ID cache', { schemaId });
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
        } catch (compileError) {
          debug(Debug.WARN, 'Failed to compile JSON schema validator', { schemaId, error: compileError });
        }
      }

      this.schemaIdCache.set(schemaId, cachedSchema);
      debug(Debug.DEBUG, 'Cached schema for consumer', { schemaId });

      return cachedSchema;
    } catch (error) {
      debug(Debug.ERROR, 'Failed to fetch schema for consumer', { schemaId, error });
      throw new Error(`Failed to fetch schema with ID ${schemaId}: ${error}`);
    }
  }

  // Validation method using cached validators
  validateDataAgainstSchema(data: unknown, cachedSchema: CachedSchema): { valid: boolean; errors?: any[] } {
    if (!cachedSchema.validator) {
      debug(Debug.WARN, 'No validator available for schema', { schemaId: cachedSchema.id });
      return { valid: true }; // Skip validation if no validator
    }

    const valid = cachedSchema.validator(data);
    if (valid) {
      return { valid: true };
    } else {
      return {
        valid: false,
        errors: cachedSchema.validator.errors || []
      };
    }
  }

  // Producer method: Validate and encode with cached schema
  async validateAndEncode(subject: string, data: unknown): Promise<Buffer> {
    let cachedSchema: CachedSchema | undefined;

    try {
      // Get cached schema for validation
      cachedSchema = await this.getLatestSchemaForProducer(subject);

      // Skip local validation for now - let Schema Registry handle it
      debug(Debug.TRACE, 'Skipping local validation, letting Schema Registry validate', { subject });

      // Encode with Schema Registry
      debug(Debug.INFO, 'Attempting to encode data', {
        subject,
        schemaId: cachedSchema.id,
        dataKeys: data && typeof data === 'object' ? Object.keys(data as object) : 'not-object',
        dataPreview: JSON.stringify(data, null, 2).substring(0, 500)
      });

      const encoded = await this.registry.encode(cachedSchema.id, data);

      debug(Debug.TRACE, 'Validated and encoded data with Schema Registry', { subject, schemaId: cachedSchema.id });
      return encoded;
    } catch (error) {
      debug(Debug.ERROR, 'Failed to validate and encode data', {
        subject,
        schemaId: cachedSchema?.id || 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        schemaExists: cachedSchema ? 'yes' : 'no'
      });

      throw new Error(`Failed to validate and encode data for subject ${subject}: ${error instanceof Error ? error.message : String(error)}`);
    }
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

      debug(Debug.TRACE, 'Decoded Schema Registry data', { schemaId });

      let validationResult;
      if (validateAgainstSchema) {
        // Get cached schema for validation
        const cachedSchema = await this.getSchemaForConsumer(schemaId);
        validationResult = this.validateDataAgainstSchema(decodedValue, cachedSchema);

        return {
          value: decodedValue,
          schemaId,
          valid: validationResult.valid,
          validationErrors: validationResult.errors
        };
      }

      return { value: decodedValue, schemaId };
    } catch (error) {
      debug(Debug.ERROR, 'Failed to decode and validate buffer', { error });
      throw new Error(`Failed to decode Schema Registry buffer: ${error}`);
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
    debug(Debug.DEBUG, 'All schema caches cleared');
  }

  // Pre-load schemas for known subjects (startup optimization)
  async preloadSchemasForProducer(subjects: string[]): Promise<void> {
    const promises = subjects.map((subject) =>
      this.getLatestSchemaForProducer(subject).catch((error) => {
        debug(Debug.WARN, 'Failed to preload schema', { subject, error });
      })
    );

    await Promise.all(promises);
    debug(Debug.INFO, 'Preloaded schemas for producer', { subjects, cacheSize: this.subjectCache.size });
  }

  // Get subject name from topic and event code to avoid collisions
  getSubjectFromTopicAndEventCode(topic: string, eventCode: string): string {
    // Format: {topic}-{event-code} to avoid cross-topic collisions (no confusing -value suffix)
    return `${this.toKebabCase(topic)}-${this.toKebabCase(eventCode)}`;
  }

  // Backward compatibility method - deprecated, use getSubjectFromTopicAndEventCode
  getSubjectFromEventCode(eventCode: string): string {
    // Legacy format without -value suffix for cleaner naming
    return `${this.toKebabCase(eventCode)}`;
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
          type: 'JSON' as any,
          schema: JSON.stringify(jsonSchema)
        },
        { subject }
      );

      // Extract schema ID from result
      const schemaId = typeof registrationResult === 'object' ? registrationResult.id : registrationResult;

      debug(Debug.INFO, 'Registered schema', { eventName, subject, schemaId });
      return schemaId as number;
    } catch (error) {
      debug(Debug.ERROR, 'Failed to register schema', { eventName, error });
      throw new Error(`Failed to register schema for event ${eventName}: ${error}`);
    }
  }

  // Helper method to convert to kebab-case (following MVP pattern)
  private toKebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }
}
