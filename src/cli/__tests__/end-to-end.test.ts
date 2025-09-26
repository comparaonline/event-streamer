import { promises as fs } from 'fs';
import { join } from 'path';
import { SchemaRegistryClient } from '../../schema-registry/client';
import { SchemaRegistryProducer } from '../../producer/schema-registry-producer';
import { publishSchemas } from '../publish';
import { setConfig } from '../../config';

// Mock debug function
jest.mock('../../helpers', () => ({
  ...jest.requireActual('../../helpers'),
  debug: jest.fn()
}));

describe('CLI-Runtime Integration (End-to-End)', () => {
  const SCHEMA_REGISTRY_URL = process.env.SCHEMA_REGISTRY_URL || 'http://localhost:8081';
  let tempDir: string;
  let client: SchemaRegistryClient;

  beforeAll(async () => {
    // Create temp directory for test schemas
    tempDir = join(__dirname, '../../../temp-e2e-test');
    await fs.mkdir(tempDir, { recursive: true });

    client = new SchemaRegistryClient({ url: SCHEMA_REGISTRY_URL });
  });

  afterAll(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should ensure CLI and producer use same subject naming', async () => {
    // Create a proper test schema directly as JS (avoiding TS compilation issues)
    const schemaFileJs = join(tempDir, 'test-event.schema.js');
    const jsContent = `
const { z } = require('zod');

// Define BaseEventSchema directly to avoid import issues
const BaseEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().min(1),
  timestamp: z.string().datetime(),
  appName: z.string().min(1)
});

const TestEventSchema = BaseEventSchema.extend({
  testField: z.string(),
  value: z.number()
});

module.exports = { TestEventSchema };
`;
    await fs.writeFile(schemaFileJs, jsContent);

    try {
      const testTopic = 'orders';
      const testEventCode = 'TestEvent';

      console.log('🔍 Debug: Testing CLI publish process...');
      console.log('📁 Temp directory:', tempDir);
      console.log('📝 JS file path:', schemaFileJs);

      // First try dry-run to see what CLI would do
      console.log('📋 Dry-run CLI publish...');
      try {
        await publishSchemas({
          eventsDir: tempDir,
          topic: testTopic,
          registryUrl: SCHEMA_REGISTRY_URL,
          dryRun: true,
          force: true
        });
        console.log('✅ Dry-run completed successfully');
      } catch (error) {
        console.error('❌ Dry-run failed:', error);
        throw error;
      }

      // 1. CLI publishes schema with topic parameter (new consistent approach)
      console.log('🚀 Actual CLI publish...');
      try {
        await publishSchemas({
          eventsDir: tempDir,
          topic: testTopic,
          registryUrl: SCHEMA_REGISTRY_URL,
          dryRun: false,
          force: true
        });
        console.log('✅ CLI publish completed successfully');
      } catch (error) {
        console.error('❌ CLI publish failed:', error);
        throw error;
      }

      // 2. CLI should generate subject: "{topic}-{eventCode}" = "orders-test-event" (using consistent kebab-case)
      const expectedSubject = 'orders-test-event';

      // Verify CLI registered schema with expected subject
      let cliRegisteredSchema;
      try {
        cliRegisteredSchema = await client.getLatestSchemaForProducer(expectedSubject);
        expect(cliRegisteredSchema).toBeDefined();
      } catch (error) {
        throw new Error(`CLI should have registered schema with subject "${expectedSubject}" but it wasn't found: ${error}`);
      }

      // 3. Producer should generate identical subject
      setConfig({
        host: 'localhost:9092',
        consumer: { groupId: 'e2e-test' },
        schemaRegistry: { url: SCHEMA_REGISTRY_URL },
        producer: { useSchemaRegistry: true },
        onlyTesting: true
      });

      const producer = new SchemaRegistryProducer();
      const producerClient = (producer as any).schemaRegistryClient as SchemaRegistryClient;
      const producerSubject = producerClient.getSubjectFromTopicAndEventCode(testTopic, testEventCode);

      // 4. Verify subjects match exactly
      expect(producerSubject).toBe(expectedSubject);
      expect(cliRegisteredSchema.id).toBeGreaterThan(0);

      console.log(`✅ CLI and Producer both use subject: "${expectedSubject}" (format: {topic}-{eventCode})`);
    } finally {
      // Cleanup JS file
      try {
        await fs.unlink(schemaFileJs);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }, 30000);

  it('should verify CLI register call signature works', async () => {
    // This test specifically verifies the register() call signature fix
    // Mock the registry to capture the call signature
    const mockRegister = jest.fn();
    const mockRegistry = { register: mockRegister };
    const mockClient = { registry: mockRegistry } as any;

    const { registerSchemaToRegistry } = await import('../publish');

    await registerSchemaToRegistry(mockClient, 'test-subject', '{"type":"object"}');

    // Verify correct call signature: register(schema, options)
    expect(mockRegister).toHaveBeenCalledWith(
      {
        type: 'JSON',
        schema: '{"type":"object"}'
      },
      {
        subject: 'test-subject'
      }
    );
  });
});

// Skip this test if not running integration tests
if (process.env.RUN_INTEGRATION_TESTS !== 'true') {
  describe.skip('CLI-Runtime Integration (End-to-End)', () => {
    it('should be skipped - set RUN_INTEGRATION_TESTS=true to enable', () => {
      // Test is skipped when RUN_INTEGRATION_TESTS is not set to 'true'
    });
  });
}
