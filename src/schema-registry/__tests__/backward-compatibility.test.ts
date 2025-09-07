import { z } from 'zod';
import { randomUUID } from 'crypto';
import { SchemaRegistryConsumerRouter } from '../../consumer/schema-registry-consumer';
import { setConfig } from '../../config';
import { BaseEventSchema, createBaseEvent } from '../../schemas';
import { SchemaRegistryClient } from '../client';

// Mock Kafka dependencies
jest.mock('kafkajs');

// Test event schema
const TestEventSchema = BaseEventSchema.extend({
  testId: z.string().uuid(),
  message: z.string(),
  status: z.enum(['success', 'failure', 'pending'])
});

describe('Schema Registry Backward Compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Configure event-streamer for testing
    setConfig({
      host: 'localhost:9092',
      consumer: { groupId: 'test-group' },
      schemaRegistry: {
        url: 'http://localhost:8081',
        auth: { username: 'test', password: 'test' }
      },
      producer: {
        useSchemaRegistry: true
      },
      onlyTesting: true
    });
  });

  describe('Schema Registry Client', () => {
    it('should detect Schema Registry encoded buffers', () => {
      const schemaRegistryBuffer = Buffer.alloc(10);
      schemaRegistryBuffer[0] = 0x00; // Magic byte
      schemaRegistryBuffer.writeInt32BE(123, 1); // Schema ID

      const jsonBuffer = Buffer.from(JSON.stringify({ test: 'data' }));

      expect(SchemaRegistryClient.isSchemaRegistryEncoded(schemaRegistryBuffer)).toBe(true);
      expect(SchemaRegistryClient.isSchemaRegistryEncoded(jsonBuffer)).toBe(false);
    });

    it('should handle empty or invalid buffers', () => {
      const emptyBuffer = Buffer.alloc(0);
      const shortBuffer = Buffer.alloc(3);

      expect(SchemaRegistryClient.isSchemaRegistryEncoded(emptyBuffer)).toBe(false);
      expect(SchemaRegistryClient.isSchemaRegistryEncoded(shortBuffer)).toBe(false);
    });
  });

  describe('Consumer Schema Validation', () => {
    let consumer: SchemaRegistryConsumerRouter;

    beforeEach(() => {
      consumer = new SchemaRegistryConsumerRouter();
    });

    it('should accept Schema Registry consumer setup', () => {
      expect(consumer).toBeDefined();

      let handlerCalled = false;

      consumer.addWithSchema(
        'test-topic',
        async () => {
          handlerCalled = true;
        },
        { schema: TestEventSchema }
      );

      expect(handlerCalled).toBe(false);
    });

    it('should accept event-name based routing', () => {
      let handlerCalled = false;

      consumer.addWithSchema(
        'test-topic',
        'TestEvent',
        async () => {
          handlerCalled = true;
        },
        { schema: TestEventSchema }
      );

      expect(handlerCalled).toBe(false);
    });
  });

  describe('Base Event Schema', () => {
    it('should create valid base events', () => {
      const baseEvent = createBaseEvent({
        code: 'TestEvent',
        appName: 'test-service'
      });

      expect(baseEvent.code).toBe('TestEvent');
      expect(baseEvent.appName).toBe('test-service');
      expect(baseEvent.createdAt).toBeDefined();
    });

    it('should validate test event schema', () => {
      const validEvent = {
        code: 'TestEvent',
        createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19) + 'Z',
        appName: 'test-service',
        testId: randomUUID(),
        message: 'Test message',
        status: 'success' as const
      };

      const result = TestEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it('should reject invalid test event', () => {
      const invalidEvent = {
        code: 'TestEvent',
        createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19) + 'Z',
        appName: 'test-service',
        testId: 'not-a-uuid',
        message: 'Test message',
        status: 'invalid-status'
      };

      const result = TestEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });
  });
});
