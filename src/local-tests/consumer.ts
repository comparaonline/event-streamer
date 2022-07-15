import { logLevel } from 'kafkajs';
import { ConsumerRouter } from '../consumer';
import { setConfig } from '../index';
import { Debug } from '../interfaces';

setConfig({
  host: 'kafka:9092',
  consumer: {
    groupId: 'collection',
    strategy: 'one-by-one',
    maxMessagesPerTopic: 20,
    maxMessagesPerSpecificTopic: {
      'topic-a': 'unlimited',
      'topic-b': 1
    }
  },
  debug: Debug.NONE,
  kafkaJSLogs: logLevel.NOTHING
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main(): Promise<void> {
  const consumer = new ConsumerRouter();
  let processedMessages = 0;
  console.time('process');
  consumer.add('topic-a', async (data) => {
    await sleep((data.id % 10) * 100);
    processedMessages++;
    console.log(`Message id: ${data.id} - processed on queue: ${processedMessages}`);
    if (data.last === true) {
      console.timeEnd('process');
    }
  });

  consumer.add('topic-b', async (data) => {
    await sleep(50);
    console.log(2, data.id);
  });

  consumer.add('topic-c', 'event-a', (data) => {
    console.log(3, data);
  });

  consumer.add('topic-d', ['EventB', 'EventC', 'EventD'], (data) => {
    console.log(4, data);
  });
  await consumer.start();
  console.log('Consumer ready');
}

main().catch((e) => console.error(e));
