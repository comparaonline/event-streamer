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
      hosts.map((host): Promise<EmitResponse> => {
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
            producer.send(normalizePayloads(payloads), (error, result: EmitResponse) => {
              /* istanbul ignore next */
              if (error != null) {
                debug(Debug.ERROR, result);
                reject(error);
              }
              debug(Debug.INFO, 'Emitted', result);
              resolve(result);
              producer.close();
            });
          });

          producer.on('error', (error) => {
            reject(error);
          });
        });
      })
    );
  }
}
