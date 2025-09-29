
import { clearEmittedEvents, emit, getEmittedEvents, getParsedEmittedEvents } from '..';
import { setConfig } from '../../config';
import MockDate from 'mockdate';
import { CompressionTypes, Partitioners } from 'kafkajs';

const defaultDate = '2022-12-08 00:00:00Z';

describe('Producer Unit Tests', () => {
  beforeEach(() => {
    MockDate.set('2022-12-08T00:00:00.000Z');
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
      await expect(emit({ data: 'my-data' as any, topic: 'topic' })).rejects.toThrow('Data must be an object');
    });

    it('Should throw an exception because data must be and object - null sended', async () => {
      await expect(emit({ data: null as any, topic: 'topic' })).rejects.toThrow('Data must be an object');
    });

    it('Should throw an exception because data array is empty', async () => {
      await expect(emit({ data: [], topic: 'topic' })).rejects.toThrow("Data array can't be empty");
    });

    it('Should throw an exception because data array is empty overload', async () => {
      await expect(emit('topic', [])).rejects.toThrow("Data array can't be empty");
    });

    it('Should throw an exception because data array is empty overload 2', async () => {
      await expect(emit('topic', 'event-name', [])).rejects.toThrow("Data array can't be empty");
    });

    it('Should throw an exception because event code - empty', async () => {
      await expect(emit({ data: {}, topic: 'topic', eventName: '' })).rejects.toThrow('Invalid message code');
    });

    it('Should throw an exception because event code - inside data', async () => {
      await expect(
        emit({
          data: {
            code: 'MyEventName'
          },
          topic: 'topic'
        })
      ).rejects.toThrow('Reserved object keyword "code" inside data');
    });
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
      const previousHostname = process.env.HOSTNAME;
      process.env.HOSTNAME = 'my-service-name-abcd-1234';
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
              createdAt: defaultDate,
              appName: 'my-service-name',
              code: myEvent.eventName
            })
          }
        ]
      });
      clearEmittedEvents();
      emittedEvents = getEmittedEvents();
      expect(emittedEvents.length).toBe(0);
      process.env.HOSTNAME = previousHostname;
    });

    it('should get each emitted message parsed and separated', async () => {
      // arrange
      clearEmittedEvents();
      const myEvent = {
        topic: 'test',
        data: {
          a: 'a'
        },
        eventName: 'MyEvent'
      };
      const previousHostname = process.env.HOSTNAME;
      delete process.env.HOSTNAME;
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
          createdAt: defaultDate,
          appName: 'unknown',
          code: myEvent.eventName
        }
      });
      clearEmittedEvents();
      emittedEvents = getParsedEmittedEvents();
      expect(emittedEvents.length).toBe(0);
      process.env.HOSTNAME = previousHostname;
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
