import { Producer } from 'kafka-node';
import { emit } from '..';
import { setConfig } from '../../config';

const defaultHeaderData = {
  attributes: 0,
  partition: 0,
  topic: 'topic-a'
};

const defaultBodyData = {
  firstName: 'John',
  lastName: 'Doe'
};

describe('producer', () => {
  describe('emit success', () => {
    beforeEach(() => {
      setConfig({
        host: 'kafka:9092'
      });
    });
    it('Should emit a single event with different topic and code', async () => {
      const sendSpy = jest.spyOn(Producer.prototype, 'send');
      const closeSpy = jest.spyOn(Producer.prototype, 'close');

      const eventName = 'EventCode';

      const response = await emit({
        topic: defaultHeaderData.topic,
        data: defaultBodyData,
        eventName
      });

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
      expect(closeSpy).toHaveBeenCalled();

      const topicsOffset = response.find((messages) => messages[defaultHeaderData.topic] != null);
      expect(topicsOffset).toBeDefined();

      if (topicsOffset != null) {
        const topicOffset = topicsOffset[defaultHeaderData.topic];
        expect(topicOffset).toBeDefined();
        expect(typeof topicOffset[String(defaultHeaderData.partition)]).toBe('number');
      }
      sendSpy.mockClear();
    });

    it('Should emit a single event with same topic and code in upper camel case', async () => {
      const sendSpy = jest.spyOn(Producer.prototype, 'send');
      const closeSpy = jest.spyOn(Producer.prototype, 'close');

      const eventName = 'TopicA';

      await emit({
        topic: defaultHeaderData.topic,
        data: defaultBodyData
      });

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
      expect(closeSpy).toHaveBeenCalled();
      sendSpy.mockClear();
    });

    it('Should emit a two events in the same topic and event', async () => {
      const sendSpy = jest.spyOn(Producer.prototype, 'send');
      const closeSpy = jest.spyOn(Producer.prototype, 'close');

      const eventName = 'EventCode';

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
      expect(closeSpy).toHaveBeenCalled();
      sendSpy.mockClear();
    });

    it('Should emit a two events in different topics', async () => {
      const sendSpy = jest.spyOn(Producer.prototype, 'send');
      const closeSpy = jest.spyOn(Producer.prototype, 'close');

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
      expect(closeSpy).toHaveBeenCalled();
      sendSpy.mockClear();
    });
  });

  describe('emit error', () => {
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
  });
});
