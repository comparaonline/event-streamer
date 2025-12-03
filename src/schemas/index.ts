import { z } from 'zod';
import type { Config } from '../interfaces';
import { BaseEventSchema, type BaseEvent, type EventMetadata, createBaseEvent } from './base';

export const LegacyEventSchema = BaseEventSchema;
export type LegacyEvent = BaseEvent;

export const SchemaRegistryEventSchema = BaseEventSchema.extend({
  // Placeholder for SR-specific properties in the future
});
export type SchemaRegistryEvent = z.infer<typeof SchemaRegistryEventSchema>;

export type EventHandler<T = BaseEvent> = (event: T) => Promise<void> | void;

export type SchemaRegistryConfig = NonNullable<Config['schemaRegistry']>;
export type ExtendedConfig = Config;

export type SchemaValidationResult = { valid: true; errors?: undefined } | { valid: false; errors: string[] };

export function validateEvent<T extends z.ZodTypeAny>(schema: T, value: unknown): SchemaValidationResult {
  const result = schema.safeParse(value);
  if (result.success) return { valid: true };
  return { valid: false, errors: result.error.errors.map((e) => e.message) };
}

export function createSchemaRegistryEvent(input: SchemaRegistryEvent): SchemaRegistryEvent {
  const parsed = SchemaRegistryEventSchema.parse(input);
  return parsed;
}

export { BaseEventSchema, type BaseEvent, type EventMetadata, createBaseEvent };
