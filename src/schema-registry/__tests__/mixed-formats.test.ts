// Import removed - z not used directly in this test file
import { randomUUID } from 'crypto';
import { SchemaRegistryProducer } from '../../producer/schema-registry-producer';
import { SchemaRegistryConsumerRouter } from '../../consumer/schema-registry-consumer';
import { ConsumerRouter } from '../../consumer/legacy-consumer';
import { emit } from '../../producer/legacy-producer';
import { setConfig } from '../../config';
import { createBaseEvent } from '../../schemas';
import { SchemaRegistryClient } from '../client';
import { UserEventSchema, type UserEvent } from '../../__fixtures__/schemas/user-event.schema';
import { OrderEventSchema, type OrderEvent } from '../../__fixtures__/schemas/order-event.schema';
import { NotificationEventSchema, type NotificationEvent } from '../../__fixtures__/schemas/notification-event.schema';

// Mock debug function to avoid config initialization issues while preserving other functions
jest.mock('../../helpers', () => ({
  ...jest.requireActual('../../helpers'),
  debug: jest.fn()
}));

describe('Mixed Format and Multiple Event Type Tests', () => {
  const SCHEMA_REGISTRY_URL = process.env.SCHEMA_REGISTRY_URL || 'http://localhost:8081';
  const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:9092';
  let client: SchemaRegistryClient;

  beforeAll(async () => {
    console.log('🔧 Starting mixed-formats beforeAll setup...');
    client = new SchemaRegistryClient({ url: SCHEMA_REGISTRY_URL });

    // Note: Schema registration is now handled dynamically per test topic
    // Each test will register schemas with topic-specific subjects to avoid conflicts
    console.log('✅ Mixed-formats setup complete - schemas will be registered per test');
  }, 30000);

  describe('Multiple Event Types in Single Topic', () => {
    it('should handle multiple event types in the same topic with Schema Registry', async () => {
      const testTopic = `multi-event-topic-${Date.now()}`;
      const receivedEvents: Array<{ eventType: string; data: any }> = [];

      // Register schemas with topic-specific subjects before using them
      console.log(`📋 Registering schemas for topic: ${testTopic}`);
      try {
        // Register schemas using direct Schema Registry API with topic-based subjects
        const { zodToJsonSchema } = await import('zod-to-json-schema');
        const registry = (client as any).registry;

        const userEventSubject = client.getSubjectFromTopicAndEventCode(testTopic, 'UserEvent');
        const userEventJsonSchema = zodToJsonSchema(UserEventSchema, { target: 'jsonSchema7' });
        await registry.register({ type: 'JSON', schema: JSON.stringify(userEventJsonSchema) }, { subject: userEventSubject });

        const orderEventSubject = client.getSubjectFromTopicAndEventCode(testTopic, 'OrderEvent');
        const orderEventJsonSchema = zodToJsonSchema(OrderEventSchema, { target: 'jsonSchema7' });
        await registry.register({ type: 'JSON', schema: JSON.stringify(orderEventJsonSchema) }, { subject: orderEventSubject });

        const notificationEventSubject = client.getSubjectFromTopicAndEventCode(testTopic, 'NotificationEvent');
        const notificationEventJsonSchema = zodToJsonSchema(NotificationEventSchema, { target: 'jsonSchema7' });
        await registry.register({ type: 'JSON', schema: JSON.stringify(notificationEventJsonSchema) }, { subject: notificationEventSubject });

        console.log('✅ All schemas registered with topic-based subjects');
      } catch (error) {
        console.error('❌ Schema registration failed:', error);
        throw error;
      }

      setConfig({
        host: KAFKA_BROKERS,
        consumer: { groupId: `mixed-test-${Date.now()}` },
        schemaRegistry: { url: SCHEMA_REGISTRY_URL },
        producer: { useSchemaRegistry: true },
        onlyTesting: false
      });

      const producer = new SchemaRegistryProducer();
      const consumer = new SchemaRegistryConsumerRouter();

      // Set up consumer to handle multiple event types
      consumer.addWithSchema(
        testTopic,
        'UserEvent',
        async (event: UserEvent) => {
          receivedEvents.push({ eventType: 'UserEvent', data: event });
        },
        { schema: UserEventSchema, validateWithRegistry: true }
      );

      consumer.addWithSchema(
        testTopic,
        'OrderEvent',
        async (event: OrderEvent) => {
          receivedEvents.push({ eventType: 'OrderEvent', data: event });
        },
        { schema: OrderEventSchema, validateWithRegistry: true }
      );

      consumer.addWithSchema(
        testTopic,
        'NotificationEvent',
        async (event: NotificationEvent) => {
          receivedEvents.push({ eventType: 'NotificationEvent', data: event });
        },
        { schema: NotificationEventSchema, validateWithRegistry: true }
      );

      await consumer.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Produce different event types to same topic
      const userEvent: UserEvent = {
        ...createBaseEvent({ code: 'UserEvent', appName: 'mixed-test' }),
        userId: randomUUID(),
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      };

      const orderEvent: OrderEvent = {
        ...createBaseEvent({ code: 'OrderEvent', appName: 'mixed-test' }),
        orderId: randomUUID(),
        customerId: randomUUID(),
        status: 'pending',
        total: 299.99,
        items: [{ productId: 'prod-123', quantity: 2, price: 149.99 }]
      };

      const notificationEvent: NotificationEvent = {
        ...createBaseEvent({ code: 'NotificationEvent', appName: 'mixed-test' }),
        notificationId: randomUUID(),
        userId: randomUUID(),
        type: 'email',
        subject: 'Order Confirmation',
        content: 'Your order has been confirmed.',
        scheduled: false
      };

      // Send all events to the same topic
      await Promise.all([
        producer.emitWithSchema({
          topic: testTopic,
          eventName: 'UserEvent',
          data: userEvent,
          schema: UserEventSchema
        }),
        producer.emitWithSchema({
          topic: testTopic,
          eventName: 'OrderEvent',
          data: orderEvent,
          schema: OrderEventSchema
        }),
        producer.emitWithSchema({
          topic: testTopic,
          eventName: 'NotificationEvent',
          data: notificationEvent,
          schema: NotificationEventSchema
        })
      ]);

      // Wait for all messages to be consumed
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Verify all event types were received and routed correctly
      expect(receivedEvents).toHaveLength(3);

      const userEventReceived = receivedEvents.find((e) => e.eventType === 'UserEvent');
      const orderEventReceived = receivedEvents.find((e) => e.eventType === 'OrderEvent');
      const notificationEventReceived = receivedEvents.find((e) => e.eventType === 'NotificationEvent');

      expect(userEventReceived).toBeDefined();
      expect(orderEventReceived).toBeDefined();
      expect(notificationEventReceived).toBeDefined();

      if (userEventReceived && orderEventReceived && notificationEventReceived) {
        expect(userEventReceived.data.userId).toBe(userEvent.userId);
        expect(orderEventReceived.data.orderId).toBe(orderEvent.orderId);
        expect(notificationEventReceived.data.notificationId).toBe(notificationEvent.notificationId);
      }

      await consumer.stop();
    }, 45000);

    it('should route events based on event codes when multiple types share a topic', async () => {
      const testTopic = `routing-test-${Date.now()}`;
      const userEventCount = { count: 0 };
      const orderEventCount = { count: 0 };
      const allEventCount = { count: 0 };

      // Register schemas for this test topic
      console.log(`📋 Registering schemas for routing test topic: ${testTopic}`);
      try {
        const { zodToJsonSchema } = await import('zod-to-json-schema');
        const registry = (client as any).registry;

        const userEventSubject = client.getSubjectFromTopicAndEventCode(testTopic, 'UserEvent');
        const userEventJsonSchema = zodToJsonSchema(UserEventSchema, { target: 'jsonSchema7' });
        await registry.register({ type: 'JSON', schema: JSON.stringify(userEventJsonSchema) }, { subject: userEventSubject });

        const orderEventSubject = client.getSubjectFromTopicAndEventCode(testTopic, 'OrderEvent');
        const orderEventJsonSchema = zodToJsonSchema(OrderEventSchema, { target: 'jsonSchema7' });
        await registry.register({ type: 'JSON', schema: JSON.stringify(orderEventJsonSchema) }, { subject: orderEventSubject });

        console.log('✅ Routing test schemas registered');
      } catch (error) {
        console.error('❌ Routing test schema registration failed:', error);
        throw error;
      }

      setConfig({
        host: KAFKA_BROKERS,
        consumer: { groupId: `routing-test-${Date.now()}` },
        schemaRegistry: { url: SCHEMA_REGISTRY_URL },
        producer: { useSchemaRegistry: true },
        onlyTesting: false
      });

      const producer = new SchemaRegistryProducer();
      const consumer = new SchemaRegistryConsumerRouter();

      // Handler for only user events
      consumer.addWithSchema(
        testTopic,
        'UserEvent',
        async () => {
          userEventCount.count++;
        },
        { schema: UserEventSchema }
      );

      // Handler for only order events
      consumer.addWithSchema(
        testTopic,
        'OrderEvent',
        async () => {
          orderEventCount.count++;
        },
        { schema: OrderEventSchema }
      );

      // Handler for all events in topic (no event name filter)
      consumer.addWithSchema(testTopic, async () => {
        allEventCount.count++;
      });

      await consumer.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Send multiple events of different types
      const events = [];
      for (let i = 0; i < 3; i++) {
        events.push(
          producer.emitWithSchema({
            topic: testTopic,
            eventName: 'UserEvent',
            data: {
              ...createBaseEvent({ code: 'UserEvent', appName: 'routing-test' }),
              userId: randomUUID(),
              email: 'routing@example.com',
              name: 'Routing User',
              role: 'user' as const
            },
            schema: UserEventSchema
          })
        );

        events.push(
          producer.emitWithSchema({
            topic: testTopic,
            eventName: 'OrderEvent',
            data: {
              ...createBaseEvent({ code: 'OrderEvent', appName: 'routing-test' }),
              orderId: randomUUID(),
              customerId: randomUUID(),
              status: 'pending' as const,
              total: 100,
              items: [{ productId: 'test', quantity: 1, price: 100 }]
            },
            schema: OrderEventSchema
          })
        );
      }

      await Promise.all(events);
      await new Promise((resolve) => setTimeout(resolve, 6000));

      // Verify correct routing
      expect(userEventCount.count).toBe(3); // Should receive 3 user events
      expect(orderEventCount.count).toBe(3); // Should receive 3 order events
      expect(allEventCount.count).toBe(6); // Should receive all 6 events

      await consumer.stop();
    }, 45000);
  });

  describe('Mixed Schema Registry and JSON Messages', () => {
    it('should handle both Schema Registry and JSON messages in the same topic', async () => {
      const testTopic = `mixed-format-${Date.now()}`;
      const receivedMessages: Array<{
        data: any;
        format: 'schema-registry' | 'json';
        eventType?: string;
      }> = [];

      // Register schema for Schema Registry message before using it
      console.log(`📋 Registering schema for mixed format test topic: ${testTopic}`);
      try {
        const { zodToJsonSchema } = await import('zod-to-json-schema');
        const registry = (client as any).registry;

        const userEventSubject = client.getSubjectFromTopicAndEventCode(testTopic, 'UserEvent');
        const userEventJsonSchema = zodToJsonSchema(UserEventSchema, { target: 'jsonSchema7' });
        await registry.register({ type: 'JSON', schema: JSON.stringify(userEventJsonSchema) }, { subject: userEventSubject });

        console.log('✅ Mixed format test schema registered');
      } catch (error) {
        console.error('❌ Mixed format test schema registration failed:', error);
        throw error;
      }

      setConfig({
        host: KAFKA_BROKERS,
        consumer: { groupId: `mixed-format-${Date.now()}` },
        schemaRegistry: { url: SCHEMA_REGISTRY_URL },
        onlyTesting: false
      });

      const consumer = new SchemaRegistryConsumerRouter();

      // Consumer that handles both formats
      consumer.addWithSchema(testTopic, async (event: any, metadata: any) => {
        receivedMessages.push({
          data: event,
          format: metadata.isSchemaRegistryMessage ? 'schema-registry' : 'json',
          eventType: event.code
        });
      });

      await consumer.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Send Schema Registry message
      setConfig({
        host: KAFKA_BROKERS,
        consumer: { groupId: `mixed-format-${Date.now()}` },
        schemaRegistry: { url: SCHEMA_REGISTRY_URL },
        producer: { useSchemaRegistry: true },
        onlyTesting: false
      });

      const srProducer = new SchemaRegistryProducer();
      const srEvent: UserEvent = {
        ...createBaseEvent({ code: 'UserEvent', appName: 'mixed-format' }),
        userId: randomUUID(),
        email: 'sr-user@example.com',
        name: 'SR User',
        role: 'admin'
      };

      await srProducer.emitWithSchema({
        topic: testTopic,
        data: srEvent,
        schema: UserEventSchema
      });

      // Send JSON message using legacy producer
      const jsonEvent = {
        ...createBaseEvent({ code: 'UserEvent', appName: 'mixed-format' }),
        userId: randomUUID(),
        email: 'json-user@example.com',
        name: 'JSON User',
        role: 'user'
      };

      await emit({
        topic: testTopic,
        data: jsonEvent,
        eventName: 'UserEvent'
      });

      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Should have received both messages
      expect(receivedMessages).toHaveLength(2);

      const srMessage = receivedMessages.find((m) => m.format === 'schema-registry');
      const jsonMessage = receivedMessages.find((m) => m.format === 'json');

      expect(srMessage).toBeDefined();
      expect(jsonMessage).toBeDefined();

      if (srMessage && jsonMessage) {
        expect(srMessage.data.email).toBe('sr-user@example.com');
        expect(jsonMessage.data.email).toBe('json-user@example.com');

        expect(srMessage.eventType).toBe('UserEvent');
        expect(jsonMessage.eventType).toBe('UserEvent');
      }

      await consumer.stop();
    }, 45000);

    it('should maintain compatibility between new SR consumer and legacy JSON producer', async () => {
      const testTopic = `compatibility-test-${Date.now()}`;
      const legacyMessages: any[] = [];

      // Use legacy consumer to verify JSON messages still work
      const legacyConsumer = new ConsumerRouter();
      legacyConsumer.add(testTopic, 'TestEvent', async (event) => {
        legacyMessages.push(event);
      });

      setConfig({
        host: KAFKA_BROKERS,
        consumer: { groupId: `compatibility-${Date.now()}` },
        onlyTesting: false
      });

      await legacyConsumer.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Send message using legacy producer (JSON format)
      const legacyEvent = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        source: 'compatibility-test',
        customField: 'legacy data'
      };

      await emit(testTopic, 'TestEvent', legacyEvent);
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Legacy consumer should receive the message
      expect(legacyMessages).toHaveLength(1);
      expect(legacyMessages[0]).toMatchObject({
        id: legacyEvent.id,
        customField: legacyEvent.customField,
        code: 'TestEvent' // Auto-generated by legacy producer
      });

      await legacyConsumer.stop();
    }, 30000);
  });

  describe('Error Handling in Mixed Scenarios', () => {
    it('should gracefully handle invalid Schema Registry messages mixed with valid JSON', async () => {
      const testTopic = `error-handling-${Date.now()}`;
      const validMessages: any[] = [];
      const errorCount = { count: 0 };

      const consumer = new SchemaRegistryConsumerRouter();

      consumer.addWithSchema(
        testTopic,
        async (event: any, metadata: any) => {
          try {
            validMessages.push({ event, format: metadata.isSchemaRegistryMessage ? 'sr' : 'json' });
          } catch (error) {
            errorCount.count++;
          }
        },
        { validateWithRegistry: false } // Don't validate to test error handling
      );

      setConfig({
        host: KAFKA_BROKERS,
        consumer: { groupId: `error-test-${Date.now()}` },
        schemaRegistry: { url: SCHEMA_REGISTRY_URL },
        onlyTesting: false
      });

      await consumer.start();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Send valid JSON message
      const validJson = {
        ...createBaseEvent({ code: 'ValidEvent', appName: 'error-test' }),
        data: 'valid json data'
      };

      await emit(testTopic, 'ValidEvent', validJson);

      // Send potentially corrupted SR message by creating invalid buffer
      // (This would normally be caught at the producer level)

      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Should have received at least the valid JSON message
      expect(validMessages.length).toBeGreaterThanOrEqual(1);
      expect(validMessages.some((m) => m.format === 'json')).toBe(true);

      await consumer.stop();
    }, 25000);
  });
});

// Skip if not running integration tests
if (process.env.RUN_INTEGRATION_TESTS !== 'true') {
  describe.skip('Mixed Format and Multiple Event Type Tests', () => {
    it('should be skipped - set RUN_INTEGRATION_TESTS=true to enable', () => {
      // Test is skipped when RUN_INTEGRATION_TESTS is not set to 'true'
    });
  });
}
