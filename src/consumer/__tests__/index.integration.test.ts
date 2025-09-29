
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ConsumerRouter } from '..';
import { setConfig } from '../../config';
import { emit } from '../../producer';
import { createTopic, handlerToCall, sendRawMessage, sleep } from '../../test/helpers';
import { stringToUpperCamelCase } from '../../helpers';
import { Config, Strategy, Unlimited } from '../../interfaces';
import MockDate from 'mockdate';
import { KAFKA_HOST_9092 } from '../../test/constants';

const TEST_TIMEOUT = 240000;

interface Params {
  strategy?: Strategy;
  maxMessagesPerTopic?: number | Unlimited;
  maxMessagesPerSpecificTopic?: Record<string, number | Unlimited>;
}

function generateConfig(params: Params): Config {
  return {
    host: KAFKA_HOST_9092,
    consumer: {
      groupId: 'my-group-id',
      ...params
    }
  };
}

let topicCounter = 0;

function getIncrementalId(): number {
  return topicCounter++;
}

let consumer: ConsumerRouter | null;

describe('Consumer Integration Tests', () => {
  beforeEach(() => {
    consumer = new ConsumerRouter();
  });

  afterEach(async () => {
    if (consumer) {
      await consumer.stop();
    }
    consumer = null;
  });
  describe('Consume online mode', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      MockDate.set('2022-12-08T00:00:00.000Z');
    });

    it(
      'Receive a single message without event code',
      async () => {
        // arrange
        const handler = jest.fn();
        const id = getIncrementalId();
        const topic = `my-random-topic-${id}`;
        setConfig(generateConfig({ strategy: 'one-by-one' }));

        await createTopic(topic);
        const someData = {
          prop: 'a'
        };

        // act
        const consumer = new ConsumerRouter();
        consumer.add(topic, handler);

        await consumer.start();

        await emit({
          data: someData,
          topic
        });

        // assert
        await handlerToCall(handler);

        expect(handler).toHaveBeenCalledWith(
          {
            ...someData,
            appName: 'my-group-id',
            createdAt: '2022-12-08 00:00:00Z',
            code: stringToUpperCamelCase(topic)
          },
          emit
        );

        await consumer.stop();
      },
      TEST_TIMEOUT
    );

    it(
      'Receive two of three message by event code',
      async () => {
        // arrange
        const handlerA = jest.fn();
        const handlerB = jest.fn();
        const handlerC = jest.fn();
        const id = getIncrementalId();
        const topic = `my-random-topic-${id}`;
        setConfig(generateConfig({ strategy: 'topic', maxMessagesPerTopic: 10 }));

        await createTopic(topic);
        const someData = {
          prop: 'a'
        };

        // act
        const consumer = new ConsumerRouter();

        consumer.add(topic, handlerA);
        consumer.add(topic, 'EventCodeB', handlerB);
        consumer.add(topic, ['EventCodeC', 'EventCodeD'], handlerC);

        await consumer.start();

        await emit({
          data: someData,
          topic,
          eventName: 'event-code-c'
        });

        await emit({
          data: someData,
          topic,
          eventName: 'event-code-e'
        });

        // assert
        await handlerToCall(handlerC);
        await sleep(1000);

        expect(handlerA).toHaveBeenCalledTimes(2);
        expect(handlerC).toHaveBeenCalledTimes(1);
        expect(handlerB).toHaveBeenCalledTimes(0);

        await consumer.stop();
      },
      TEST_TIMEOUT
    );

    it(
      'Receive a message on multi topics',
      async () => {
        // arrange
        const handlerA = jest.fn();
        const handlerB = jest.fn();
        const handlerC = jest.fn();

        const topicA = `my-random-topic-${getIncrementalId()}`;
        const topicB = `my-random-topic-${getIncrementalId()}`;

        setConfig(
          generateConfig({
            maxMessagesPerSpecificTopic: {
              topicA: 'unlimited',
              topicB: 100
            }
          })
        );

        await createTopic(topicA);
        await createTopic(topicB);
        const someData = {
          prop: 'a'
        };

        // act

        const consumer = new ConsumerRouter();

        consumer.add([topicA, topicB], 'EventCodeA', handlerA);
        consumer.add(topicA, 'EventCodeB', handlerB);
        consumer.add(topicB, 'EventCodeC', handlerC);

        await consumer.start();

        await emit([
          {
            data: someData,
            topic: topicA,
            eventName: 'event-code-a'
          },
          {
            data: someData,
            topic: topicA,
            eventName: 'event-code-b'
          },
          {
            data: someData,
            topic: topicA,
            eventName: 'event-code-c'
          },
          {
            data: someData,
            topic: topicB,
            eventName: 'event-code-a'
          },
          {
            data: someData,
            topic: topicB,
            eventName: 'event-code-b'
          },
          {
            data: someData,
            topic: topicB,
            eventName: 'event-code-c'
          }
        ]);
        await handlerToCall(handlerC);

        // assert
        await sleep(1000);
        expect(handlerA).toHaveBeenCalledTimes(2);
        expect(handlerB).toHaveBeenCalledTimes(1);
        expect(handlerC).toHaveBeenCalledTimes(1);

        await consumer.stop();
      },
      TEST_TIMEOUT
    );

    it(
      'Receive a single message but wont process it',
      async () => {
        // arrange
        const handler = jest.fn();
        const id = getIncrementalId();
        const topic = `my-random-topic-${id}`;
        setConfig(
          generateConfig({
            maxMessagesPerSpecificTopic: {}
          })
        );
        const consumer = new ConsumerRouter();
        await createTopic(topic);

        // act
        consumer.add(topic, handler);

        await consumer.start();

        await sendRawMessage(topic, 'invalid JSON');
        await sendRawMessage(topic, null);

        await sleep(1000);

        // assert
        expect(handler).not.toHaveBeenCalled();

        await consumer.stop();
      },
      TEST_TIMEOUT
    );

    it(
      'Should trigger queue',
      async () => {
        // arrange
        setConfig(generateConfig({ maxMessagesPerTopic: 1 }));
        const consumer = new ConsumerRouter();
        const handler = jest.fn();
        const id = getIncrementalId();
        const topic = `my-random-topic-${id}`;
        await createTopic(topic);

        // act
        consumer.add(topic, handler);
        await consumer.start();

        const pauseSpy = jest.spyOn(consumer['consumer']!, 'pause');
        const resumeSpy = jest.spyOn(consumer['consumer']!, 'resume');

        for (let i = 0; i < 100; i++) {
          await emit({
            topic,
            data: {}
          });
        }

        // assert
        await handlerToCall(handler);
        await sleep(1000);
        expect(handler).toHaveBeenCalled();
        expect(pauseSpy).toHaveBeenCalledWith([{ topic }]);
        expect(resumeSpy).toHaveBeenCalledWith([{ topic }]);

        await consumer.stop();
      },
      TEST_TIMEOUT
    );

    it(
      'Receive a single message and close the connection',
      async () => {
        // arrange
        setConfig(generateConfig({}));
        const handler = jest.fn();
        const id = getIncrementalId();
        const topic = `my-random-topic-${id}`;

        await createTopic(topic);

        // act
        const consumer = new ConsumerRouter();
        consumer.add(topic, handler);
        await consumer.start();

        const disconnectSpy = jest.spyOn(consumer['consumer']!, 'disconnect');

        await consumer.stop();

        // assert
        expect(disconnectSpy).toHaveBeenCalled();
      },
      TEST_TIMEOUT
    );
  });
});
