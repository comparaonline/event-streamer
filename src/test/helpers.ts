import { toArray } from '../helpers';
import { getAdminClient, getProducer } from './kafka-manager';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function handlerToCall(
  handler: vi.Mock | vi.SpyInstance,
  expectedCalls = 1
): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (handler.mock.calls.length >= expectedCalls) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

export async function createTopic(topicName: string): Promise<void> {
  const admin = getAdminClient();
  await admin.createTopics({
    topics: [
      {
        topic: topicName,
        numPartitions: 1,
        replicationFactor: 1
      }
    ]
  });
}

export async function sendRawMessage(topicName: string, content: null | string | string[]): Promise<void> {
  const producer = getProducer();
  await producer.send({
    topic: topicName,
    messages: toArray(content).map((message) => ({
      value: message
    }))
  });
}
