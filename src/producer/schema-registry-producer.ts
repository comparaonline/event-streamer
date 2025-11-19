import { z } from 'zod';
import { RecordMetadata, Message, Kafka, Producer } from 'kafkajs';
import { getConfig } from '../config';
import { SchemaRegistryClient } from '../schema-registry/client';
import { stringToUpperCamelCase, toArray } from '../helpers';
import { BaseEvent, createSchemaRegistryEvent } from '../schemas';
import { Output, Config } from '../interfaces';

type EmitResponse = RecordMetadata[];

interface SchemaRegistryOutput<T extends BaseEvent = BaseEvent> extends Omit<Output, 'data' | 'eventName'> {
  eventCode?: string;
  data: T | T[];
  schema?: z.ZodSchema<T>;
}

interface SchemaRegistryMessage {
  topic: string;
  key?: string;
  value: Buffer;
  partition?: number;
  headers: Record<string, string>;
}

let instance: SchemaRegistryProducer | null = null;

export class SchemaRegistryProducer {
  private schemaRegistryClient?: SchemaRegistryClient;
  private producer!: Producer;
  private isConnected = false;

  constructor() {
    if (instance) {
      return instance;
    }

    const config = getConfig();
    const kafka = new Kafka({
      brokers: config.host.split(','),
      logLevel: config.kafkaJSLogs,
    });

    this.producer = kafka.producer({
      allowAutoTopicCreation: true,
      idempotent: config.producer?.idempotent ?? true,
    });

    if (config.schemaRegistry) {
      this.schemaRegistryClient = new SchemaRegistryClient(config.schemaRegistry);
    }

    instance = this;
  }

  private async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.producer.connect();
      this.isConnected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.producer.disconnect();
      this.isConnected = false;
    }
  }
  

  async emitWithSchema<T extends BaseEvent>(
    output: SchemaRegistryOutput<T> | SchemaRegistryOutput<T>[],
  ): Promise<EmitResponse[]> {
    await this.connect();
    const config = getConfig() as Config;
    const outputs = toArray(output);

    if (!this.schemaRegistryClient || !config.producer?.useSchemaRegistry) {
      throw new Error('Schema Registry is not configured. The SchemaRegistryProducer can only be used when schemaRegistry and producer.useSchemaRegistry are enabled in the config.');
    }

    const appName = config.appName ?? config.consumer?.groupId ?? process.env.HOSTNAME?.split('-')[0] ?? 'unknown';

    const messages = await Promise.all(
      outputs.map(async (singleOutput) => {
        const { topic, data, eventCode, schema } = singleOutput;

        // The Zod schema is now required for encoding.
        if (!schema) {
          throw new Error('A Zod schema must be provided when using Schema Registry producer.');
        }

        return Promise.all(
          toArray(data).map(async (item): Promise<SchemaRegistryMessage> => {
            this.validateEventData(item);

            const itemAny = item as { code?: string; appName?: string };
            const rawEventCode = eventCode ?? itemAny?.code;

            if (!rawEventCode) {
              throw new Error(
                'An eventCode must be provided either in the emitWithSchema options or as a `code` property in the event data.'
              );
            }
            
            const resolvedEventCode = stringToUpperCamelCase(rawEventCode);

            // Create the full event object with all required fields.
            const eventData = createSchemaRegistryEvent({
              ...item,
              code: resolvedEventCode,
              appName: itemAny.appName ?? appName
            });

            // Perform local validation with the provided Zod schema.
            const validation = schema.safeParse(eventData);
            if (!validation.success) {
              const errorDetails = validation.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
              throw new Error(`Local Zod schema validation failed: ${errorDetails}`);
            }

            // Get the subject for the schema registry.
            const subject = this.getSubjectFromTopicAndEventCode(topic, rawEventCode);

            if (!this.schemaRegistryClient) {
              throw new Error('Schema Registry client is not initialized');
            }

            // Encode the event using the new client method, which handles registration and encoding.
            const encodedValue = await this.schemaRegistryClient.encode(subject, schema, eventData);

            return {
              topic,
              key: (eventData as { id?: string }).id || undefined,
              value: encodedValue,
              headers: {}
            };
          })
        );
      })
    );

    return this.sendMessages(messages.flat());
  }

  // Send messages using Kafka producer
  private async sendMessages(messages: SchemaRegistryMessage[]): Promise<EmitResponse[]> {
    await this.connect();
    const config = getConfig();
    const result: RecordMetadata[] = [];

    const messagesByTopic = messages.reduce<Record<string, unknown[]>>((acc, msg) => {
      if (!acc[msg.topic]) {
        acc[msg.topic] = [];
      }
      acc[msg.topic].push({
        key: msg.key,
        value: msg.value,
        headers: msg.headers,
        partition: msg.partition,
      });
      return acc;
    }, {});

    for (const [topic, msgs] of Object.entries(messagesByTopic)) {
      const topicResult = await this.producer.send({
        topic,
        messages: msgs as Message[],
        compression: config.producer?.compressionType,
      });
      result.push(...topicResult);
    }

    return [result];
  }

  // Get subject name from topic and event code to avoid collisions
  private getSubjectFromTopicAndEventCode(topic: string, eventCode: string): string {
    if (this.schemaRegistryClient) {
      return this.schemaRegistryClient.getSubjectFromTopicAndEventCode(topic, eventCode);
    }
    return `${topic}-${eventCode}`;
  }

  // Validate event data
  private validateEventData(data: unknown): void {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Event data must be a non-null object');
    }

    if (Array.isArray(data)) {
      throw new Error('Event data cannot be an array at the top level');
    }
  }

  // Get cache statistics
  getCacheStats(): Record<string, unknown> | undefined {
    return this.schemaRegistryClient?.getCacheStats();
  }

  // Clear caches (for testing/debugging)
  clearCaches(): void {
    this.schemaRegistryClient?.clearCaches();
  }
}
