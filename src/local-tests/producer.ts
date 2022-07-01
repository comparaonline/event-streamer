import { emit, setConfig } from '../index';
import { Debug } from '../interfaces';
import { data } from './data';

setConfig({
  host: 'localhost:9092',
  debug: Debug.TRACE
});

async function main(): Promise<void> {
  for (let index = 0; index < 100000; index++) {
    const result = await emit({
      topic: 'topic-a',
      data: {
        id: index,
        data
      }
    });
    console.log(result);
  }
}

main().catch((e) => console.error(e));
