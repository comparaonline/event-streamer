import { z } from 'zod';
import { BaseEvent, BaseEventSchema, createBaseEvent } from './base';

// Re-export base schema and types
export * from './base';

// Legacy events allow any additional properties for backward compatibility
export const LegacyEventSchema = BaseEventSchema.passthrough();

export type LegacyEvent = z.infer<typeof LegacyEventSchema>;

// Schema Registry events are identical to base events (no additional fields needed)
export const SchemaRegistryEventSchema = BaseEventSchema;

export type SchemaRegistryEvent = BaseEvent;

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

// Factory function to create Schema Registry events (now identical to createBaseEvent)
export function createSchemaRegistryEvent(data: { code: string } & Partial<BaseEvent>): BaseEvent {
  return createBaseEvent(data);
}

// Dead Letter Queue exports
export { DeadLetterQueueSchema, DeadLetterQueueEvent, createDeadLetterQueueEvent } from './dead-letter-queue.schema';
