import { emit, setConfig } from '../index';
import { Debug } from '../interfaces';
import { data } from './data';

setConfig({
  host: 'kafka:9092',
  debug: Debug.TRACE
});

async function main(): Promise<void> {
  const total = 100;
  for (let index = 0; index <= total; index++) {
    const result = await emit({
      topic: 'topic-a',
      data: {
        id: index,
        last: index === total,
        data
      }
    });
    await emit({
      topic: 'topic-b',
      data: {
        id: index,
        last: index === total,
        data
      }
    });
    console.log(result);
  }
}

main().catch((e) => console.error(e));
