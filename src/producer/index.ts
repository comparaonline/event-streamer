// Legacy producer exports (backward compatibility)
export { emit, clearEmittedEvents, getEmittedEvents, getParsedEmittedEvents, createProducer, getProducer, closeAll } from './legacy-producer';
// Schema Registry producer (opt-in)
export { SchemaRegistryProducer } from './schema-registry-producer';
