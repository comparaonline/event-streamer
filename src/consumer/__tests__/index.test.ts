import { ConsumerRouter } from '..';
import { setConfig } from '../../config';
import { v4 as uuid } from 'uuid';
import { emit } from '../../producer';
import { createTopic, sleep } from '../../test/helpers';
import { stringToUpperCamelCase } from '../../helpers';

describe('consumer', () => {
  describe('consume in a single route', () => {
    beforeEach(() => {
      setConfig({
        host: 'kafka:9092',
        consumer: {
          groupId: 'my-group-id'
        }
      });
    });

    it('Should create a valid consumer and receive a single event', async () => {
      const consumer = new ConsumerRouter();
      const handler = jest.fn();
      const id = uuid();
      const topic = `my-random-topic-${id}`;

      await createTopic(topic);
      const someData = {
        prop: 'a'
      };

      consumer.add(topic, handler);

      await consumer.start();

      await emit({
        data: someData,
        topic
      });

      await sleep(1000);

      expect(handler).toHaveBeenCalledWith(
        {
          ...someData,
          code: stringToUpperCamelCase(topic)
        },
        emit
      );
    }, 10000);
  });
});
