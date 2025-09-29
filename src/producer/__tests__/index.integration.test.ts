
import { CompressionTypes } from 'kafkajs';
import { closeAll, emit, getProducer } from '..';
import { setConfig } from '../../config';
import { handlerToCall } from '../../test/helpers';
import MockDate from 'mockdate';
import { KAFKA_HOST_9092 } from '../../test/constants';

import { connect, disconnect } from '../../test/kafka-manager';

const defaultTopic = 'topic-a';
const appName = 'event-streamer';
const defaultDate = '2022-12-08 00:00:00Z';

const defaultBodyData = {
  firstName: 'John',
  lastName: 'Doe'
};

const CONNECTION_TTL = 2000;
const TEST_TIMEOUT = 120000;

describe('Producer Integration Tests', () => {
  beforeAll(async () => {
    setConfig({
      host: KAFKA_HOST_9092,
      appName,
      producer: {
        connectionTTL: CONNECTION_TTL
      }
    });
    MockDate.set('2022-12-08T00:00:00.000Z');
    await connect();
  });

  afterAll(async () => {
    await disconnect();
    await closeAll();
  });

  describe('emit success', () => {
    beforeEach(() => {
      setConfig({
        host: KAFKA_HOST_9092,
        appName,
        producer: {
          connectionTTL: CONNECTION_TTL,
        },
      });
    });

    it(
      'Should emit a single event with different topic and code',
      async () => {
        // arrange
        const producer = await getProducer(KAFKA_HOST_9092);
        const sendSpy = jest.spyOn(producer, 'send');
        const disconnectSpy = jest.spyOn(producer, 'disconnect');

        const eventName = 'EventCode';
        const testDate = '2022-12-09 00:00:00Z';
        const testAppName = 'tests';

        // act
        const response = await emit({
          topic: defaultTopic,
          data: {
            ...defaultBodyData,
            createdAt: testDate,
            appName: testAppName
          },
          eventName
        });

        // assert
        expect(sendSpy).toHaveBeenCalled();
        expect(sendSpy).toHaveBeenCalledWith({
          topic: defaultTopic,
          compression: 0,
          messages: [
            {
              value: JSON.stringify({
                ...defaultBodyData,
                createdAt: testDate,
                appName: testAppName,
                code: eventName
              })
            }
          ]
        });
        expect(disconnectSpy).not.toHaveBeenCalled();

        const topicsOffset = response[0];
        expect(topicsOffset).toBeDefined();

        if (topicsOffset != null) {
          const topicOffset = topicsOffset.find((item) => item.topicName === defaultTopic);
          expect(topicOffset).toBeDefined();
        }
        sendSpy.mockClear();
      },
      TEST_TIMEOUT
    );

    it(
      'Should emit a single event with same topic and code in upper camel case',
      async () => {
        // arrange
        const producer = await getProducer(KAFKA_HOST_9092);
        const sendSpy = jest.spyOn(producer, 'send');
        const disconnectSpy = jest.spyOn(producer, 'disconnect');

        const eventName = 'TopicA';

        // act
        await emit({
          topic: defaultTopic,
          data: defaultBodyData
        });

        // assert
        expect(sendSpy).toHaveBeenCalledWith({
          topic: defaultTopic,
          compression: 0,
          messages: [
            {
              value: JSON.stringify({
                ...defaultBodyData,
                createdAt: defaultDate,
                appName,
                code: eventName
              })
            }
          ]
        });
        expect(disconnectSpy).not.toHaveBeenCalled();
        sendSpy.mockClear();
      },
      TEST_TIMEOUT
    );

    it(
      'Should emit a two events in the same topic and event',
      async () => {
        // arrange
        const producer = await getProducer(KAFKA_HOST_9092);
        const sendSpy = jest.spyOn(producer, 'send');
        const disconnectSpy = jest.spyOn(producer, 'disconnect');

        const eventName = 'EventCode';

        // act
        await emit({
          topic: defaultTopic,
          eventName,
          data: [
            {
              ...defaultBodyData,
              id: 1
            },
            {
              ...defaultBodyData,
              id: 2
            }
          ]
        });

        // assert
        expect(sendSpy).toHaveBeenCalledWith({
          topic: defaultTopic,
          compression: 0,
          messages: [
            {
              value: JSON.stringify({
                ...defaultBodyData,
                id: 1,
                createdAt: defaultDate,
                appName,
                code: eventName
              })
            },
            {
              value: JSON.stringify({
                ...defaultBodyData,
                id: 2,
                createdAt: defaultDate,
                appName,
                code: eventName
              })
            }
          ]
        });
        expect(disconnectSpy).not.toHaveBeenCalled();
        sendSpy.mockClear();
      },
      TEST_TIMEOUT
    );

    it(
      'Should emit a two events in different topics',
      async () => {
        // arrange
        const producer = await getProducer(KAFKA_HOST_9092);
        const sendSpy = jest.spyOn(producer, 'send');
        const disconnectSpy = jest.spyOn(producer, 'disconnect');

        // act
        await emit([
          {
            topic: 'topic-a',
            eventName: 'event-name-a',
            data: {
              id: 'topic-a-1'
            }
          },
          {
            topic: 'topic-b',
            eventName: 'event-name-b',
            data: {
              id: 'topic-b-1'
            }
          }
        ]);

        // assert
        expect(sendSpy).toHaveBeenNthCalledWith(1, {
          topic: 'topic-a',
          compression: 0,
          messages: [
            {
              value: JSON.stringify({
                id: 'topic-a-1',
                createdAt: defaultDate,
                appName,
                code: 'EventNameA'
              })
            }
          ]
        });

        expect(sendSpy).toHaveBeenNthCalledWith(2, {
          topic: 'topic-b',
          compression: 0,
          messages: [
            {
              value: JSON.stringify({
                id: 'topic-b-1',
                createdAt: defaultDate,
                appName,
                code: 'EventNameB'
              })
            }
          ]
        });

        await handlerToCall(disconnectSpy);
        sendSpy.mockClear();
      },
      TEST_TIMEOUT
    );

    it(
      'Should emit a event using topic/data overload',
      async () => {
        // arrange
        const producer = await getProducer(KAFKA_HOST_9092);
        const sendSpy = jest.spyOn(producer, 'send');
        const disconnectSpy = jest.spyOn(producer, 'disconnect');

        // act
        await emit('topic-a', {
          id: 'topic-a-1'
        });

        // assert
        expect(sendSpy).toHaveBeenCalledWith({
          topic: 'topic-a',
          compression: 0,
          messages: [
            {
              value: JSON.stringify({
                id: 'topic-a-1',
                createdAt: defaultDate,
                appName,
                code: 'TopicA'
              })
            }
          ]
        });

        expect(disconnectSpy).not.toHaveBeenCalled();
        sendSpy.mockClear();
      },
      TEST_TIMEOUT
    );

    it(
      'Should emit a event using topic/data array overload',
      async () => {
        // arrange
        const producer = await getProducer(KAFKA_HOST_9092);
        const sendSpy = jest.spyOn(producer, 'send');
        const disconnectSpy = jest.spyOn(producer, 'disconnect');

        // act
        await emit('topic-a', [
          {
            id: 'topic-a-1'
          },
          {
            id: 'topic-a-2'
          }
        ]);

        // assert
        expect(sendSpy).toHaveBeenCalledWith({
          topic: 'topic-a',
          compression: 0,
          messages: [
            {
              value: JSON.stringify({
                id: 'topic-a-1',
                createdAt: defaultDate,
                appName,
                code: 'TopicA'
              })
            },
            {
              value: JSON.stringify({
                id: 'topic-a-2',
                createdAt: defaultDate,
                appName,
                code: 'TopicA'
              })
            }
          ]
        });

        expect(disconnectSpy).not.toHaveBeenCalled();
        sendSpy.mockClear();
      },
      TEST_TIMEOUT
    );

    it(
      'Should emit a event using topic/event-name/data overload',
      async () => {
        // arrange
        const producer = await getProducer(KAFKA_HOST_9092);
        const sendSpy = jest.spyOn(producer, 'send');
        const disconnectSpy = jest.spyOn(producer, 'disconnect');

        // act
        await emit('topic-a', 'event-name-a', {
          id: 'topic-a-1'
        });

        // assert
        expect(sendSpy).toHaveBeenCalledWith({
          topic: 'topic-a',
          compression: 0,
          messages: [
            {
              value: JSON.stringify({
                id: 'topic-a-1',
                createdAt: defaultDate,
                appName,
                code: 'EventNameA'
              })
            }
          ]
        });

        expect(disconnectSpy).not.toHaveBeenCalled();
        sendSpy.mockClear();
      },
      TEST_TIMEOUT
    );

    it(
      'Should emit a event using topic/event-name/data array overload',
      async () => {
        // arrange
        setConfig({
          host: KAFKA_HOST_9092,
          appName,
          producer: {
            connectionTTL: CONNECTION_TTL,
            compressionType: CompressionTypes.GZIP
          }
        });
        const producer = await getProducer(KAFKA_HOST_9092);
        const sendSpy = jest.spyOn(producer, 'send');
        const disconnectSpy = jest.spyOn(producer, 'disconnect');

        // act
        await emit('topic-a', 'event-name-a', [
          {
            id: 'topic-a-1'
          },
          {
            id: 'topic-a-2'
          }
        ]);

        // assert
        expect(sendSpy).toHaveBeenCalledWith({
          topic: 'topic-a',
          compression: 1,
          messages: [
            {
              value: JSON.stringify({
                id: 'topic-a-1',
                createdAt: defaultDate,
                appName,
                code: 'EventNameA'
              })
            },
            {
              value: JSON.stringify({
                id: 'topic-a-2',
                createdAt: defaultDate,
                appName,
                code: 'EventNameA'
              })
            }
          ]
        });

        expect(disconnectSpy).not.toHaveBeenCalled();
        sendSpy.mockClear();
      },
      TEST_TIMEOUT
    );

    it(
      'Should create and close a producer',
      async () => {
        // arrange
        const producer = await getProducer(KAFKA_HOST_9092);
        const sendSpy = jest.spyOn(producer, 'send');
        const disconnectSpy = jest.spyOn(producer, 'disconnect');

        // act
        await emit({
          topic: 'topic-a',
          eventName: 'event-name-a',
          data: {
            id: 'topic-a-1'
          }
        });

        // assert
        expect(sendSpy).toHaveBeenCalledWith({
          topic: 'topic-a',
          compression: 0,
          messages: [
            {
              value: JSON.stringify({
                id: 'topic-a-1',
                createdAt: defaultDate,
                appName,
                code: 'EventNameA'
              })
            }
          ]
        });
        await closeAll();
        expect(disconnectSpy).toHaveBeenCalled();
        sendSpy.mockClear();
      },
      TEST_TIMEOUT
    );
  });
});
