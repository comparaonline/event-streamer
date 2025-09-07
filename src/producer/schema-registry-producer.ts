import { z } from 'zod';
import { RecordMetadata } from 'kafkajs';
import { getConfig } from '../config';
import { SchemaRegistryClient } from '../schema-registry/client';
import { getProducer } from './legacy-producer';
import { stringToUpperCamelCase, debug, toArray } from '../helpers';
import { Debug } from '../interfaces';
import { BaseEvent, createBaseEvent, createSchemaRegistryEvent } from '../schemas';
import { Output, Config } from '../interfaces';

type EmitResponse = RecordMetadata[];

interface SchemaRegistryOutput<T extends BaseEvent = BaseEvent> extends Omit<Output, 'data'> {
  data: T | T[];
  schema?: z.ZodSchema<T>;
  version?: string;
  source?: string; // For schema registry subject mapping
}

interface SchemaRegistryMessage {
  topic: string;
  key?: string;
  value: Buffer;
  partition?: number;
  headers: Record<string, string>;
}

export class SchemaRegistryProducer {
  private schemaRegistryClient?: SchemaRegistryClient;
  private preloadedSubjects = new Set<string>();

  constructor() {
    const config = getConfig() as Config;

    if (config.schemaRegistry) {
      this.schemaRegistryClient = new SchemaRegistryClient(config.schemaRegistry);
      debug(Debug.INFO, 'Schema Registry producer initialized with startup caching');
    }
  }

  // Pre-load schemas for known event types (startup optimization)
  async preloadSchemas(eventCodes: string[]): Promise<void> {
    if (!this.schemaRegistryClient) {
      debug(Debug.WARN, 'Cannot preload schemas: Schema Registry client not initialized');
      return;
    }

    const subjects = eventCodes.map((code) => `${code}-value`);
    await this.schemaRegistryClient.preloadSchemasForProducer(subjects);

    subjects.forEach((subject) => this.preloadedSubjects.add(subject));

    debug(Debug.INFO, 'Preloaded schemas for event codes', {
      eventCodes,
      subjects,
      cacheStats: this.schemaRegistryClient.getCacheStats()
    });
  }

  async emitWithSchema<T extends BaseEvent>(
    output: SchemaRegistryOutput<T> | SchemaRegistryOutput<T>[],
    overwriteHosts?: string | string[]
  ): Promise<EmitResponse[]> {
    const config = getConfig() as Config;
    const outputs = toArray(output);

    // If Schema Registry is not configured, fall back to legacy emit
    if (!this.schemaRegistryClient || !config.producer?.useSchemaRegistry) {
      debug(Debug.INFO, 'Schema Registry not configured, falling back to JSON');
      return this.emitAsJson(outputs, overwriteHosts);
    }

    const appName = config.appName ?? config.consumer?.groupId ?? process.env.HOSTNAME?.split('-')[0] ?? 'unknown';

    // Process each output
    const messages = await Promise.all(
      outputs.map(async (singleOutput) => {
        const { topic, data, eventName, schema, version, source } = singleOutput;
        const eventCode = stringToUpperCamelCase(eventName ?? topic);

        return Promise.all(
          toArray(data).map(async (item): Promise<SchemaRegistryMessage> => {
            // Validate input data
            this.validateEventData(item);

            // Create Schema Registry event with all required fields
            const itemAny = item as any;
            const schemaRegistryEvent = createSchemaRegistryEvent({
              ...item,
              code: eventCode,
              appName: itemAny.appName ?? appName,
              version: version ?? itemAny.version ?? '1.0.0',
              source: source ?? itemAny.source ?? appName
            });

            // Validate with provided schema if given
            if (schema) {
              const validation = schema.safeParse(schemaRegistryEvent);
              if (!validation.success) {
                const errorDetails = validation.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
                throw new Error(`Schema validation failed: ${errorDetails}`);
              }
            }

            // Validate and encode with Schema Registry (using cached schema)
            const subject = this.getSubjectFromEventCode(eventCode);
            if (!this.schemaRegistryClient) {
              throw new Error('Schema Registry client is not initialized');
            }

            const encodedValue = await this.schemaRegistryClient.validateAndEncode(subject, schemaRegistryEvent);

            return {
              topic,
              key: schemaRegistryEvent.id,
              value: encodedValue,
              headers: {
                'event-type': eventCode,
                'event-version': schemaRegistryEvent.version,
                'event-source': schemaRegistryEvent.source,
                'content-encoding': 'confluent-schema-registry',
                'schema-subject': subject
              }
            };
          })
        );
      })
    );

    return this.sendMessages(messages.flat(), overwriteHosts);
  }

  // Emit with legacy JSON format (backward compatibility)
  async emitAsJson<T extends BaseEvent>(outputs: SchemaRegistryOutput<T>[], overwriteHosts?: string | string[]): Promise<EmitResponse[]> {
    const config = getConfig();
    const appName = config.appName ?? config.consumer?.groupId ?? process.env.HOSTNAME?.split('-')[0] ?? 'unknown';

    const legacyOutputs: Output[] = outputs.map(({ topic, data, eventName }) => ({
      topic,
      eventName,
      data: toArray(data).map((item) => {
        const baseEvent = createBaseEvent({
          ...item,
          code: stringToUpperCamelCase(eventName ?? topic),
          appName: item.appName ?? appName
        });

        return baseEvent;
      })
    }));

    // Use existing legacy producer
    const { emit } = await import('./legacy-producer');
    return emit(legacyOutputs, overwriteHosts);
  }

  // Send messages using Kafka producer
  private async sendMessages(messages: SchemaRegistryMessage[], overwriteHosts?: string | string[]): Promise<EmitResponse[]> {
    const config = getConfig() as Config;
    const hosts = this.getHosts(config.host, config.producer?.additionalHosts, overwriteHosts);

    return Promise.all(
      hosts.map(async (host): Promise<EmitResponse> => {
        const producer = await getProducer(host);
        const result: RecordMetadata[] = [];

        // Group messages by topic for efficient sending
        const messagesByTopic = messages.reduce<Record<string, any[]>>((acc, msg) => {
          if (!acc[msg.topic]) {
            acc[msg.topic] = [];
          }
          acc[msg.topic].push({
            key: msg.key,
            value: msg.value,
            headers: msg.headers,
            partition: msg.partition
          });
          return acc;
        }, {});

        // Send messages by topic
        for (const [topic, msgs] of Object.entries(messagesByTopic)) {
          const topicResult = await producer.send({
            topic,
            messages: msgs,
            compression: config.producer?.compressionType
          });
          result.push(...topicResult);
        }

        debug(Debug.INFO, 'Schema Registry messages sent', {
          host,
          messageCount: messages.length,
          topics: Object.keys(messagesByTopic)
        });

        return result;
      })
    );
  }

  // Get hosts for producer (from legacy producer logic)
  private getHosts(defaultHost: string, secondaries?: string | string[], overwrite?: string | string[]): string[] {
    if (overwrite != null) {
      return Array.isArray(overwrite) ? overwrite : [overwrite];
    }
    const secondaryHosts = secondaries ? (Array.isArray(secondaries) ? secondaries : [secondaries]) : [];
    return [defaultHost, ...secondaryHosts];
  }

  // Get subject name from event code
  private getSubjectFromEventCode(eventCode: string): string {
    if (this.schemaRegistryClient) {
      return this.schemaRegistryClient.getSubjectFromEventCode(eventCode);
    }
    return `${eventCode}-value`;
  }

  // Validate event data
  private validateEventData(data: unknown): void {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Event data must be a non-null object');
    }

    if (Array.isArray(data)) {
      throw new Error('Event data cannot be an array at the top level');
    }

    const dataObj = data as Record<string, unknown>;
    if (dataObj.hasOwnProperty('code')) {
      throw new Error('Reserved field "code" cannot be provided in event data - it will be auto-generated');
    }
  }

  // Get cache statistics
  getCacheStats(): any {
    return this.schemaRegistryClient?.getCacheStats();
  }

  // Clear caches (for testing/debugging)
  clearCaches(): void {
    this.schemaRegistryClient?.clearCaches();
    this.preloadedSubjects.clear();
    debug(Debug.DEBUG, 'Producer caches cleared');
  }

  // Check if subject is preloaded
  isSubjectPreloaded(subject: string): boolean {
    return this.preloadedSubjects.has(subject);
  }
}
