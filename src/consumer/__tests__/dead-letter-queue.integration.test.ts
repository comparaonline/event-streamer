import { Kafka } from 'kafkajs';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { setConfig } from '../../config';
import { SchemaRegistryConsumerRouter } from '../schema-registry-consumer';
import { SchemaRegistryProducer } from '../../producer/schema-registry-producer';
import { DeadLetterQueueSchema } from '../../schemas/dead-letter-queue.schema';
import { SchemaRegistryClient } from '../../schema-registry/client';
import { SchemaRegistryEventSchema } from '../../schemas';
import { zodToJsonSchema } from 'zod-to-json-schema';

const TEST_TIMEOUT = 90000000; // 30s

// Useful helpers
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Dead Letter Queue Integration', () => {
  const SCHEMA_REGISTRY_URL = process.env.SCHEMA_REGISTRY_URL || 'http://localhost:8081';
  const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:9092';

  const mainTopic = `dlq-main-${Date.now()}`;
  const dlqTopic = `dlq-topic-${Date.now()}`;
  const groupId = `dlq-it-${Date.now()}`;
  const eventCode = 'FailingEvent';

  const failingSchema = z.object({ id: z.string(), data: z.string() });
  let mergedSchema: z.ZodSchema<any>;
  let producer: SchemaRegistryProducer;

  // This function contains the core test logic and will be reused for both strategies.
  const runDLQTest = async (consumer: SchemaRegistryConsumerRouter, receivedDlq: any[]) => {
    // Produce a failing event
    const eventPayload = { id: randomUUID(), data: 'boom' };
    await producer.emitWithSchema({
      topic: mainTopic,
      eventCode,
      data: eventPayload,
      schema: mergedSchema,
    });

    // Wait for the message to arrive in the DLQ
    const started = Date.now();
    while (receivedDlq.length === 0 && Date.now() - started < 15000) { // 15s timeout
      await sleep(500);
    }

    // Assertions
    expect(receivedDlq.length).toBeGreaterThan(0);
    const dlq = DeadLetterQueueSchema.parse(receivedDlq[0]);
    expect(dlq.code).toBe('DeadLetterQueueEvent');
    expect(dlq.originalTopic).toBe(mainTopic);
    expect(dlq.errorMessage).toContain('Processing failed');
  };

  beforeAll(async () => {
    // --- One-time setup for all tests in this file ---
    
    // Configure runtime first, as constructors depend on it.
    setConfig({
      host: KAFKA_BROKERS,
      consumer: { groupId },
      schemaRegistry: { url: SCHEMA_REGISTRY_URL },
      producer: { useSchemaRegistry: true },
      onlyTesting: false,
    });

    mergedSchema = SchemaRegistryEventSchema.merge(failingSchema);
    producer = new SchemaRegistryProducer();

    // Create topics
    const kafka = new Kafka({ brokers: KAFKA_BROKERS.split(',') });
    const admin = kafka.admin();
    await admin.connect();
    await admin.createTopics({
      topics: [
        { topic: mainTopic, numPartitions: 1, replicationFactor: 1 },
        { topic: dlqTopic, numPartitions: 1, replicationFactor: 1 },
      ],
      waitForLeaders: true,
    });
    await admin.disconnect();

    // Register schemas
    const srClient = new SchemaRegistryClient({ url: SCHEMA_REGISTRY_URL });
    const registry = srClient.registry;
    
    const subject = srClient.getSubjectFromTopicAndEventCode(mainTopic, eventCode);
    const jsonSchema = zodToJsonSchema(mergedSchema as any, { target: 'jsonSchema7' });
    await registry.register({ type: 'JSON', schema: JSON.stringify(jsonSchema) }, { subject });

    const dlqSubject = srClient.getSubjectFromTopicAndEventCode(dlqTopic, 'DeadLetterQueueEvent');
    const dlqJsonSchema = zodToJsonSchema(DeadLetterQueueSchema as any, { target: 'jsonSchema7' });
    await registry.register({ type: 'JSON', schema: JSON.stringify(dlqJsonSchema) }, { subject: dlqSubject });
  }, TEST_TIMEOUT);

  describe('with "one-by-one" strategy', () => {
    let consumerRouter: SchemaRegistryConsumerRouter;
    const receivedDlq: any[] = [];

    beforeEach(async () => {
      receivedDlq.length = 0; // Clear array before each test
      consumerRouter = new SchemaRegistryConsumerRouter({
        errorStrategy: 'DEAD_LETTER',
        deadLetterTopic: dlqTopic,
        fromBeginning: true,
        strategy: 'one-by-one',
      });

      consumerRouter.add({
        topic: mainTopic,
        eventCode,
        schema: mergedSchema,
        handler: () => { throw new Error('Processing failed!'); },
      });
      consumerRouter.add({
        topic: dlqTopic,
        eventCode: 'DeadLetterQueueEvent',
        schema: DeadLetterQueueSchema,
        handler: async (message) => { receivedDlq.push(message); },
      });

      await consumerRouter.start();
    });

    afterEach(async () => {
      await consumerRouter.stop();
    });

    it('sends failed messages to DLQ topic', async () => {
      await runDLQTest(consumerRouter, receivedDlq);
    }, TEST_TIMEOUT);
  });

  describe('with "topic" strategy (QueueManager)', () => {
    let consumerRouter: SchemaRegistryConsumerRouter;
    const receivedDlq: any[] = [];

    beforeEach(async () => {
      receivedDlq.length = 0;
      consumerRouter = new SchemaRegistryConsumerRouter({
        errorStrategy: 'DEAD_LETTER',
        deadLetterTopic: dlqTopic,
        fromBeginning: true,
        strategy: 'topic', // Default strategy, enables QueueManager
      });

      consumerRouter.add({
        topic: mainTopic,
        eventCode,
        schema: mergedSchema,
        handler: () => { throw new Error('Processing failed!'); },
      });
      consumerRouter.add({
        topic: dlqTopic,
        eventCode: 'DeadLetterQueueEvent',
        schema: DeadLetterQueueSchema,
        handler: async (message) => { receivedDlq.push(message); },
      });

      await consumerRouter.start();
    });

    afterEach(async () => {
      await consumerRouter.stop();
    });

    it('sends failed messages to DLQ topic', async () => {
      await runDLQTest(consumerRouter, receivedDlq);
    }, TEST_TIMEOUT);
  });
});