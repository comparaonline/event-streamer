import kafkaNode = require('../../__mocks__/kafka-node');
import { EventConsumer } from '../event-consumer';
import { testRouter } from '../../test/factories/test-router';
import { testMessage } from '../../test/factories/test-message';
import { testInvalidMessage } from '../../test/factories/test-invalid-message';
import { configurationManager } from '../../test/factories/configurations';
import { eventEmitted } from '../../test/emitter-helpers';
import { Tracer } from '../../tracer';
import { tap } from 'rxjs/operators';
import { TracerContext } from '../../tracer/tracer-context';
import { TracerEvent } from '../../tracer/tracer-event';

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

  describe('regular event process flow', () => {
    it('emits a process event', async () => {
      const tracer = Tracer.instance();
      const emitted = jest.fn();
      const subscription = tracer.listen(TracerEvent.process).pipe(tap(emitted)).subscribe();
      const message = testMessage();
      kafkaNode.spies.trigger('ConsumerGroupStream', 'data', message);
      await eventEmitted(consumer, 'next');
      expect(emitted).toBeCalledWith(expect.any(TracerContext));
      subscription.unsubscribe();
    });

    it('emits a process-finished event', async () => {
      const tracer = Tracer.instance();
      const emitted = jest.fn();
      const subscription = tracer.listen(TracerEvent.processFinished).pipe(
        tap(emitted)
      ).subscribe();
      const message = testMessage();
      kafkaNode.spies.trigger('ConsumerGroupStream', 'data', message);
      await eventEmitted(consumer, 'next');
      expect(emitted).toBeCalledWith(expect.any(TracerContext));
      subscription.unsubscribe();
    });

    it('does not emit a process-finished event', async () => {
      const tracer = Tracer.instance();
      const emitted = jest.fn();
      const subscription = tracer.listen(TracerEvent.processError).pipe(
        tap(emitted)
      ).subscribe();
      const message = testMessage();
      kafkaNode.spies.trigger('ConsumerGroupStream', 'data', message);
      await eventEmitted(consumer, 'next');
      expect(emitted).not.toBeCalled();
      subscription.unsubscribe();
    });
  });

  describe('error processing event process flow', () => {
    it('emits a process message', async () => {
      const tracer = Tracer.instance();
      const emitted = jest.fn();
      const subscription = tracer.listen(TracerEvent.process).pipe(
        tap(emitted)
      ).subscribe();
      const message = testMessage('throw');
      kafkaNode.spies.trigger('ConsumerGroupStream', 'data', message);
      await eventEmitted(consumer, 'error');
      expect(emitted).toBeCalledWith(expect.any(TracerContext));
      subscription.unsubscribe();
    });

    it('does not emit a process-finished event', async () => {
      const tracer = Tracer.instance();
      const emitted = jest.fn();
      const subscription = tracer.listen(TracerEvent.processFinished).pipe(
        tap(emitted)
      ).subscribe();
      const message = testMessage('throw');
      kafkaNode.spies.trigger('ConsumerGroupStream', 'data', message);
      await eventEmitted(consumer, 'error');
      expect(emitted).not.toBeCalled();
      subscription.unsubscribe();
    });

    it('emits a process-error event', async () => {
      const tracer = Tracer.instance();
      const emitted = jest.fn();
      const subscription = tracer.listen(TracerEvent.processError).pipe(
        tap(emitted)
      ).subscribe();
      const message = testMessage('throw');
      kafkaNode.spies.trigger('ConsumerGroupStream', 'data', message);
      await eventEmitted(consumer, 'error');
      expect(emitted).not.toBeCalled();
      subscription.unsubscribe();
    });
  });
});
