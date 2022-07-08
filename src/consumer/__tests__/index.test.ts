import { ConsumerRouter } from '..';
import { setConfig } from '../../config';
import { v4 as uuid } from 'uuid';
import { emit } from '../../producer';
import { createTopic, sendRawMessage, sleep } from '../../test/helpers';
import { stringToUpperCamelCase } from '../../helpers';
import { ConsumerGroup } from 'kafka-node';

describe('consumer', () => {
  describe('Consume online mode', () => {
    beforeEach(() => {
      setConfig({
        host: 'kafka:9092',
        consumer: {
          groupId: 'my-group-id'
        }
      });
    });

    it('Receive a single message without event code', async () => {
      // arrange
      const handler = jest.fn();
      const id = uuid();
      const topic = `my-random-topic-${id}`;

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

      await sleep(1000);

      // assert
      expect(handler).toHaveBeenCalledWith(
        {
          ...someData,
          code: stringToUpperCamelCase(topic)
        },
        emit
      );
    }, 10000);

    it('Receive two of three message by event code', async () => {
      // arrange
      const handlerA = jest.fn();
      const handlerB = jest.fn();
      const handlerC = jest.fn();
      const id = uuid();
      const topic = `my-random-topic-${id}`;

      const commitSpy = jest.spyOn(ConsumerGroup.prototype, 'commit');

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

      await sleep(1000);

      // assert
      expect(handlerA).toHaveBeenCalledTimes(2);
      expect(handlerC).toHaveBeenCalledTimes(1);
      expect(handlerB).toHaveBeenCalledTimes(0);
      expect(commitSpy).toHaveBeenCalled();
    }, 30000);

    it('Receive a message on multi topics', async () => {
      // arrange
      const handlerA = jest.fn();
      const handlerB = jest.fn();
      const handlerC = jest.fn();

      const topicA = `my-random-topic-${uuid()}`;
      const topicB = `my-random-topic-${uuid()}`;

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
      await sleep(1000);

      // assert
      expect(handlerA).toHaveBeenCalledTimes(2);
      expect(handlerB).toHaveBeenCalledTimes(1);
      expect(handlerC).toHaveBeenCalledTimes(1);
    }, 30000);

    it('Receive a single message but wont process it', async () => {
      // arrange
      const consumer = new ConsumerRouter();
      const handler = jest.fn();
      const id = uuid();
      const topic = `my-random-topic-${id}`;
      await createTopic(topic);

      // act
      consumer.add(topic, handler);

      await consumer.start();

      await sendRawMessage(topic, 'invalid JSON');

      await sleep(1000);

      // assert
      expect(handler).not.toHaveBeenCalled();
    }, 30000);
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
          groupId: 'group-id',
          autoCommit: true,
          fetchSizeInMB: 1
        },
        onlyTesting: true
      });

      const consumer = new ConsumerRouter();

      // act & assert
      await expect(consumer.start()).rejects.toThrow('Missing routes, please add minimum 1 route');
    });

    it('Should not work offline - missing group id', () => {
      // arrange
      setConfig({
        host: 'any-kafka:9092'
      });

      // act & assert
      expect(() => new ConsumerRouter()).toThrow(
        'Missing configuration config.consumer.groupId for consumer'
      );
    });

    it('Should not work offline - empty group id', () => {
      // arrange
      setConfig({
        host: 'any-kafka:9092',
        consumer: {
          groupId: ''
        }
      });

      // act & assert
      expect(() => new ConsumerRouter()).toThrow(
        'Missing configuration config.consumer.groupId for consumer'
      );
    });
  });
});
