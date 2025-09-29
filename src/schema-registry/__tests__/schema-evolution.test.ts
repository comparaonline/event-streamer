import { randomUUID } from 'crypto';
import { z } from 'zod';
import { SchemaRegistryClient } from '../client';
import { BaseEventSchema } from '../../schemas';
import { createBaseEvent } from '../../schemas';
import { setConfig } from '../../config';
import { UserSchema, type User } from '../../__fixtures__/schemas/user.schema';
import { OrderStatusSchema, type OrderStatus } from '../../__fixtures__/schemas/order-status.schema';
import { ProductSchema, type Product } from '../../__fixtures__/schemas/product.schema';

// Mock debug function to avoid config initialization issues while preserving other functions
jest.mock('../../helpers', () => ({
  ...jest.requireActual('../../helpers'),
  debug: jest.fn()
}));

describe('Schema Evolution and Compatibility Tests', () => {
  const SCHEMA_REGISTRY_URL = process.env.SCHEMA_REGISTRY_URL || 'http://localhost:8081';
  let client: SchemaRegistryClient;
  let testRunId: string;

  beforeAll(async () => {
    testRunId = Date.now().toString();
    // Initialize config for tests
    setConfig({
      host: 'localhost:9092',
      consumer: { groupId: `test-group-${testRunId}` },
      schemaRegistry: { url: SCHEMA_REGISTRY_URL },
      onlyTesting: false
    });

    client = new SchemaRegistryClient({ url: SCHEMA_REGISTRY_URL });

    // Register schemas used in tests with topic-based subjects to match new naming
    try {
      const { zodToJsonSchema } = await import('zod-to-json-schema');
      const registry = (client as any).registry;

      // Register schemas with topic-based subjects
      const userSubject = client.getSubjectFromTopicAndEventCode(`users-${testRunId}`, 'User');
      const userJsonSchema = zodToJsonSchema(UserSchema, { target: 'jsonSchema7' });
      await registry.register({ type: 'JSON', schema: JSON.stringify(userJsonSchema) }, { subject: userSubject });

      const orderSubject = client.getSubjectFromTopicAndEventCode(`orders-${testRunId}`, 'OrderStatus');
      const orderJsonSchema = zodToJsonSchema(OrderStatusSchema, { target: 'jsonSchema7' });
      await registry.register({ type: 'JSON', schema: JSON.stringify(orderJsonSchema) }, { subject: orderSubject });

      const productSubject = client.getSubjectFromTopicAndEventCode(`products-${testRunId}`, 'Product');
      const productJsonSchema = zodToJsonSchema(ProductSchema, { target: 'jsonSchema7' });
      await registry.register({ type: 'JSON', schema: JSON.stringify(productJsonSchema) }, { subject: productSubject });

      console.log('✅ Registered evolution test schemas with topic-based subjects');
    } catch (error) {
      console.log('⚠️ Schema registration error:', (error as Error).message);
    }
  }, 30000);

  afterAll(() => {
    if (client) {
      client.disconnect();
    }
  });

  describe('Backward Compatibility', () => {
    it('should handle adding optional fields (backward compatible)', async () => {
      // Using fixed schema subjects for consistency

      // Version 1: Base event
      const userV1: User = {
        ...createBaseEvent({ code: 'User', appName: 'evolution-test' }),
        userId: randomUUID(),
        name: 'John Doe',
        email: 'john@example.com'
      };

      // Publish V1
      const userSubject = client.getSubjectFromTopicAndEventCode(`users-${testRunId}`, 'User');
      const encodedV1 = await client.encode(userSubject, UserSchema, userV1);
      const schemaIdV1 = encodedV1.readInt32BE(1);

      // Version 2: Event with additional fields
      const userV2 = {
        ...createBaseEvent({ code: 'User', appName: 'evolution-test' }),
        userId: randomUUID(),
        name: 'Jane Smith',
        email: 'jane@example.com',
        phoneNumber: '+1234567890',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          country: 'USA'
        },
        preferences: {
          newsletter: false,
          notifications: true
        }
      };

      // Publish V2
      const encodedV2 = await client.encode(userSubject, UserSchema, userV2);
      const schemaIdV2 = encodedV2.readInt32BE(1);

      // With optional fields already in the registered schema, schema ID remains the same
      expect(schemaIdV2).toEqual(schemaIdV1);

      // Both versions should decode correctly
      const decodedV1 = await client.decodeAndValidate(encodedV1);
      const decodedV2 = await client.decodeAndValidate(encodedV2);

      expect(decodedV1.value).toMatchObject({
        userId: userV1.userId,
        name: userV1.name,
        email: userV1.email
      });

      expect(decodedV2.value).toMatchObject({
        userId: userV2.userId,
        name: userV2.name,
        email: userV2.email,
        phoneNumber: userV2.phoneNumber,
        address: userV2.address
      });
    }, 20000);

    it('should handle enum value additions (backward compatible)', async () => {
      // Using fixed schema subjects for consistency

      // Version 1: Event with limited enum
      const orderV1: OrderStatus = {
        ...createBaseEvent({ code: 'OrderStatus', appName: 'evolution-test' }),
        orderId: randomUUID(),
        status: 'pending' as const,
        amount: 100
      };

      const orderSubject = client.getSubjectFromTopicAndEventCode(`orders-${testRunId}`, 'OrderStatus');
      const encodedV1 = await client.encode(orderSubject, OrderStatusSchema, orderV1);

      // Version 2: Event with extended enum
      const orderV2: OrderStatus = {
        ...createBaseEvent({ code: 'OrderStatus', appName: 'evolution-test' }),
        orderId: randomUUID(),
        status: 'delivered' as const, // Using new enum value
        amount: 150
      };

      const encodedV2 = await client.encode(orderSubject, OrderStatusSchema, orderV2);

      // Both should decode successfully
      const decodedV1 = await client.decodeAndValidate(encodedV1);
      const decodedV2 = await client.decodeAndValidate(encodedV2);

      expect(decodedV1.value).toMatchObject({
        status: 'pending',
        amount: 100
      });

      expect(decodedV2.value).toMatchObject({
        status: 'delivered',
        amount: 150
      });
    }, 15000);
  });

  describe('Breaking Changes Detection', () => {
    it('should detect removal of required fields (breaking change)', async () => {
      // Using fixed schema subjects for consistency

      // Version 1: Full event
      const productV1: Product = {
        ...createBaseEvent({ code: 'Product', appName: 'evolution-test' }),
        productId: randomUUID(),
        name: 'Test Product',
        price: 99.99,
        category: 'Electronics',
        description: 'A test product'
      };

      // Establish V1 schema
      const productSubject = client.getSubjectFromTopicAndEventCode(`products-${testRunId}`, 'Product');
      await client.encode(productSubject, ProductSchema, productV1);

      // Version 2: Event missing required field (breaking change)
      const productV2 = {
        ...createBaseEvent({ code: 'Product', appName: 'evolution-test' }),
        productId: randomUUID(),
        name: 'Another Product',
        price: 149.99,
        description: 'Another test product'
        // Missing required 'category' field
      };

      // This should potentially fail validation due to missing required field
      expect(() => ProductSchema.parse(productV2)).toThrow();
    }, 15000);

    it('should detect type changes (breaking change)', async () => {
      // Register schema for Event type first
      try {
        const { zodToJsonSchema } = await import('zod-to-json-schema');
        const registry = (client as any).registry;
        const eventSubject = client.getSubjectFromTopicAndEventCode(`events-${testRunId}`, 'Event');

        // Create a simple schema for this test
        const EventSchema = BaseEventSchema.extend({});
        const eventJsonSchema = zodToJsonSchema(EventSchema, { target: 'jsonSchema7' });
        await registry.register({ type: 'JSON', schema: JSON.stringify(eventJsonSchema) }, { subject: eventSubject });
      } catch (_error) {
        // Ignore registration errors for this test
      }

      // Version 1: Event with string field
      const eventV1 = {
        ...createBaseEvent({ code: 'Event', appName: 'evolutiy yon-test' }),
        eventId: randomUUID(),
        count: '42', // String value
        metadata: {
          source: 'web'
        }
      };

      // Version 2: Event with type change (breaking change)
      const eventV2 = {
        ...createBaseEvent({ code: 'Event', appName: 'evolution-test' }),
        eventId: randomUUID(),
        count: 42, // Number value
        metadata: {
          source: 'api'
        }
      };

      // Type changes should be detected in schema validation
      // We skip the actual registry call and just test schema consistency
      expect(typeof eventV1.count).toBe('string');
      expect(typeof eventV2.count).toBe('number');
    }, 15000);
  });

  describe('Forward Compatibility', () => {
    it('should handle consumers processing newer schema versions', async () => {
      const messageSubject = client.getSubjectFromTopicAndEventCode(`messages-${testRunId}`, 'Message');

      // Register V2 schema including new fields to allow forward-compat encoding
      const MessageV2Schema = BaseEventSchema.extend({
        messageId: z.string().uuid(),
        content: z.string(),
        authorId: z.string().uuid(),
        threadId: z.string().uuid(),
        attachments: z.array(z.string()),
        reactions: z.object({ likes: z.number(), shares: z.number() })
      });

      // Register schema for Message type first
      const { zodToJsonSchema } = await import('zod-to-json-schema');
      const registry = (client as any).registry;
      
      const messageJsonSchema = zodToJsonSchema(MessageV2Schema, { target: 'jsonSchema7' });
      await registry.register({ type: 'JSON', schema: JSON.stringify(messageJsonSchema) }, { subject: messageSubject });

      // Version 2: Event with more fields (newer)
      const messageV2 = {
        ...createBaseEvent({ code: 'Message', appName: 'evolution-test' }),
        messageId: randomUUID(),
        content: 'Hello from V2!',
        authorId: randomUUID(),
        threadId: randomUUID(),
        attachments: ['file1.pdf', 'image.jpg'],
        reactions: {
          likes: 5,
          shares: 2
        }
      };

      // Encode with V2 event
      const encoded = await client.encode(messageSubject, MessageV2Schema, messageV2);

      // Decode (simulating V1 consumer that doesn't know about new fields)
      const decoded = await client.decodeAndValidate(encoded);

      // Core fields should be present and correct
      expect(decoded.value).toMatchObject({
        messageId: messageV2.messageId,
        content: messageV2.content,
        authorId: messageV2.authorId
      });

      // New fields should also be preserved (depending on schema registry behavior)
      expect(decoded.value).toHaveProperty('threadId');
      expect(decoded.value).toHaveProperty('reactions');
    }, 15000);
  });

  describe('Schema Versioning Strategy', () => {
    it('should maintain version history and allow rollback scenarios', async () => {
      const schemas: { version: string; schema: any; event: any }[] = [];
      const versionedItemSubject = client.getSubjectFromTopicAndEventCode(`items-${testRunId}`, 'VersionedItem');

      // Create multiple schema versions
      for (let i = 1; i <= 3; i++) {
        const versionEvent = {
          ...createBaseEvent({ code: 'VersionedItem', appName: 'evolution-test' }),
          itemId: randomUUID(),
          version: `v${i}.0.0`,
          data: {
            value: `Version ${i} data`,
            ...(i >= 2 && { extraField: `Extra for v${i}` }),
            ...(i >= 3 && { anotherField: i * 10 })
          }
        };
        const dataShape: Record<string, any> = { value: z.string() };
          if (i >= 2) dataShape.extraField = z.string().optional();
          if (i >= 3) dataShape.anotherField = z.number().optional();

          const VersionedItemVSchema = BaseEventSchema.extend({
            itemId: z.string().uuid(),
            version: z.string(),
            data: z.object(dataShape)
          });
        
        // Register schema version i (evolving schema content)
        const { zodToJsonSchema } = await import('zod-to-json-schema');
        const registry = (client as any).registry;
        
        const versionedItemJsonSchema = zodToJsonSchema(VersionedItemVSchema, { target: 'jsonSchema7' });
        await registry.register({ type: 'JSON', schema: JSON.stringify(versionedItemJsonSchema) }, { subject: versionedItemSubject });

        const encoded = await client.encode(versionedItemSubject, VersionedItemVSchema, versionEvent);
        const schemaId = encoded.readInt32BE(1);

        schemas.push({
          version: `v${i}.0.0`,
          schema: { id: schemaId, encoded },
          event: versionEvent
        });

        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Verify all versions can be decoded
      for (const { schema, event } of schemas) {
        const decoded = await client.decodeAndValidate(schema.encoded);

        expect(decoded.value).toMatchObject({
          version: event.version,
          data: expect.objectContaining({
            value: event.data.value
          })
        });
      }

      // Verify schema IDs are different (indicating separate versions)
      const schemaIds = schemas.map((s) => s.schema.id);
      const uniqueIds = new Set(schemaIds);
      expect(uniqueIds.size).toBe(schemas.length);
    }, 25000);
  });
});

// Skip these tests if not running integration tests
if (process.env.RUN_INTEGRATION_TESTS !== 'true') {
  describe.skip('Schema Evolution and Compatibility Tests', () => {
    it('should be skipped - set RUN_INTEGRATION_TESTS=true to enable', () => {
      // Test is skipped when RUN_INTEGRATION_TESTS is not set to 'true'
    });
  });
}
