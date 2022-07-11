import { Producer } from 'kafka-node';
import { clearEmittedEvents, emit, getEmittedEvents } from '..';
import { setConfig } from '../../config';
import { ProducerPartitionerType } from '../../interfaces';
import { sleep } from '../../test/helpers';

const defaultHeaderData = {
  attributes: 0,
  partition: 0,
  topic: 'topic-a'
};

const defaultBodyData = {
  firstName: 'John',
  lastName: 'Doe'
};

const CONNECTION_TTL = 2000;
const AFTER_CONNECTION_TTL = 5000;
const TEST_TIMEOUT = 30000;

describe('producer', () => {
  describe('emit success', () => {
    beforeEach(() => {
      setConfig({
        host: 'kafka:9092',
        producer: {
          connectionTTL: CONNECTION_TTL
        }
      });
    });
    it(
      'Should emit a single event with different topic and code',
      async () => {
        // arrange
        const sendSpy = jest.spyOn(Producer.prototype, 'send');
        const closeSpy = jest.spyOn(Producer.prototype, 'close');

        const eventName = 'EventCode';

        // act
        const response = await emit({
          topic: defaultHeaderData.topic,
          data: defaultBodyData,
          eventName
        });

        // assert
        expect(sendSpy).toHaveBeenCalled();
        expect(sendSpy).toHaveBeenCalledWith(
          [
            {
              ...defaultHeaderData,
              messages: [
                JSON.stringify({
                  ...defaultBodyData,
                  code: eventName
                })
              ]
            }
          ],
          expect.any(Function)
        );
        expect(closeSpy).not.toHaveBeenCalled();

        const topicsOffset = response.find((messages) => messages[defaultHeaderData.topic] != null);
        expect(topicsOffset).toBeDefined();

        if (topicsOffset != null) {
          const topicOffset = topicsOffset[defaultHeaderData.topic];
          expect(topicOffset).toBeDefined();
          expect(typeof topicOffset[String(defaultHeaderData.partition)]).toBe('number');
        }
        sendSpy.mockClear();
      },
      TEST_TIMEOUT
    );

    it(
      'Should emit a single event with same topic and code in upper camel case',
      async () => {
        // arrange
        const sendSpy = jest.spyOn(Producer.prototype, 'send');
        const closeSpy = jest.spyOn(Producer.prototype, 'close');

        const eventName = 'TopicA';

        // act
        await emit({
          topic: defaultHeaderData.topic,
          data: defaultBodyData
        });

        // assert
        expect(sendSpy).toHaveBeenCalledWith(
          [
            {
              ...defaultHeaderData,
              messages: [
                JSON.stringify({
                  ...defaultBodyData,
                  code: eventName
                })
              ]
            }
          ],
          expect.any(Function)
        );
        expect(closeSpy).not.toHaveBeenCalled();
        sendSpy.mockClear();
      },
      TEST_TIMEOUT
    );

    it(
      'Should emit a two events in the same topic and event',
      async () => {
        // arrange
        const sendSpy = jest.spyOn(Producer.prototype, 'send');
        const closeSpy = jest.spyOn(Producer.prototype, 'close');

        const eventName = 'EventCode';

        // act
        await emit({
          topic: defaultHeaderData.topic,
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
        expect(sendSpy).toHaveBeenCalledWith(
          [
            {
              ...defaultHeaderData,
              messages: [
                JSON.stringify({
                  ...defaultBodyData,
                  id: 1,
                  code: eventName
                }),
                JSON.stringify({
                  ...defaultBodyData,
                  id: 2,
                  code: eventName
                })
              ]
            }
          ],
          expect.any(Function)
        );
        expect(closeSpy).not.toHaveBeenCalled();
        sendSpy.mockClear();
      },
      TEST_TIMEOUT
    );

    it(
      'Should emit a two events in different topics',
      async () => {
        // arrange
        const sendSpy = jest.spyOn(Producer.prototype, 'send');
        const closeSpy = jest.spyOn(Producer.prototype, 'close');

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
        expect(sendSpy).toHaveBeenCalledWith(
          [
            {
              partition: defaultHeaderData.partition,
              attributes: defaultHeaderData.attributes,
              topic: 'topic-a',
              messages: [
                JSON.stringify({
                  id: 'topic-a-1',
                  code: 'EventNameA'
                })
              ]
            },
            {
              partition: defaultHeaderData.partition,
              attributes: defaultHeaderData.attributes,
              topic: 'topic-b',
              messages: [
                JSON.stringify({
                  id: 'topic-b-1',
                  code: 'EventNameB'
                })
              ]
            }
          ],
          expect.any(Function)
        );
        await sleep(AFTER_CONNECTION_TTL);
        expect(closeSpy).toHaveBeenCalled();
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
          partitionerType: ProducerPartitionerType.DEFAULT
        }
      });
    });
    it('Should throw an exception because data must be and object - string sended', async () => {
      await expect(emit({ data: 'my-data', topic: 'topic' })).rejects.toThrowError(
        'Data must be an object'
      );
    });

    it('Should throw an exception because data must be and object - null sended', async () => {
      await expect(emit({ data: null as any, topic: 'topic' })).rejects.toThrowError(
        'Data must be an object'
      );
    });

    it('Should throw an exception because event code - empty', async () => {
      await expect(emit({ data: {}, topic: 'topic', eventName: '' })).rejects.toThrowError(
        'Invalid message code'
      );
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
      ).rejects.toThrow(
        /getaddrinfo ENOTFOUND my-invalid-host|getaddrinfo EAI_AGAIN my-invalid-host/gim
      );
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
      ).rejects.toThrow(/getaddrinfo ENOTFOUND another-host|getaddrinfo EAI_AGAIN another-host/gim);
    }, 12000);
  });

  describe('emit testing mode - success', () => {
    beforeEach(() => {
      setConfig({
        host: 'anyhost:9092',
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
          JSON.stringify({
            ...myEvent.data,
            code: myEvent.eventName
          })
        ]
      });
      clearEmittedEvents();
      emittedEvents = getEmittedEvents();
      expect(emittedEvents.length).toBe(0);
    });
  });

  describe('emit testing mode - fail', () => {
    beforeEach(() => {
      setConfig({
        host: 'anyhost:9092',
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
