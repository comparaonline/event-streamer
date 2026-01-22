import { setConfig } from '../../config';
import { SchemaRegistryProducer } from '../schema-registry-producer';

describe('SchemaRegistryProducer config validation', () => {
  it('throws if producer.useSchemaRegistry is not true', () => {
    setConfig({ host: 'h:9092', onlyTesting: true, producer: { useSchemaRegistry: false }, schemaRegistry: { url: 'http://x' } } as any);
    expect(() => new SchemaRegistryProducer()).toThrow('SchemaRegistryProducer requires config.producer.useSchemaRegistry = true');
  });

  it('throws if schemaRegistry.url is missing', () => {
    setConfig({ host: 'h:9092', onlyTesting: true, producer: { useSchemaRegistry: true } } as any);
    expect(() => new SchemaRegistryProducer()).toThrow('SchemaRegistryProducer requires config.schemaRegistry.url');
  });

  it('does not throw when both flags are set', () => {
    setConfig({ host: 'h:9092', onlyTesting: true, producer: { useSchemaRegistry: true }, schemaRegistry: { url: 'http://localhost:8081' } } as any);
    expect(() => new SchemaRegistryProducer()).not.toThrow();
  });
});
