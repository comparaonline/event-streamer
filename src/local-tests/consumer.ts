import { logLevel } from 'kafkajs';
import { ConsumerRouter } from '../consumer';
import { setConfig } from '../index';
import { Debug } from '../interfaces';

setConfig({
  host: 'kafka:9092',
  consumer: {
    groupId: 'collection',
    strategy: 'topic',
    maxMessagesPerTopic: 20,
    maxMessagesPerSpecificTopic: {
      'topic-a': 'unlimited',
      'topic-b': 10
      // topic-c
      // topic-d
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
    // await sleep((data.id % 10) * 100);
    processedMessages++;
    await sleep(500);
    // console.log(`Message id: ${data.id} - processed on queue: ${processedMessages}`);
    console.log(1, data.id);
    if (data.last === true) {
      console.timeEnd('process');
      console.log(processedMessages);
    }
  });

  consumer.add('topic-b', async (data) => {
    await sleep(500);
    console.log(2, data.id);
  });

  consumer.add('topic-c', async (data) => {
    await sleep(500);
    console.log(3, data.id);
  });

  consumer.add('topic-d', async (data) => {
    await sleep(500);
    console.log(4, data.id);
  });
  await consumer.start();
  console.log('Consumer ready');
}

main().catch((e) => console.error(e));
