import { getConfig } from '../config';
import { Producer, Kafka, RecordMetadata } from 'kafkajs';
import { Debug, Output } from '../interfaces';
import { debug, stringToUpperCamelCase, toArray, validateTestingConfig } from '../helpers';
import { DEFAULT_CONFIG } from '../constants';

function warnDeprecation(message: string): void {
  const config = getConfig();
  if (config.showDeprecationWarnings) {
    console.warn(`[DEPRECATION WARNING] ${message}`);
  }
}

type EmitResponse = RecordMetadata[];

interface Payload {
  topic: string;
  messages: Array<{
    value: string;
  }>;
}

interface ParsedPayload {
  topic: string;
  eventName: string;
  data: Object;
}

function normalizePayloads(payloads: Output[], appName: string): Payload[] {
  return payloads.map(({ topic, data, eventName }: Output) => ({
    topic,
    messages: toArray(data).map((message) => ({
      value: JSON.stringify({
        ...message,
        createdAt: message.createdAt ?? new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z',
        appName: message.appName ?? appName,
        code: stringToUpperCamelCase(eventName ?? topic)
      })
    }))
  }));
}

function getProcessHostname(): string | void {
  if (process.env.HOSTNAME != null && process.env.HOSTNAME.trim() !== '') {
    const hostname = process.env.HOSTNAME.split('-');
    return hostname.length <= 2 ? hostname.join('-') : hostname.splice(0, hostname.length - 2).join('-');
  }
}

let onlyTestingEmittedEvents: Payload[] = [];

export function getEmittedEvents(): Payload[] {
  validateTestingConfig();
  return onlyTestingEmittedEvents;
}

export function getParsedEmittedEvents(): ParsedPayload[] {
  validateTestingConfig();
  return onlyTestingEmittedEvents
    .map((events) =>
      events.messages
        .map((event) => {
          const data = JSON.parse(event.value);
          return {
            topic: events.topic,
            eventName: data.code,
            data
          };
        })
        .reverse()
    )
    .flat();
}

export function clearEmittedEvents(): void {
  validateTestingConfig();
  onlyTestingEmittedEvents = [];
}

function getHosts(defaultHost: string, secondaries?: string | string[], overwrite?: string | string[]): string[] {
  if (overwrite != null) {
    return toArray(overwrite);
  }
  return [defaultHost, ...toArray(secondaries)];
}

const connections: Record<string, { producer: Producer; timeout?: NodeJS.Timeout }> = {};

export async function createProducer(host: string): Promise<Producer> {
  const config = getConfig();
  const kafka = new Kafka({
    brokers: host.split(','),
    retry: config.producer?.retryOptions,
    logLevel: config.kafkaJSLogs
  });

  const producer = kafka.producer({
    idempotent: config.producer?.idempotent ?? DEFAULT_CONFIG.producerIdempotent,
    createPartitioner: config.producer?.partitioners ?? DEFAULT_CONFIG.partitioners,
    allowAutoTopicCreation: true
  });
  await producer.connect();
  return producer;
}

export async function getProducer(host: string): Promise<Producer> {
  const config = getConfig();
  if (connections[host] == null) {
    const producer = await createProducer(host);
    connections[host] = { producer };
  }

  const connection = connections[host];

  if (connection.timeout != null) {
    clearTimeout(connection.timeout);
  }
  connection.timeout = setTimeout(() => {
    connection.producer.disconnect();
    delete connections[host];
  }, config.producer?.connectionTTL ?? DEFAULT_CONFIG.connectionTTL);
  return connection.producer;
}

export function closeAll(): void {
  for (const host in connections) {
    if (connections[host] != null) {
      clearTimeout(connections[host].timeout);
      connections[host].producer.disconnect();
      delete connections[host];
    }
  }
}

/**
 * @deprecated Use SchemaRegistryProducer.emitWithSchema() instead for type safety and Schema Registry support.
 *
 * Legacy emit function that sends JSON messages without schema validation.
 * This function will be removed in a future major version.
 *
 * Migration guide:
 * ```typescript
 * // Old way
 * import { emit } from '@comparaonline/event-streamer';
 * await emit('my-topic', 'MyEvent', data);
 *
 * // New way
 * import { SchemaRegistryProducer } from '@comparaonline/event-streamer';
 * const producer = new SchemaRegistryProducer();
 * await producer.emitWithSchema({
 *   topic: 'my-topic',
 *   eventName: 'MyEvent',
 *   data,
 *   schema: MyEventSchema
 * });
 * ```
 */
export async function emit(topic: string, data: Object | Object[]): Promise<EmitResponse[]>;
/**
 * @deprecated Use SchemaRegistryProducer.emitWithSchema() instead for type safety and Schema Registry support.
 */
export async function emit(topic: string, eventName: string, data: Object | Object[]): Promise<EmitResponse[]>;
/**
 * @deprecated Use SchemaRegistryProducer.emitWithSchema() instead for type safety and Schema Registry support.
 */
export async function emit(output: Output | Output[], overwriteHosts?: string | string[]): Promise<EmitResponse[]>;
export async function emit(param1: string | Output | Output[], param2?: any, param3?: any): Promise<EmitResponse[]> {
  warnDeprecation('emit() is deprecated. Use SchemaRegistryProducer.emitWithSchema() for type safety and Schema Registry support.');
  const config = getConfig();

  const appName = config.appName ?? config.consumer?.groupId ?? getProcessHostname() ?? 'unknown';

  function getParameters(): { output: Output | Output[]; overwriteHosts?: string | string[] } {
    if (typeof param1 === 'object') {
      return {
        output: param1,
        overwriteHosts: param2
      };
    } else {
      return {
        output: {
          topic: param1,
          eventName: typeof param2 === 'string' ? param2 : undefined,
          data: typeof param2 === 'string' ? param3 : param2
        }
      };
    }
  }

  const { output, overwriteHosts } = getParameters();

  const payloads = toArray(output);

  for (const { data, eventName } of payloads) {
    if (typeof data !== 'object' || data == null) {
      throw new Error('Data must be an object or non empty array');
    }
    if (Array.isArray(data) && data.length === 0) {
      throw new Error("Data array can't be empty");
    }
    if (data.hasOwnProperty('code')) {
      throw new Error('Reserved object keyword "code" inside data');
    }
    if (eventName != null && eventName.trim() === '') {
      throw new Error('Invalid message code');
    }
  }

  if (config.onlyTesting === true) {
    onlyTestingEmittedEvents.push(...normalizePayloads(payloads, appName));
    return Promise.resolve([]);
  } else {
    const hosts = getHosts(config.host, config.producer?.additionalHosts, overwriteHosts);

    return Promise.all(
      hosts.map(async (host): Promise<EmitResponse> => {
        const producer = await getProducer(host);
        let result: RecordMetadata[] = [];
        for (const payload of normalizePayloads(payloads, appName)) {
          result = await producer.send({
            topic: payload.topic,
            messages: payload.messages,
            compression: config.producer?.compressionType ?? DEFAULT_CONFIG.compressionType
          });
        }
        debug(Debug.INFO, 'Emitted', result);
        return result;
      })
    );
  }
}
