import { getConfig } from '../config';
import { Producer, KafkaClient } from 'kafka-node';
import { Debug, Output, ProducerPartitionerType } from '../interfaces';
import { debug, stringToUpperCamelCase, toArray, validateTestingConfig } from '../helpers';

interface EmitResponse {
  [topicName: string]: {
    [partitionNumberAsString: string]: number;
  };
}

interface Payload {
  topic: string;
  messages: string[];
}

function normalizePayloads(payloads: Output[]): Payload[] {
  return payloads.map(({ topic, data, eventName }: Output) => ({
    topic,
    messages: toArray(data).map((message) =>
      JSON.stringify({
        ...message,
        code: stringToUpperCamelCase(eventName ?? topic)
      })
    )
  }));
}

let onlyTestingEmittedEvents: Payload[] = [];

export function getEmittedEvents(): Payload[] {
  validateTestingConfig();
  return onlyTestingEmittedEvents;
}

export function clearEmittedEvents(): void {
  validateTestingConfig();
  onlyTestingEmittedEvents = [];
}

function getHosts(
  defaultHost: string,
  secondaries?: string | string[],
  overwrite?: string | string[]
): string[] {
  if (overwrite != null) {
    return toArray(overwrite);
  }
  return [defaultHost, ...toArray(secondaries)];
}

const connections: Record<string, { producer: Producer; timeout?: NodeJS.Timeout }> = {};

async function createProducer(host: string): Promise<Producer> {
  const config = getConfig();
  return new Promise((resolve, reject) => {
    const client = new KafkaClient({
      autoConnect: true,
      kafkaHost: host,
      connectRetryOptions: config.producer?.retryOptions
    });

    const producer = new Producer(client, {
      partitionerType: config.producer?.partitionerType ?? ProducerPartitionerType.CYCLIC
    });

    producer.on('ready', () => {
      resolve(producer);
    });

    producer.on('error', (error) => {
      reject(error);
    });
  });
}

async function getProducer(host: string): Promise<Producer> {
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
    connection.producer.removeAllListeners();
    connection.producer.close();
    delete connections[host];
  }, config.producer?.connectionTTL ?? 5000);
  return connection.producer;
}

export function closeAll(): void {
  for (const host in connections) {
    if (connections[host] != null) {
      clearTimeout(connections[host].timeout);
      connections[host].producer.removeAllListeners();
      connections[host].producer.close();
      delete connections[host];
    }
  }
}

export async function emit(
  output: Output | Output[],
  overwriteHosts?: string | string[]
): Promise<EmitResponse[]> {
  const config = getConfig();

  const payloads = toArray(output);

  for (const { data, eventName } of payloads) {
    if (typeof data !== 'object' || data == null) {
      throw new Error('Data must be an object');
    }
    if (data.hasOwnProperty('code')) {
      throw new Error('Reserved object keyword "code" inside data');
    }
    if (eventName != null && eventName.trim() === '') {
      throw new Error('Invalid message code');
    }
  }

  if (config.onlyTesting === true) {
    onlyTestingEmittedEvents.push(...normalizePayloads(payloads));
    return Promise.resolve([{}]);
  } else {
    const hosts = getHosts(config.host, config.producer?.additionalHosts, overwriteHosts);

    return Promise.all(
      hosts.map(async (host): Promise<EmitResponse> => {
        const producer = await getProducer(host);
        return new Promise((resolve, reject) => {
          producer.send(normalizePayloads(payloads), (error, result: EmitResponse) => {
            /* istanbul ignore next */
            if (error != null) {
              debug(Debug.ERROR, result);
              reject(error);
            }
            debug(Debug.INFO, 'Emitted', result);
            resolve(result);
          });
        });
      })
    );
  }
}
