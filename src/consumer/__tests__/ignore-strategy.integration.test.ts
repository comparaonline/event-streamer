import { Kafka } from 'kafkajs';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { setConfig } from '../../config';
import { SchemaRegistryConsumerRouter } from '../schema-registry-consumer';
import { SchemaRegistryProducer } from '../../producer/schema-registry-producer';
import { SchemaRegistryClient } from '../../schema-registry/client';
import { SchemaRegistryEventSchema } from '../../schemas';
import { zodToJsonSchema } from 'zod-to-json-schema';

const TEST_TIMEOUT = 90000000; // 30s

// Useful helpers
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Error Handling: IGNORE Strategy', () => {
  const SCHEMA_REGISTRY_URL = process.env.SCHEMA_REGISTRY_URL || 'http://localhost:8081';
  const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:9092';

  const mainTopic = `ignore-main-${Date.now()}`;
  const dlqTopic = `ignore-dlq-${Date.now()}`;
  const groupId = `ignore-it-${Date.now()}`;
  const eventCode = 'FailingEvent';

  const failingSchema = z.object({ id: z.string(), data: z.string() });
  let mergedSchema: z.ZodSchema<any>;
  let producer: SchemaRegistryProducer;

  beforeAll(async () => {
    setConfig({
      host: KAFKA_BROKERS,
      consumer: { groupId },
      schemaRegistry: { url: SCHEMA_REGISTRY_URL },
      producer: { useSchemaRegistry: true },
      onlyTesting: false,
    });

    mergedSchema = SchemaRegistryEventSchema.merge(failingSchema);
    producer = new SchemaRegistryProducer();

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

    const srClient = new SchemaRegistryClient({ url: SCHEMA_REGISTRY_URL });
    const registry = srClient.registry;
    
    const subject = srClient.getSubjectFromTopicAndEventCode(mainTopic, eventCode);
    const jsonSchema = zodToJsonSchema(mergedSchema as any, { target: 'jsonSchema7' });
    await registry.register({ type: 'JSON', schema: JSON.stringify(jsonSchema) }, { subject });
  }, TEST_TIMEOUT);

  let consumerRouter: SchemaRegistryConsumerRouter;
  const receivedDlq: any[] = [];

  beforeEach(async () => {
    receivedDlq.length = 0;
    consumerRouter = new SchemaRegistryConsumerRouter({
      errorStrategy: 'IGNORE',
      deadLetterTopic: dlqTopic, // Still provide DLQ topic to ensure it's NOT used
      fromBeginning: true,
    });

    consumerRouter.add({
      topic: mainTopic,
      eventCode,
      schema: mergedSchema,
      handler: () => {
        throw new Error('Processing failed!');
      },
    });
    // Also listen on the DLQ topic to ensure nothing arrives
    consumerRouter.add({
      topic: dlqTopic,
      handler: async (message) => {
        receivedDlq.push(message);
      },
    });

    await consumerRouter.start();
  });

  afterEach(async () => {
    await consumerRouter.stop();
  });

  it('should log the error and not send to DLQ', async () => {
    const eventPayload = { id: randomUUID(), data: 'boom' };
    await producer.emitWithSchema({
      topic: mainTopic,
      eventCode,
      data: eventPayload,
      schema: mergedSchema,
    });

    await sleep(5000);

    expect(receivedDlq.length).toBe(0); // DLQ should be empty
  }, TEST_TIMEOUT);
});
