import kafkaNode = require('../../__mocks__/kafka-node');
import { KafkaServer } from '../kafka-server';
import { configuration } from '../../test/factories/configurations';
import { registeredEvent } from './helpers/registered-event';
import { testRouter } from '../../test/factories/test-router';
import { TestOutputEvent } from '../../test/factories/test-output-event';

describe('KafkaServer', () => {
  let server: KafkaServer;
  beforeEach(() => kafkaNode.reset());
  beforeEach(() => {
    server = new KafkaServer(testRouter(), configuration);
    server.start();
  });

  describe('basic events', () => {
    registeredEvent('HighLevelProducer', 'ready');
    registeredEvent('ConsumerGroupStream', 'ready');
    registeredEvent('ConsumerGroupStream', 'error');
    registeredEvent('ConsumerGroupStream', 'data');

    it('reemits a ConsumerGroupStream error event', () => {
      const error = new Error('Test Error');
      const spy = jest.fn();
      server.on('error', spy);
      kafkaNode.spies.trigger('ConsumerGroupStream', 'error', error);
      expect(spy).toHaveBeenCalledWith(error);
    });
  });

  describe('stops', () => {
    it('returns the stop messages', () => {
      const expected = ['Consumer disconnected', 'Producer disconnected'];
      return expect(server.stop()).resolves.toEqual(expected);
    });
    it('calls the close method on the consumer', async () => {
      await server.stop();
      expect(kafkaNode.spies.ConsumerGroupStream.close).toHaveBeenCalledTimes(1);
    });
    it('calls the close method on the producer', async () => {
      await server.stop();
      expect(kafkaNode.spies.HighLevelProducer.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('output', () => {
    it('produces an event', async () => {
      const event = new TestOutputEvent();
      const expectedMessage = [{
        key: undefined,
        messages: event.toString(),
        topic: 'test-producer-topic'
      }];
      await server.output(event);
      const send = kafkaNode.spies.HighLevelProducer.send;
      expect(send).toHaveBeenCalledWith(expectedMessage, expect.anything());
    });
  });
});
