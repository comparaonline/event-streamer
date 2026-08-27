import { Kafka } from 'kafkajs';
import { getConfig } from '../config';
import { toArray } from '../helpers';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function handlerToCall(handler: jest.Mock | jest.SpyInstance): Promise<void> {
  while (handler.mock.calls.length === 0) {
    await sleep(100);
  }
}

export async function createTopic(topicName: string): Promise<void> {
  const config = getConfig();
  const client = new Kafka({
    brokers: config.host.split(','),
    logLevel: config.kafkaJSLogs
  });
  const admin = client.admin();
  await admin.connect();
  await admin.createTopics({
    topics: [
      {
        topic: topicName,
        numPartitions: 1,
        replicationFactor: 1
      }
    ]
  });
  await admin.disconnect();
}

export async function sendRawMessage(topicName: string, content: null | string | string[]): Promise<void> {
  const config = getConfig();
  const client = new Kafka({
    brokers: config.host.split(','),
    logLevel: config.kafkaJSLogs
  });
  const producer = client.producer();
  await producer.connect();
  await producer.send({
    topic: topicName,
    messages: toArray(content).map((message) => ({
      value: message
    }))
  });
}

export async function committedOffset(groupId: string, topicName: string): Promise<string> {
  const config = getConfig();
  const client = new Kafka({
    brokers: config.host.split(','),
    logLevel: config.kafkaJSLogs
  });
  const admin = client.admin();
  await admin.connect();
  const offsets = await admin.fetchOffsets({ groupId, topics: [topicName] });
  await admin.disconnect();
  return offsets[0].partitions[0].offset;
}
