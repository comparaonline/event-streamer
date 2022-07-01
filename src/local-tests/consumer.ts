import { ConsumerRouter } from '../consumer';
import { setConfig } from '../index';
import { Debug } from '../interfaces';

setConfig({
  host: 'localhost:9092',
  consumer: {
    groupId: 'collection',
    fetchSizeInMB: 0.5
  },
  debug: Debug.NONE
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
    // console.log(1, 'Before sleep', data.id);
    await sleep(100);
    console.log(1, 'After sleep', data.id);
    processedMessages++;
    console.log({ processedMessages: processedMessages });
    if (data.id === 99999) {
      console.timeEnd('process');
    }
  });

  consumer.add('topic-b', (data) => {
    console.log(2, data);
  });

  consumer.add('topic-c', 'event-a', (data) => {
    console.log(3, data);
  });

  consumer.add('topic-d', ['EventB', 'EventC', 'EventD'], (data) => {
    console.log(4, data);
  });
  await consumer.start();
}

main().catch((e) => console.error(e));
