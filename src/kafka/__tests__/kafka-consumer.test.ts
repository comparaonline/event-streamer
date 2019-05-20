import kafkaNode = require('../../__mocks__/kafka-node');
import { EventConsumer } from '../event-consumer';
import { testRouter } from '../../test/factories/test-router';
import { testMessage } from '../../test/factories/test-message';
import { testInvalidMessage } from '../../test/factories/test-invalid-message';
import { configurationManager } from '../../test/factories/configurations';

describe('KafkaConsumer', () => {
  let consumer: EventConsumer;
  beforeEach(() => kafkaNode.reset());
  beforeEach(() => {
    consumer = new EventConsumer(testRouter(), configurationManager);
    consumer.start();
  });

  it('process a message', () => {
    const emitted = new Promise((resolve, reject) => {
      consumer.on('next', resolve);
      consumer.on('error', reject);
    });
    kafkaNode.spies.trigger('ConsumerGroupStream', 'data', testMessage());
    return expect(emitted).resolves.toBeUndefined();
  });

  it('ignores invalid messages', () => {
    const emitted = new Promise((resolve, reject) => {
      consumer.on('next', resolve);
      consumer.on('error', reject);
    });
    kafkaNode.spies.trigger('ConsumerGroupStream', 'data', testInvalidMessage());
    kafkaNode.spies.trigger('ConsumerGroupStream', 'data', testMessage());
    return expect(emitted).resolves.toBeUndefined();
  });

  it('emits errors on errors', () => {
    const emitted = new Promise((resolve, reject) => {
      consumer.on('next', resolve);
      consumer.on('error', reject);
    });
    kafkaNode.spies.trigger('ConsumerGroupStream', 'data', testMessage('throw'));
    kafkaNode.spies.trigger('ConsumerGroupStream', 'data', testMessage());
    return expect(emitted).rejects.toThrowError(/Test Error/);
  });
});
