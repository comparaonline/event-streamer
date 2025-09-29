import { join } from 'path';
import { SchemaRegistryClient } from '../../schema-registry/client';
import { publishSchemas } from '../publish';
import { E2eTestEventSchema } from '../../__fixtures__/schemas/e2e-test-event.schema';

// Mock debug function
jest.mock('../../helpers', () => ({
  ...jest.requireActual('../../helpers'),
  debug: jest.fn()
}));

const shouldRun = process.env.RUN_INTEGRATION_TESTS === 'true';

const describeMaybe = shouldRun ? describe : describe.skip;

describeMaybe('CLI-Runtime Integration (End-to-End)', () => {
  const SCHEMA_REGISTRY_URL = process.env.SCHEMA_REGISTRY_URL || 'http://localhost:8081';
  let client: SchemaRegistryClient;

  beforeAll(() => {
    client = new SchemaRegistryClient({ url: SCHEMA_REGISTRY_URL });
  });

  it('should publish a fixed schema and verify its registration', async () => {
    const testTopic = 'e2e-topic';
    // Point directly to the compiled fixtures directory
    const eventsDir = join(__dirname, '../../../build/__fixtures__/schemas');

    // 1. Publish the schemas from the fixtures directory
    await publishSchemas({
      eventsDir,
      topic: testTopic,
      registryUrl: SCHEMA_REGISTRY_URL,
      dryRun: false,
      force: true
    });

    // 2. Verify the schema was registered with the correct subject
    const expectedSubject = 'e2e-topic-e2e-test-event'; // from topic and schema name
    const { zodToJsonSchema } = await import('zod-to-json-schema');
    const jsonSchema = zodToJsonSchema(E2eTestEventSchema, { target: 'jsonSchema7' });
    const schemaString = JSON.stringify(jsonSchema);

    const schemaId = await client.getRegistryIdBySchema(expectedSubject, schemaString);
    expect(schemaId).toBeGreaterThan(0);
  }, 30000);
});
