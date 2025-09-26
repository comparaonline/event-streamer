
import { ConsumerRouter } from '..';
import { setConfig } from '../../config';
import { emit } from '../../producer';
import { Config } from '../../interfaces';

const TEST_TIMEOUT = 240000;

function generateConfig(params = {}): Config {
  return {
    host: 'fake-kafka:9092',
    consumer: {
      groupId: 'my-group-id',
      ...params,
    },
    onlyTesting: true,
  };
}

describe('Consumer Unit Tests', () => {
  describe('Router overloads', () => {
    it(
      'Add multiple routes using different signatures',
      () => {
        // arrange
        setConfig(generateConfig());
        const consumer = new ConsumerRouter();
        const routes = consumer['routes'];
        const handlers = Array(8)
          .fill(0)
          .map(() => (): void => {
            return;
          });

        // act
        consumer.add('topic-0', handlers[0]);
        consumer.add('topic-1', 'event-1', handlers[1]);
        consumer.add(['topic-2-a', 'topic-2-b'], handlers[2]);
        consumer.add(['topic-3-a', 'topic-3-b'], 'event-3', handlers[3]);
        consumer.add(['topic-4-a', 'topic-4-b'], ['event-4-a', 'event-4-b'], handlers[4]);
        consumer.add('topic-5', ['event-5-a', 'event-5-b'], handlers[5]);
        consumer.add({
          topic: 'topic-6',
          callback: handlers[6]
        });
        consumer.add({
          topic: 'topic-7',
          eventName: 'event-7',
          callback: handlers[7]
        });

        // assert
        expect(routes.length).toBe(14);
        expect(routes).toEqual([
          {
            topic: 'topic-0',
            eventName: undefined,
            callback: handlers[0]
          },
          {
            topic: 'topic-1',
            eventName: 'Event1',
            callback: handlers[1]
          },
          {
            topic: 'topic-2-a',
            eventName: undefined,
            callback: handlers[2]
          },
          {
            topic: 'topic-2-b',
            eventName: undefined,
            callback: handlers[2]
          },
          {
            topic: 'topic-3-a',
            eventName: 'Event3',
            callback: handlers[3]
          },
          {
            topic: 'topic-3-b',
            eventName: 'Event3',
            callback: handlers[3]
          },
          {
            topic: 'topic-4-a',
            eventName: 'Event4A',
            callback: handlers[4]
          },
          {
            topic: 'topic-4-a',
            eventName: 'Event4B',
            callback: handlers[4]
          },
          {
            topic: 'topic-4-b',
            eventName: 'Event4A',
            callback: handlers[4]
          },
          {
            topic: 'topic-4-b',
            eventName: 'Event4B',
            callback: handlers[4]
          },
          {
            topic: 'topic-5',
            eventName: 'Event5A',
            callback: handlers[5]
          },
          {
            topic: 'topic-5',
            eventName: 'Event5B',
            callback: handlers[5]
          },
          {
            topic: 'topic-6',
            eventName: undefined,
            callback: handlers[6]
          },
          {
            topic: 'topic-7',
            eventName: 'Event7',
            callback: handlers[7]
          }
        ]);
      },
      TEST_TIMEOUT
    );
  });

  describe('Consume testing mode', () => {
    it('Should work offline', async () => {
      setConfig({
        host: 'any-kafka:9092',
        consumer: {
          groupId: 'group-id'
        },
        onlyTesting: true
      });

      // arrange
      const consumer = new ConsumerRouter();

      const handlerA = jest.fn();
      const handlerB = jest.fn();
      const handlerC = jest.fn();

      consumer.add('topic-a', handlerA);
      consumer.add('topic-b', 'EventB', handlerB);
      consumer.add('topic-c', handlerC);

      // act

      await consumer.start();

      consumer.input({
        data: { propA: 'a' },
        topic: 'topic-a',
        eventName: 'event-random'
      });

      consumer.input({
        data: { propB: 'b' },
        topic: 'topic-b',
        eventName: 'event-b'
      });

      consumer.input({
        data: { propB: 'b' },
        topic: 'topic-b',
        eventName: 'event-c'
      });

      consumer.input({
        data: {},
        topic: 'topic-d'
      });

      // assert

      expect(handlerA).toHaveBeenCalledWith(
        {
          propA: 'a',
          code: 'EventRandom'
        },
        emit
      );
      expect(handlerB).toHaveBeenCalledWith(
        {
          propB: 'b',
          code: 'EventB'
        },
        emit
      );
      expect(handlerC).not.toHaveBeenCalled();
    });

    it('Should not work offline - no routes', async () => {
      // arrange
      setConfig({
        host: 'any-kafka:9092',
        consumer: {
          groupId: 'group-id'
        },
        onlyTesting: true
      });

      const consumer = new ConsumerRouter();

      // act & assert
      await expect(consumer.start()).rejects.toThrow('Missing routes, please add minimum 1 route');
    });

    it('Should not work offline - missing group id', async () => {
      // arrange
      setConfig({
        host: 'any-kafka:9092'
      });

      const consumer = new ConsumerRouter();

      // act & assert
      await expect(consumer.start()).rejects.toThrow('Missing configuration config.consumer.groupId for consumer');
    });

    it('Should not work offline - empty group id', async () => {
      // arrange
      setConfig({
        host: 'any-kafka:9092',
        consumer: {
          groupId: ''
        }
      });

      const consumer = new ConsumerRouter();

      // act & assert
      await expect(consumer.start()).rejects.toThrow('Missing configuration config.consumer.groupId for consumer');
    });
  });
});
