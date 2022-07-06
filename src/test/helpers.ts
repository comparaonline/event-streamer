import { KafkaClient } from 'kafka-node';
import { getConfig } from '../config';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function createTopic(topicName: string): Promise<void> {
  const config = getConfig();
  const client = new KafkaClient({
    kafkaHost: config.host
  });
  return new Promise((resolve) => {
    client.createTopics(
      [
        {
          topic: topicName,
          partitions: 1,
          replicationFactor: 1
        }
      ],
      (error, result) => {
        if (error != null) {
          console.log(error);
        }
        if (result.length > 0) {
          console.log(result);
        }
        resolve();
      }
    );
  });
}
