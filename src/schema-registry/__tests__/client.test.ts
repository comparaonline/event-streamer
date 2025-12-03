import { setConfig } from '../../config';
import { SchemaRegistryClient } from '../client';

describe('SchemaRegistryClient', () => {
  it('throws when schema registry url is missing', () => {
    setConfig({
      host: 'localhost:9092',
      onlyTesting: true
    });
    expect(() => new SchemaRegistryClient()).toThrow('Schema Registry not configured. Please set config.schemaRegistry.url');
  });

  it('encodes and decodes with JSON fallback', async () => {
    const client = new SchemaRegistryClient({ url: 'http://localhost:8081' });
    const payload = { hello: 'world' };
    const subject = 'test-subject';
    const buf = await client.encode(subject, payload);
    expect(Buffer.isBuffer(buf)).toBe(true);
    const decoded = await client.decode(buf);
    expect(decoded).toMatchObject({ subject, payload });
  });
});
