import { z } from 'zod';
import { randomUUID } from 'crypto';

// Base event schema matching legacy producer/consumer exactly
export const BaseEventSchema = z.object({
  // Event classification - always required (legacy auto-generates this)
  code: z.string().min(1).describe('Event type code in UpperCamelCase'),

  // Timing information - optional (legacy auto-generates if not provided)
  createdAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z$/, 'Must be in YYYY-MM-DD HH:mm:ssZ format')
    .optional()
    .describe('Timestamp when event was created (YYYY-MM-DD HH:mm:ssZ format)'),

  // Source identification - optional (legacy auto-detects from config/hostname)
  appName: z.string().min(1).optional().describe('Service that produced the event')
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;

// Legacy events allow any additional properties for backward compatibility
export const LegacyEventSchema = BaseEventSchema.passthrough();

export type LegacyEvent = z.infer<typeof LegacyEventSchema>;

// Schema Registry events extend base with additional metadata for registry
export const SchemaRegistryEventSchema = BaseEventSchema.extend({
  // Add unique identifier for Schema Registry events
  id: z.string().uuid().describe('Unique event identifier'),

  // Add version for schema evolution
  version: z.string().default('1.0.0').describe('Event schema version'),

  // Source service metadata (can be same as appName or different)
  source: z.string().min(1).describe('Service name for schema registry subject mapping')
});

export type SchemaRegistryEvent = z.infer<typeof SchemaRegistryEventSchema>;

export interface EventMetadata {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
  headers: Record<string, string>;
  isSchemaRegistryMessage?: boolean;
  schemaId?: number;
}

export type SchemaRegistryConfig = NonNullable<import('../interfaces').Config['schemaRegistry']>;
export type ExtendedConfig = import('../interfaces').Config;

// Utility types for event handlers
export type EventHandler<T = unknown> = (event: T, metadata: EventMetadata) => Promise<void> | void;

// Schema validation result
export interface SchemaValidationResult<T> {
  success: boolean;
  data?: T;
  error?: z.ZodError;
}

export function validateEvent<T>(schema: z.ZodSchema<T>, event: unknown): SchemaValidationResult<T> {
  try {
    const data = schema.parse(event);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error };
    }
    throw error;
  }
}

// Factory function to create base events with legacy-compatible defaults
export function createBaseEvent(data: Omit<BaseEvent, 'createdAt'> & Partial<Pick<BaseEvent, 'createdAt'>>): BaseEvent {
  return {
    createdAt: data.createdAt || new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z',
    ...data
  };
}

// Factory function to create Schema Registry events
export function createSchemaRegistryEvent(
  data: Omit<SchemaRegistryEvent, 'id' | 'createdAt'> & Partial<Pick<SchemaRegistryEvent, 'id' | 'createdAt'>>
): SchemaRegistryEvent {
  return {
    id: data.id || randomUUID(),
    createdAt: data.createdAt || new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z',
    ...data
  };
}
