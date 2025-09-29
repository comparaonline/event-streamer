// Import removed - z not used directly in this test file
import { randomUUID } from 'crypto';
import { SchemaRegistryClient } from '../client';
import { SchemaRegistryProducer } from '../../producer/schema-registry-producer';
import { SchemaRegistryConsumerRouter } from '../../consumer/schema-registry-consumer';
import { setConfig } from '../../config';
import { createBaseEvent } from '../../schemas';
import { UserRegisteredSchema, type UserRegistered } from '../../__fixtures__/schemas/user-registered.schema';

// Mock debug function to avoid config initialization issues while preserving other functions
vi.mock('../../helpers', async () => {
  const actual = await vi.importActual<typeof import('../../helpers')>('../../helpers');
  return {
    ...actual,
    debug: vi.fn(),
  };
});

// Real integration tests - requires Docker containers to be running
// Run with: docker-compose up -d && npm run test:integration:sr
describe('Schema Registry Integration Tests', () => {
  const SCHEMA_REGISTRY_URL = process.env.SCHEMA_REGISTRY_URL || 'http://localhost:8081';
  const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:9092';

  let client: SchemaRegistryClient;
  let producer: SchemaRegistryProducer;
  let consumer: SchemaRegistryConsumerRouter;
  let uniqueEventCode: string;

  // Test schemas are imported from fixtures

  beforeAll(async () => {
    // Configure for integration testing
    setConfig({
      host: KAFKA_BROKERS,
      consumer: { groupId: `integration-test-${Date.now()}` },
      schemaRegistry: {
        url: SCHEMA_REGISTRY_URL
      },
      producer: {
        useSchemaRegistry: true
      },
      onlyTesting: false // Use real Kafka
    });

    client = new SchemaRegistryClient({ url: SCHEMA_REGISTRY_URL });
    producer = new SchemaRegistryProducer();
    consumer = new SchemaRegistryConsumerRouter();

    // Register schemas used in tests with topic-based subjects to match new naming
    const timestamp = Date.now();
    uniqueEventCode = `UserRegistered-${timestamp}`;
    try {
      const { zodToJsonSchema } = await import('zod-to-json-schema');
      const registry = (client as any).registry;

      // Register schema with topic-based subject
      const userRegisteredSubject = client.getSubjectFromTopicAndEventCode('users', uniqueEventCode);
      const userRegisteredJsonSchema = zodToJsonSchema(UserRegisteredSchema, { target: 'jsonSchema7' });
      await registry.register({ type: 'JSON', schema: JSON.stringify(userRegisteredJsonSchema) }, { subject: userRegisteredSubject });

      console.log('✅ Registered UserRegisteredSchema with topic-based subject');
    } catch (error) {
      console.log('⚠️ Schema registration:', (error as Error).message);
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

  describe('Schema Publishing and Retrieval', () => {
    it('should publish and retrieve schemas from Schema Registry', async () => {
      // const testSubject = `test-user-registered-${Date.now()}-value`;

      // Create a test event with Schema Registry envelope
      const userEvent = {
        ...createBaseEvent({
          code: uniqueEventCode,
          appName: 'integration-test'
        }),
        userId: randomUUID(),
        email: 'test@example.com',
        registrationSource: 'web',
        metadata: {
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0 Test Browser'
        }
      };

      // Validate and encode the event
      const subject = client.getSubjectFromTopicAndEventCode('users', uniqueEventCode);
      const encoded = await client.encode(subject, UserRegisteredSchema, userEvent);
      expect(encoded).toBeInstanceOf(Buffer);
      expect(encoded.length).toBeGreaterThan(5); // Has magic byte + schema ID + data

      // Decode the event
      const decoded = await client.decodeAndValidate(encoded, true);
      expect(decoded.value).toEqual(userEvent);
      expect(decoded.schemaId).toBeGreaterThan(0);
      expect(decoded.valid).toBe(true);
    }, 15000);

    it('should handle schema evolution correctly', async () => {
      // const baseSubject = `test-schema-evolution-${Date.now()}-value`;

      // Version 1: UserRegistered event (matches the registered schema)
      const eventV1 = {
        ...createBaseEvent({ code: 'UserRegistered', appName: 'integration-test' }),
        userId: randomUUID(),
        email: 'john.doe@example.com',
        registrationSource: 'web' as const
      };

      const subject = client.getSubjectFromTopicAndEventCode('users', uniqueEventCode);
      const encodedV1 = await client.encode(subject, UserRegisteredSchema, eventV1);
      const decodedV1 = await client.decodeAndValidate(encodedV1);

      expect(decodedV1.value).toMatchObject({
        userId: eventV1.userId,
        email: 'john.doe@example.com',
        registrationSource: 'web'
      });

      // Version 2: Add optional metadata (backward compatible)
      const eventV2 = {
        ...createBaseEvent({ code: 'UserRegistered', appName: 'integration-test' }),
        userId: randomUUID(),
        email: 'jane.smith@example.com',
        registrationSource: 'api' as const,
        metadata: {
          ipAddress: '10.0.0.1',
          userAgent: 'Test Agent'
        }
      };

      const encodedV2 = await client.encode(subject, UserRegisteredSchema, eventV2);
      const decodedV2 = await client.decodeAndValidate(encodedV2);

      expect(decodedV2.value).toMatchObject({
        userId: eventV2.userId,
        email: 'jane.smith@example.com',
        registrationSource: 'api',
        metadata: {
          ipAddress: '10.0.0.1',
          userAgent: 'Test Agent'
        }
      });

      // Both should use the same schema (UserRegistered) so same schema ID
      expect(decodedV1.schemaId).toEqual(decodedV2.schemaId);
    }, 20000);
  });

  describe('Producer-Consumer Integration', () => {
    it('should produce and consume Schema Registry events end-to-end', async () => {
      const testTopic = `test-topic-${Date.now()}`;
      const receivedEvents: UserRegistered[] = [];

      // Set up consumer
      consumer.addWithSchema(
        testTopic,
        uniqueEventCode,
        async (event: UserRegistered) => {
          receivedEvents.push(event);
        },
        { schema: UserRegisteredSchema, validateWithRegistry: true }
      );

      // Start consumer (in a real environment, this would be long-running)
      await consumer.start();

      // Wait a moment for consumer to initialize
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Ensure schema is registered for this topic/event subject
      try {
        const { zodToJsonSchema } = await import('zod-to-json-schema');
        const registry = (client as any).registry;
        const subject = client.getSubjectFromTopicAndEventCode(testTopic, uniqueEventCode);
        const jsonSchema = zodToJsonSchema(UserRegisteredSchema, { target: 'jsonSchema7' });
        await registry.register({ type: 'JSON', schema: JSON.stringify(jsonSchema) }, { subject });
      } catch (_e) {
        // ignore if already exists
      }

      // Produce events
      const testUser: UserRegistered = {
        ...createBaseEvent({
          code: uniqueEventCode,
          appName: 'integration-test'
        }),
        userId: randomUUID(),
        email: 'integration-test@example.com',
        registrationSource: 'api',
        metadata: {
          ipAddress: '10.0.0.1'
        }
      };

      await producer.emitWithSchema({
        topic: testTopic,
        eventCode: uniqueEventCode,
        data: testUser,
        schema: UserRegisteredSchema
      });

      // Wait for message to be consumed
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verify event was received and validated
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toMatchObject({
        userId: testUser.userId,
        email: testUser.email,
        registrationSource: testUser.registrationSource
      });

      await consumer.stop();
    }, 30000);

    it('should handle mixed JSON and Schema Registry messages', async () => {
      const testTopic = `test-mixed-${Date.now()}`;
      const receivedEvents: any[] = [];

      // Consumer that handles both formats
      consumer.addWithSchema(testTopic, async (event: any, metadata: any) => {
        receivedEvents.push({ event, isSchemaRegistry: metadata.isSchemaRegistryMessage });
      });

      await consumer.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Ensure schema is registered for this topic/event subject
      try {
        const { zodToJsonSchema } = await import('zod-to-json-schema');
        const registry = (client as any).registry;
        const subject = client.getSubjectFromTopicAndEventCode(testTopic, uniqueEventCode);
        const jsonSchema = zodToJsonSchema(UserRegisteredSchema, { target: 'jsonSchema7' });
        await registry.register({ type: 'JSON', schema: JSON.stringify(jsonSchema) }, { subject });
      } catch (_e) {
        // ignore if already exists
      }

      // Send Schema Registry message
      const srEvent: UserRegistered = {
        ...createBaseEvent({
          code: uniqueEventCode,
          appName: 'integration-test'
        }),
        userId: randomUUID(),
        email: 'sr-test@example.com',
        registrationSource: 'web'
      };

      await producer.emitWithSchema({
        topic: testTopic,
        data: srEvent,
        schema: UserRegisteredSchema
      });

      // Send legacy JSON message (fallback)
      const jsonEvent: UserRegistered = {
        ...createBaseEvent({
          code: uniqueEventCode,
          appName: 'integration-test'
        }),
        userId: randomUUID(),
        email: 'json-test@example.com',
        registrationSource: 'mobile'
      };

      // Force JSON fallback by temporarily disabling SR
      setConfig({
        host: KAFKA_BROKERS,
        consumer: { groupId: `integration-test-${Date.now()}` },
        producer: { useSchemaRegistry: false },
        onlyTesting: false
      });

      const jsonProducer = new SchemaRegistryProducer();
      await jsonProducer.emitWithSchema({
        topic: testTopic,
        data: jsonEvent,

        schema: UserRegisteredSchema
      });

      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Should have received both messages
      expect(receivedEvents).toHaveLength(2);

      const srMessage = receivedEvents.find((e) => e.isSchemaRegistry);
      const jsonMessage = receivedEvents.find((e) => !e.isSchemaRegistry);

      expect(srMessage).toBeDefined();
      expect(jsonMessage).toBeDefined();

      expect(srMessage.event.email).toBe('sr-test@example.com');
      expect(jsonMessage.event.email).toBe('json-test@example.com');
    }, 45000);
  });

  describe('Error Handling', () => {
    it('should handle Schema Registry unavailable gracefully', async () => {
      // Create client with invalid URL
      const invalidClient = new SchemaRegistryClient({
        url: 'http://invalid-host:8081'
      });

      const testEvent = {
        ...createBaseEvent({ code: 'TestEvent', appName: 'test' }),
        field: 'value'
      };

      await expect(invalidClient.encode('test-subject-value', UserRegisteredSchema, testEvent)).rejects.toThrow();
    });

    it('should validate schema compliance and reject invalid data', async () => {
      const invalidEvent = {
        ...createBaseEvent({ code: 'UserRegistered', appName: 'test' }),
        userId: 'not-a-uuid', // Invalid UUID
        email: 'not-an-email', // Invalid email
        registrationSource: 'invalid-source' as any // Invalid enum
      };

      // Register a test schema first with topic-based naming
      try {
        const { zodToJsonSchema } = await import('zod-to-json-schema');
        const registry = (client as any).registry;
        const testValidationSubject = client.getSubjectFromTopicAndEventCode('test', 'TestValidation');
        const testValidationJsonSchema = zodToJsonSchema(UserRegisteredSchema, { target: 'jsonSchema7' });
        await registry.register({ type: 'JSON', schema: JSON.stringify(testValidationJsonSchema) }, { subject: testValidationSubject });
      } catch (_error) {
        // Ignore registration errors for this test
      }

      const testSubject = client.getSubjectFromTopicAndEventCode('test', 'TestValidation');
      await expect(client.encode(testSubject, UserRegisteredSchema, invalidEvent)).rejects.toThrow('invalid payload');
    });
  });
});


