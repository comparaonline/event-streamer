import { Kafka } from 'kafkajs';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { setConfig } from '../../config';
import { SchemaRegistryConsumerRouter } from '../schema-registry-consumer';
import { SchemaRegistryProducer } from '../../producer/schema-registry-producer';
import { DeadLetterQueueSchema } from '../../schemas/dead-letter-queue';
import { SchemaRegistryClient } from '../../schema-registry/client';
import { SchemaRegistryEventSchema } from '../../schemas';

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
  // Merged SR schema (business + envelope)
  let mergedSchema: z.ZodSchema<any>;

  let consumerRouter: SchemaRegistryConsumerRouter;
  let producer: SchemaRegistryProducer;
  let srClient: SchemaRegistryClient;
  let dlqReader: ReturnType<Kafka['consumer']>;
  const receivedDlq: any[] = [];

  beforeAll(async () => {
    // Configure runtime
    setConfig({
      host: KAFKA_BROKERS,
      consumer: { groupId },
      schemaRegistry: { url: SCHEMA_REGISTRY_URL },
      producer: { useSchemaRegistry: true },
      onlyTesting: false
    });

    // Ensure topics exist
    const kafka = new Kafka({ brokers: KAFKA_BROKERS.split(',') });
    const admin = kafka.admin();
    await admin.connect();
    await admin.createTopics({
      topics: [
        { topic: mainTopic, numPartitions: 1, replicationFactor: 1 },
        { topic: dlqTopic, numPartitions: 1, replicationFactor: 1 }
      ],
      waitForLeaders: true
    });
    await admin.disconnect();

    // DLQ reader
    dlqReader = kafka.consumer({ groupId: `dlq-reader-${Date.now()}` });
    await dlqReader.connect();
    await dlqReader.subscribe({ topic: dlqTopic, fromBeginning: true });
    await dlqReader.run({
      eachMessage: async ({ message }) => {
        try {
          const obj = JSON.parse((message.value || Buffer.from('{}')).toString('utf8'));
          receivedDlq.push(obj);
        } catch {
          // ignore
        }
      }
    });

    // Pre-register subject for SR producer
    srClient = new SchemaRegistryClient({ url: SCHEMA_REGISTRY_URL });
    const subject = srClient.getSubjectFromTopicAndEventCode(mainTopic, eventCode);
    const { zodToJsonSchema } = await import('zod-to-json-schema');
    mergedSchema = SchemaRegistryEventSchema.merge(failingSchema);
    const jsonSchema = zodToJsonSchema(mergedSchema as any, { target: 'jsonSchema7' });
    const registry = (srClient as any).registry;
    await registry.register({ type: 'JSON', schema: JSON.stringify(jsonSchema) }, { subject });

    // Consumer
    consumerRouter = new SchemaRegistryConsumerRouter({
      errorStrategy: 'DEAD_LETTER',
      deadLetterTopic: dlqTopic,
      maxRetries: 0
    });

    consumerRouter.add({
      topic: mainTopic,
      eventCode,
      // Always fail,wha to trigger DLQ
      handler: () => {
        throw new Error('Processing failed!');
      }
    });

    await consumerRouter.start();
    await sleep(2000); // give time to join group and subscribe
    producer = new SchemaRegistryProducer();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    try {
      await consumerRouter.stop();
    } catch {
      void 0; // ignore cleanup errors
    }
    try {
      await dlqReader.disconnect();
    } catch {
      void 0; // ignore cleanup errors
    }
  }, TEST_TIMEOUT);

  it(
    'sends failed messages to DLQ topic',
    async () => {
      // Produce a failing event (SR-encoded)
      const eventPayload = {
        id: randomUUID(),
        data: 'boom'
      } as any;
      await producer.emitWithSchema({
        topic: mainTopic,
        eventCode,
        data: eventPayload,
        schema: mergedSchema as any
      });

      // Wait for DLQ
      const started = Date.now();
      while (receivedDlq.length === 0 && Date.now() - started < TEST_TIMEOUT - 1000) {
        await sleep(500);
      }

      expect(receivedDlq.length).toBeGreaterThan(0);
      const dlq = DeadLetterQueueSchema.parse(receivedDlq[0]);

      expect(dlq.code).toBe('DeadLetterQueueEvent');
      expect(dlq.originalTopic).toBe(mainTopic);
      expect(dlq.errorMessage).toContain('Processing failed');
    },
    TEST_TIMEOUT
  );
});
