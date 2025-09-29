import { randomUUID } from 'crypto';
import { SchemaRegistryClient } from '../client';
import { SchemaRegistryProducer } from '../../producer/schema-registry-producer';
import { SchemaRegistryConsumerRouter } from '../../consumer/schema-registry-consumer';
import { setConfig } from '../../config';
import { createBaseEvent } from '../../schemas';
import { UserRegisteredSchema, UserRegisteredSchemaRegistrySchema, type UserRegistered } from '../../__fixtures__/schemas/user-registered.schema';

// Mock debug function to avoid config initialization issues while preserving other functions
vi.mock('../../helpers', async () => {
  const actual = await vi.importActual<typeof import('../../helpers')>('../../helpers');
  return {
    ...actual,
    debug: vi.fn(),
  };
});

describe('Simple Schema Registry Integration Test', () => {
  const SCHEMA_REGISTRY_URL = process.env.SCHEMA_REGISTRY_URL || 'http://localhost:8081';
  const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:9092';

  let client: SchemaRegistryClient;
  let producer: SchemaRegistryProducer;
  let consumer: SchemaRegistryConsumerRouter;
  let eventCode: string;
  let testTopic: string;

  beforeAll(async () => {
    console.log('🔧 Setting up simple integration test...');

    eventCode = `UserRegistered${Date.now()}`;
    testTopic = `simple-test-${Date.now()}`;

    // Configure for integration testing
    setConfig({
      host: KAFKA_BROKERS,
      consumer: { groupId: `simple-test-${Date.now()}` },
      schemaRegistry: { url: SCHEMA_REGISTRY_URL },
      producer: { useSchemaRegistry: true },
      onlyTesting: false
    });

    client = new SchemaRegistryClient({ url: SCHEMA_REGISTRY_URL });
    producer = new SchemaRegistryProducer();
    consumer = new SchemaRegistryConsumerRouter();

    // Register schema using topic-based subject name that producer will use
    console.log(`📝 Registering ${eventCode} schema...`);
    try {
      // We need to manually construct the subject that producer will expect
      const expectedSubject = client.getSubjectFromTopicAndEventCode(testTopic, eventCode);

      // Register directly with Schema Registry using the computed subject
      const { zodToJsonSchema } = await import('zod-to-json-schema');
      const jsonSchema = zodToJsonSchema(UserRegisteredSchemaRegistrySchema, { target: 'jsonSchema7' });

      const registry = (client as any).registry;
      const registrationResult = await registry.register({ type: 'JSON', schema: JSON.stringify(jsonSchema) }, { subject: expectedSubject });

      const schemaId = typeof registrationResult === 'object' ? registrationResult.id : registrationResult;
      console.log(`✅ ${eventCode} schema registered with subject ${expectedSubject} and ID: ${schemaId}`);
    } catch (error) {
      console.error('❌ Schema registration failed:', error);
      throw error;
    }
  }, 30000);

  afterAll(async () => {
    if (consumer) {
      await consumer.stop();
    }
    if (client) {
      client.disconnect();
    }
  });

  it('should produce and consume a UserRegistered event end-to-end', async () => {
    // Use the pre-defined topic from beforeAll
    const receivedEvents: UserRegistered[] = [];

    // Set up consumer
    consumer.addWithSchema(
      testTopic,
      eventCode,
      async (event: UserRegistered) => {
        receivedEvents.push(event);
      },
      { schema: UserRegisteredSchema }
    );

    // Start consumer
    await consumer.start();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Create test event following MVP pattern
    const testEvent: UserRegistered = {
      ...createBaseEvent({
        code: eventCode,
        appName: 'simple-test'
      }),
      userId: randomUUID(),
      email: 'simple-test@example.com',
      registrationSource: 'api',
      metadata: {
        ipAddress: '10.0.0.1',
        userAgent: 'Test/1.0'
      }
    };

    // Produce event
    await producer.emitWithSchema({
      topic: testTopic,
      eventCode: eventCode,
      data: testEvent,
      schema: UserRegisteredSchema
    });

    // Wait for message to be consumed
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verify event was received and validated
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]).toMatchObject({
      userId: testEvent.userId,
      email: testEvent.email,
      registrationSource: testEvent.registrationSource,
      code: eventCode,
      appName: 'simple-test'
    });

    console.log('✅ Simple integration test completed successfully');
  }, 30000);
});


