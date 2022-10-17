import { CompressionTypes, Partitioners } from 'kafkajs';
import { clearEmittedEvents, closeAll, emit, getEmittedEvents, getParsedEmittedEvents, getProducer } from '..';
import { setConfig } from '../../config';
import { handlerToCall } from '../../test/helpers';

const defaultTopic = 'topic-a';

const defaultBodyData = {
  firstName: 'John',
  lastName: 'Doe'
};

const KAFKA_HOST_9092 = 'kafka:9092';

const CONNECTION_TTL = 2000;
const TEST_TIMEOUT = 120000;

describe('producer', () => {
  describe('emit success', () => {
    beforeEach(() => {
      setConfig({
        host: KAFKA_HOST_9092,
        producer: {
          connectionTTL: CONNECTION_TTL
        }
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

        // act
        const response = await emit({
          topic: defaultTopic,
          data: defaultBodyData,
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
                code: eventName
              })
            },
            {
              value: JSON.stringify({
                ...defaultBodyData,
                id: 2,
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
                code: 'TopicA'
              })
            },
            {
              value: JSON.stringify({
                id: 'topic-a-2',
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
                code: 'EventNameA'
              })
            },
            {
              value: JSON.stringify({
                id: 'topic-a-2',
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

  describe('emit error', () => {
    beforeEach(() => {
      setConfig({
        host: 'my-invalid-host:9092',
        producer: {
          retryOptions: {
            retries: 0
          },
          compressionType: CompressionTypes.None,
          idempotent: false,
          partitioners: Partitioners.LegacyPartitioner
        }
      });
    });
    it('Should throw an exception because data must be and object - string sended', async () => {
      await expect(emit({ data: 'my-data', topic: 'topic' })).rejects.toThrowError('Data must be an object');
    });

    it('Should throw an exception because data must be and object - null sended', async () => {
      await expect(emit({ data: null as any, topic: 'topic' })).rejects.toThrowError('Data must be an object');
    });

    it('Should throw an exception because data array is empty', async () => {
      await expect(emit({ data: [], topic: 'topic' })).rejects.toThrowError("Data array can't be empty");
    });

    it('Should throw an exception because data array is empty overload', async () => {
      await expect(emit('topic', [])).rejects.toThrowError("Data array can't be empty");
    });

    it('Should throw an exception because data array is empty overload 2', async () => {
      await expect(emit('topic', 'event-name', [])).rejects.toThrowError("Data array can't be empty");
    });

    it('Should throw an exception because event code - empty', async () => {
      await expect(emit({ data: {}, topic: 'topic', eventName: '' })).rejects.toThrowError('Invalid message code');
    });

    it('Should throw an exception because event code - inside data', async () => {
      await expect(
        emit({
          data: {
            code: 'MyEventName'
          },
          topic: 'topic'
        })
      ).rejects.toThrowError('Reserved object keyword "code" inside data');
    });

    it('should fail connection', async () => {
      await expect(
        emit({
          data: {},
          topic: 'any-topic'
        })
      ).rejects.toThrow(/getaddrinfo ENOTFOUND my-invalid-host|getaddrinfo EAI_AGAIN my-invalid-host|connection timeout/gim);
    }, 12000);

    it('should fail connection by overwrite', async () => {
      await expect(
        emit(
          {
            data: {},
            topic: 'any-topic'
          },
          ['another-host:9092']
        )
      ).rejects.toThrow(/getaddrinfo ENOTFOUND another-host|getaddrinfo EAI_AGAIN another-host|connection timeout/gim);
    }, 12000);
  });

  describe('emit testing mode - success', () => {
    beforeEach(() => {
      setConfig({
        host: 'any-host:9092',
        onlyTesting: true
      });
    });

    it('should emit pushing the event to the array', async () => {
      // arrange
      const myEvent = {
        topic: 'test',
        data: {
          a: 'a'
        },
        eventName: 'MyEvent'
      };
      // act
      await emit(myEvent);

      // assert
      let emittedEvents = getEmittedEvents();
      expect(emittedEvents.length).toBe(1);
      expect(emittedEvents[0]).toMatchObject({
        topic: myEvent.topic,
        messages: [
          {
            value: JSON.stringify({
              ...myEvent.data,
              code: myEvent.eventName
            })
          }
        ]
      });
      clearEmittedEvents();
      emittedEvents = getEmittedEvents();
      expect(emittedEvents.length).toBe(0);
    });

    it('should get each emitted message parsed and separated', async () => {
      // arrange
      const myEvent = {
        topic: 'test',
        data: {
          a: 'a'
        },
        eventName: 'MyEvent'
      };
      // act
      await emit(myEvent);

      // assert
      let emittedEvents = getParsedEmittedEvents();
      expect(emittedEvents.length).toBe(1);
      expect(emittedEvents[0]).toMatchObject({
        topic: myEvent.topic,
        eventName: 'MyEvent',
        data: {
          ...myEvent.data,
          code: myEvent.eventName
        }
      });
      clearEmittedEvents();
      emittedEvents = getParsedEmittedEvents();
      expect(emittedEvents.length).toBe(0);
    });
  });

  describe('emit testing mode - fail', () => {
    beforeEach(() => {
      setConfig({
        host: 'any-host:9092',
        onlyTesting: false
      });
    });

    it('should not be able to get emitted events or clear events', () => {
      const error = 'This method only can be called on only testing mode';
      expect(getEmittedEvents).toThrow(error);
      expect(clearEmittedEvents).toThrow(error);
    });
  });
});
