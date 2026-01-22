import { setConfig } from '../../config';
import { SchemaRegistryConsumerRouter } from '../schema-registry-consumer';

describe('SchemaRegistryConsumerRouter config validation', () => {
  it('throws if schemaRegistry.url is missing', () => {
    setConfig({ host: 'localhost:9092', onlyTesting: true });
    expect(() => new SchemaRegistryConsumerRouter()).toThrow('SchemaRegistryConsumerRouter requires config.schemaRegistry.url');
  });

  it('does not throw when schemaRegistry.url is present', () => {
    setConfig({ host: 'localhost:9092', onlyTesting: true, schemaRegistry: { url: 'http://localhost:8081' } });
    expect(() => new SchemaRegistryConsumerRouter()).not.toThrow();
  });
});
