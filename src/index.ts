/* istanbul ignore file */
// Legacy exports for backward compatibility
export { emit, clearEmittedEvents, getEmittedEvents, getParsedEmittedEvents } from './producer';
export { setConfig } from './config';
export { Config, Callback, Output, Route, Input } from './interfaces';
export { ConsumerRouter } from './consumer';

// Schema Registry exports
export { SchemaRegistryProducer } from './producer/schema-registry-producer';
export { SchemaRegistryConsumerRouter } from './consumer/schema-registry-consumer';
export { SchemaRegistryClient } from './schema-registry/client';

// Schema and type exports
export {
  BaseEventSchema,
  LegacyEventSchema,
  SchemaRegistryEventSchema,
  type BaseEvent,
  type LegacyEvent,
  type SchemaRegistryEvent,
  type EventMetadata,
  type EventHandler,
  type SchemaRegistryConfig,
  type ExtendedConfig,
  type SchemaValidationResult,
  validateEvent,
  createBaseEvent,
  createSchemaRegistryEvent
} from './schemas';
