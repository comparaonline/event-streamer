/* istanbul ignore file */
export { emit, clearEmittedEvents, getEmittedEvents, getParsedEmittedEvents } from './producer';
export { setConfig } from './config';
export { Config, Debug, Callback, Output, Route, Input } from './interfaces';
export { ConsumerRouter } from './consumer';
export { SchemaRegistryProducer } from './producer/schema-registry-producer';
export { SchemaRegistryConsumerRouter } from './consumer/schema-registry-consumer';
export { SchemaRegistryClient } from './schema-registry/client';
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
