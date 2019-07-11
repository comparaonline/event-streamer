import kafkaNode = require('../../__mocks__/kafka-node');
import { EventConsumer } from '../event-consumer';
import { testRouter } from '../../test/factories/test-router';
import { testMessage } from '../../test/factories/test-message';
import { testInvalidMessage } from '../../test/factories/test-invalid-message';
import { configurationManager } from '../../test/factories/configurations';
import { eventEmitted } from '../../test/emitter-helpers';
import { testSlowMessage } from '../../test/factories/test-slow-message';

describe('KafkaConsumer', () => {
  let consumer: EventConsumer;
  beforeEach(() => kafkaNode.reset());
  beforeEach(() => {
    consumer = new EventConsumer(testRouter(), configurationManager);
    consumer.start();
  });

  it('process a message', async () => {
    const emitted = jest.fn();
    consumer.on('next', emitted);
    const message = testMessage();
    kafkaNode.spies.trigger('ConsumerGroupStream', 'data', message);
    await eventEmitted(consumer, 'next');
    expect(emitted).toBeCalledWith(message);
  });

  it('lets invalid messages pass through', async () => {
    const emitted = jest.fn();
    consumer.on('next', emitted);
    const message = testInvalidMessage();
    kafkaNode.spies.trigger('ConsumerGroupStream', 'data', message);
    await eventEmitted(consumer, 'next');
    expect(emitted).toHaveBeenCalledWith(message);
  });

  it('emits errors on errors', async () => {
    const error = jest.fn();
    const next = jest.fn();
    consumer.on('next', next);
    consumer.on('error', error);

    kafkaNode.spies.trigger('ConsumerGroupStream', 'data', testMessage('throw'));
    kafkaNode.spies.trigger('ConsumerGroupStream', 'data', testMessage());
    await eventEmitted(consumer, 'error');
    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('keeps track of backpressure', async () => {
    let backpressure = 0;
    consumer.backpressure.subscribe(i => backpressure = i);
    expect(backpressure).toEqual(0);
    kafkaNode.spies.trigger('ConsumerGroupStream', 'data', testSlowMessage('test1', 100));
    expect(backpressure).toEqual(1);
    kafkaNode.spies.trigger('ConsumerGroupStream', 'data', testSlowMessage('test2', 100));
    expect(backpressure).toEqual(2);
    await eventEmitted(consumer, 'next');
    expect(backpressure).toEqual(1);
    await eventEmitted(consumer, 'next');
    expect(backpressure).toEqual(0);
  });
});
