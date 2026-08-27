/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ConsumerRouter } from '..';
import { setConfig } from '../../config';
import { emit } from '../../producer';
import { committedOffset, createTopic, handlerToCall, sendRawMessage, sleep } from '../../test/helpers';
import { stringToUpperCamelCase } from '../../helpers';
import { Config, Strategy, Unlimited } from '../../interfaces';
import MockDate from 'mockdate';
import { KAFKA_HOST_9092 } from '../../test/constants';

const TEST_TIMEOUT = 240000;
// Long enough that a drain which waited for it would be unmistakable in the elapsed time.
const HANDLER_LONGER_THAN_SHUTDOWN = 60000;
// Comfortably past the group-leave round trip (~5s against a local broker).
const GROUP_LEAVE_OUTLASTING_HANDLER = 10000;

interface Params {
  groupId?: string;
  strategy?: Strategy;
  maxMessagesPerTopic?: number | Unlimited;
  maxMessagesPerSpecificTopic?: Record<string, number | Unlimited>;
  shutdownTimeoutMs?: number;
}

function generateConfig(params: Params): Config {
  const { groupId, ...consumer } = params;
  return {
    host: KAFKA_HOST_9092,
    consumer: {
      groupId: groupId ?? 'my-group-id',
      ...consumer
    }
  };
}

let topicCounter = 0;

function getIncrementalId(): number {
  return topicCounter++;
}

describe('consumer', () => {
  describe('Consume online mode', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      MockDate.set('2022-12-08T00:00:00.000Z');
    });

    it(
      'Receive a single message without event code',
      async () => {
        // arrange
        const handler = jest.fn();
        const id = getIncrementalId();
        const topic = `my-random-topic-${id}`;
        setConfig(generateConfig({ strategy: 'one-by-one' }));

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

        // assert
        await handlerToCall(handler);

        expect(handler).toHaveBeenCalledWith(
          {
            ...someData,
            appName: 'my-group-id',
            createdAt: '2022-12-08 00:00:00Z',
            code: stringToUpperCamelCase(topic)
          },
          emit
        );

        await consumer.stop();
      },
      TEST_TIMEOUT
    );

    it(
      'Receive two of three message by event code',
      async () => {
        // arrange
        const handlerA = jest.fn();
        const handlerB = jest.fn();
        const handlerC = jest.fn();
        const id = getIncrementalId();
        const topic = `my-random-topic-${id}`;
        setConfig(generateConfig({ strategy: 'topic', maxMessagesPerTopic: 10 }));

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

        // assert
        await handlerToCall(handlerC);
        await sleep(1000);

        expect(handlerA).toHaveBeenCalledTimes(2);
        expect(handlerC).toHaveBeenCalledTimes(1);
        expect(handlerB).toHaveBeenCalledTimes(0);

        await consumer.stop();
      },
      TEST_TIMEOUT
    );

    it(
      'Receive a message on multi topics',
      async () => {
        // arrange
        const handlerA = jest.fn();
        const handlerB = jest.fn();
        const handlerC = jest.fn();

        const topicA = `my-random-topic-${getIncrementalId()}`;
        const topicB = `my-random-topic-${getIncrementalId()}`;

        setConfig(
          generateConfig({
            maxMessagesPerSpecificTopic: {
              topicA: 'unlimited',
              topicB: 100
            }
          })
        );

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
        await handlerToCall(handlerC);

        // assert
        await sleep(1000);
        expect(handlerA).toHaveBeenCalledTimes(2);
        expect(handlerB).toHaveBeenCalledTimes(1);
        expect(handlerC).toHaveBeenCalledTimes(1);

        await consumer.stop();
      },
      TEST_TIMEOUT
    );

    it(
      'Receive a single message but wont process it',
      async () => {
        // arrange
        const handler = jest.fn();
        const id = getIncrementalId();
        const topic = `my-random-topic-${id}`;
        setConfig(
          generateConfig({
            maxMessagesPerSpecificTopic: {}
          })
        );
        const consumer = new ConsumerRouter();
        await createTopic(topic);

        // act
        consumer.add(topic, handler);

        await consumer.start();

        await sendRawMessage(topic, 'invalid JSON');
        await sendRawMessage(topic, null);

        await sleep(1000);

        // assert
        expect(handler).not.toHaveBeenCalled();

        await consumer.stop();
      },
      TEST_TIMEOUT
    );

    it(
      'Should trigger queue',
      async () => {
        // arrange
        setConfig(generateConfig({ maxMessagesPerTopic: 1 }));
        const consumer = new ConsumerRouter();
        const handler = jest.fn();
        const id = getIncrementalId();
        const topic = `my-random-topic-${id}`;
        await createTopic(topic);

        // act
        consumer.add(topic, handler);
        await consumer.start();

        const pauseSpy = jest.spyOn(consumer['consumer']!, 'pause');
        const resumeSpy = jest.spyOn(consumer['consumer']!, 'resume');

        for (let i = 0; i < 100; i++) {
          await emit({
            topic,
            data: {}
          });
        }

        // assert
        await handlerToCall(handler);
        await sleep(1000);
        expect(handler).toHaveBeenCalled();
        expect(pauseSpy).toHaveBeenCalledWith([{ topic }]);
        expect(resumeSpy).toHaveBeenCalledWith([{ topic }]);

        await consumer.stop();
      },
      TEST_TIMEOUT
    );

    it(
      'Receive a single message and close the connection',
      async () => {
        // arrange
        setConfig(generateConfig({}));
        const handler = jest.fn();
        const id = getIncrementalId();
        const topic = `my-random-topic-${id}`;

        await createTopic(topic);

        // act
        const consumer = new ConsumerRouter();
        consumer.add(topic, handler);
        await consumer.start();

        const disconnectSpy = jest.spyOn(consumer['consumer']!, 'disconnect');

        await consumer.stop();

        // assert
        expect(disconnectSpy).toHaveBeenCalled();
      },
      TEST_TIMEOUT
    );
  });

  describe('Router overloads', () => {
    it(
      'Add multiple routes using different signatures',
      () => {
        // arrange
        setConfig(generateConfig({}));
        const consumer = new ConsumerRouter();
        const routes = consumer['routes'];
        const handlers = Array(8)
          .fill(0)
          .map(() => (): void => {
            return;
          });

        // act
        consumer.add('topic-0', handlers[0]);
        consumer.add('topic-1', 'event-1', handlers[1]);
        consumer.add(['topic-2-a', 'topic-2-b'], handlers[2]);
        consumer.add(['topic-3-a', 'topic-3-b'], 'event-3', handlers[3]);
        consumer.add(['topic-4-a', 'topic-4-b'], ['event-4-a', 'event-4-b'], handlers[4]);
        consumer.add('topic-5', ['event-5-a', 'event-5-b'], handlers[5]);
        consumer.add({
          topic: 'topic-6',
          callback: handlers[6]
        });
        consumer.add({
          topic: 'topic-7',
          eventName: 'event-7',
          callback: handlers[7]
        });

        // assert
        expect(routes.length).toBe(14);
        expect(routes).toEqual([
          {
            topic: 'topic-0',
            eventName: undefined,
            callback: handlers[0]
          },
          {
            topic: 'topic-1',
            eventName: 'Event1',
            callback: handlers[1]
          },
          {
            topic: 'topic-2-a',
            eventName: undefined,
            callback: handlers[2]
          },
          {
            topic: 'topic-2-b',
            eventName: undefined,
            callback: handlers[2]
          },
          {
            topic: 'topic-3-a',
            eventName: 'Event3',
            callback: handlers[3]
          },
          {
            topic: 'topic-3-b',
            eventName: 'Event3',
            callback: handlers[3]
          },
          {
            topic: 'topic-4-a',
            eventName: 'Event4A',
            callback: handlers[4]
          },
          {
            topic: 'topic-4-a',
            eventName: 'Event4B',
            callback: handlers[4]
          },
          {
            topic: 'topic-4-b',
            eventName: 'Event4A',
            callback: handlers[4]
          },
          {
            topic: 'topic-4-b',
            eventName: 'Event4B',
            callback: handlers[4]
          },
          {
            topic: 'topic-5',
            eventName: 'Event5A',
            callback: handlers[5]
          },
          {
            topic: 'topic-5',
            eventName: 'Event5B',
            callback: handlers[5]
          },
          {
            topic: 'topic-6',
            eventName: undefined,
            callback: handlers[6]
          },
          {
            topic: 'topic-7',
            eventName: 'Event7',
            callback: handlers[7]
          }
        ]);
      },
      TEST_TIMEOUT
    );

    it(
      'Swallows a handler that rejects, and the message is never redelivered',
      async () => {
        // arrange
        const topic = `my-random-topic-${getIncrementalId()}`;
        setConfig(generateConfig({ strategy: 'topic' }));

        await createTopic(topic);

        const handler = jest.fn().mockRejectedValue(new Error('handler failed'));

        // act
        const consumer = new ConsumerRouter();
        consumer.add(topic, handler);

        await consumer.start();

        await emit({ data: { prop: 'a' }, topic });
        await handlerToCall(handler);
        await sleep(2000);

        // assert: the error is logged and dropped so one bad message cannot stall the partition, but
        // the offset was already committed -- no retry, no dead letter. Draining on shutdown does not
        // cover this path, which is why the README calls it out next to it.
        expect(handler).toHaveBeenCalledTimes(1);

        await consumer.stop();
      },
      TEST_TIMEOUT
    );

    it(
      'Waits for the handlers already running before disconnecting',
      async () => {
        // arrange
        const topic = `my-random-topic-${getIncrementalId()}`;
        setConfig(generateConfig({ strategy: 'topic' }));

        await createTopic(topic);

        const started = jest.fn();
        let finished = false;
        const handler = async (): Promise<void> => {
          started();
          await sleep(2000);
          finished = true;
        };

        // act
        const consumer = new ConsumerRouter();
        consumer.add(topic, handler);

        await consumer.start();

        await emit({ data: { prop: 'a' }, topic });
        await handlerToCall(started);

        // The offset was committed the moment the message was queued, so Kafka will not redeliver
        // it: whatever this handler has not written by the time we disconnect is lost for good.
        expect(finished).toBe(false);

        await consumer.stop();

        // assert
        expect(finished).toBe(true);
      },
      TEST_TIMEOUT
    );

    it(
      'Shares a single shutdown between concurrent stop() calls',
      async () => {
        // arrange
        const topic = `my-random-topic-${getIncrementalId()}`;
        setConfig(generateConfig({ strategy: 'topic' }));

        await createTopic(topic);

        const started = jest.fn();
        let finished = false;
        const handler = async (): Promise<void> => {
          started();
          await sleep(2000);
          finished = true;
        };

        // act
        const consumer = new ConsumerRouter();
        consumer.add(topic, handler);

        await consumer.start();

        await emit({ data: { prop: 'a' }, topic });
        await handlerToCall(started);

        // Kubernetes can send SIGTERM more than once; the second one must not disconnect underneath
        // the drain the first one is still waiting on.
        await Promise.all([consumer.stop(), consumer.stop()]);

        // assert
        expect(finished).toBe(true);
      },
      TEST_TIMEOUT
    );

    it(
      'Survives a paused topic finishing its drain during shutdown',
      async () => {
        // arrange
        const topic = `my-random-topic-${getIncrementalId()}`;
        // The topic pauses as soon as a second message is queued, so the drain below is guaranteed
        // to run with the queue in 'paused' state -- the state whose completion callback resumes it.
        setConfig(generateConfig({ strategy: 'topic', maxMessagesPerTopic: 2, shutdownTimeoutMs: 30000 }));

        await createTopic(topic);

        const started = jest.fn();
        let finished = 0;
        const handler = async (): Promise<void> => {
          started();
          // Longer than kafkajs' group-leave: consumer.stop() only nulls its consumer group once
          // leave() returns, so a handler that settles before that resumes the topic harmlessly.
          // The window this guards is the one where the handler is still running afterwards.
          await sleep(GROUP_LEAVE_OUTLASTING_HANDLER);
          finished += 1;
        };

        // act
        const consumer = new ConsumerRouter();
        consumer.add(topic, handler);

        await consumer.start();

        await emit([
          { data: { prop: 'a' }, topic },
          { data: { prop: 'b' }, topic }
        ]);
        while (started.mock.calls.length < 2) {
          await sleep(100);
        }

        const resume = jest.spyOn((consumer as any).consumer, 'resume');
        const resumesBeforeShutdown = resume.mock.calls.length;

        await consumer.stop();

        // assert: kafkajs nulls its consumer group inside stop(), and resume() throws when it is
        // null. The unguarded version calls it from the completion callback of every handler that
        // outlives the group-leave, and the throw lands in a floating promise -- an unhandled
        // rejection that kills the process mid-drain, destroying the very messages it is draining.
        // Without the guard this test fails on that error, not on the assertions below.
        expect(resume.mock.calls.length).toBe(resumesBeforeShutdown);
        expect(finished).toBe(2);
      },
      TEST_TIMEOUT
    );

    it(
      'Gives up on a handler that outlives shutdownTimeoutMs',
      async () => {
        // arrange
        const topic = `my-random-topic-${getIncrementalId()}`;
        setConfig(generateConfig({ strategy: 'topic', shutdownTimeoutMs: 1000 }));

        await createTopic(topic);

        const started = jest.fn();
        let finished = false;
        const handler = async (): Promise<void> => {
          started();
          await sleep(HANDLER_LONGER_THAN_SHUTDOWN);
          finished = true;
        };

        // act
        const consumer = new ConsumerRouter();
        consumer.add(topic, handler);

        await consumer.start();

        await emit({ data: { prop: 'a' }, topic });
        await handlerToCall(started);

        const reported = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        // MockDate freezes Date, so measure with the monotonic clock instead.
        const startedAt = process.hrtime.bigint();
        await consumer.stop();
        const elapsedMs = Number((process.hrtime.bigint() - startedAt) / BigInt(1e6));

        // The discarded messages are gone for good, so this line is the only record they existed.
        expect(reported).toHaveBeenCalledWith('[event-streamer]', 'Shutdown timed out after', 1000, 'ms, discarding', 1, 'in-flight messages');
        reported.mockRestore();

        // assert: the drain waits, but not for this handler -- the pod finishes shutting down on its
        // own terms instead of hanging until Kubernetes SIGKILLs it. The elapsed time also covers
        // kafkajs leaving the consumer group, which is why the bound is the handler's own duration
        // and not the deadline itself; settlesWithin's unit tests pin the deadline exactly.
        expect(finished).toBe(false);
        expect(elapsedMs).toBeGreaterThanOrEqual(1000);
        expect(elapsedMs).toBeLessThan(HANDLER_LONGER_THAN_SHUTDOWN);
      },
      TEST_TIMEOUT
    );
  });

  describe("Strategy 'at-least-once'", () => {
    it(
      'Processes the batch concurrently, like the topic strategy does',
      async () => {
        // arrange
        const topic = `my-random-topic-${getIncrementalId()}`;
        setConfig(generateConfig({ strategy: 'at-least-once', groupId: `at-least-once-${getIncrementalId()}` }));

        await createTopic(topic);

        let running = 0;
        let peak = 0;
        const handler = async (): Promise<void> => {
          running += 1;
          peak = Math.max(peak, running);
          await sleep(1000);
          running -= 1;
        };

        // act
        const consumer = new ConsumerRouter();
        consumer.add(topic, handler);

        await consumer.start();

        await emit(Array.from({ length: 5 }, (_value, index) => ({ data: { index }, topic })));
        await sleep(3000);

        // assert: serialised handlers would peak at 1 and take 5s. The offset safety this strategy
        // adds is only worth having if it does not cost the concurrency of the default strategy.
        expect(peak).toBeGreaterThan(1);

        await consumer.stop();
      },
      TEST_TIMEOUT
    );

    it(
      'Applies backpressure and stops dispatching once the shutdown starts',
      async () => {
        // arrange
        const topic = `my-random-topic-${getIncrementalId()}`;
        setConfig(
          generateConfig({
            strategy: 'at-least-once',
            groupId: `at-least-once-${getIncrementalId()}`,
            maxMessagesPerTopic: 1,
            shutdownTimeoutMs: 3000
          })
        );

        await createTopic(topic);

        const started = jest.fn();
        let peak = 0;
        let running = 0;
        const handler = async (): Promise<void> => {
          started();
          running += 1;
          peak = Math.max(peak, running);
          await sleep(2000);
          running -= 1;
        };

        const consumer = new ConsumerRouter();
        consumer.add(topic, handler);

        await consumer.start();

        // act: more messages than the limit, so the batch loop has to wait for a slot, and a
        // shutdown lands while it still has messages left to dispatch.
        await emit(Array.from({ length: 6 }, (_value, index) => ({ data: { index }, topic })));
        await handlerToCall(started);
        // Mid-batch on purpose: with one slot and 2s handlers the loop is still waiting for a slot
        // when the shutdown starts, which is the moment it has to stop dispatching new work.
        await sleep(2500);
        await consumer.stop();

        // assert: never more than the configured slot in flight, and the messages the batch never
        // got to dispatch keep their offsets, which is what makes them come back.
        expect(peak).toBe(1);
        expect(started.mock.calls.length).toBeLessThan(6);
      },
      TEST_TIMEOUT
    );

    it(
      'Skips a message it cannot parse without blocking the ones behind it',
      async () => {
        // arrange
        const topic = `my-random-topic-${getIncrementalId()}`;
        setConfig(generateConfig({ strategy: 'at-least-once', groupId: `at-least-once-${getIncrementalId()}` }));

        await createTopic(topic);

        const handler = jest.fn();

        const consumer = new ConsumerRouter();
        consumer.add(topic, handler);

        await consumer.start();

        // act
        await sendRawMessage(topic, 'not json at all');
        await emit({ data: { prop: 'a' }, topic });

        // assert: the unparseable message resolves its own offset instead of holding the prefix, so
        // the good one behind it still runs.
        await handlerToCall(handler);
        expect(handler).toHaveBeenCalledTimes(1);

        await consumer.stop();
      },
      TEST_TIMEOUT
    );

    it(
      'Leaves the offset of a handler it could not finish uncommitted',
      async () => {
        // arrange
        const topic = `my-random-topic-${getIncrementalId()}`;
        const groupId = `at-least-once-${getIncrementalId()}`;
        setConfig(generateConfig({ strategy: 'at-least-once', groupId, shutdownTimeoutMs: 2000 }));

        await createTopic(topic);

        const started = jest.fn();
        const handler = async (): Promise<void> => {
          started();
          // Outlives the shutdown budget on purpose: this is the message the process abandons.
          await sleep(30000);
        };

        const consumer = new ConsumerRouter();
        consumer.add(topic, handler);

        await consumer.start();

        const before = await committedOffset(groupId, topic);

        // act
        await emit({ data: { prop: 'a' }, topic });
        await handlerToCall(started);
        await consumer.stop();

        // assert: under the default strategy this offset would already have advanced when the message
        // was queued, and the message would be gone for good. Here Kafka still owes it, so the pod
        // that replaces this one picks it up again.
        expect(await committedOffset(groupId, topic)).toBe(before);
      },
      TEST_TIMEOUT
    );
  });

  describe('Shutdown edge cases', () => {
    beforeEach(() => {
      setConfig({ host: KAFKA_HOST_9092, consumer: { groupId: 'my-group-id' } });
    });

    it('Keeps draining when a consumer group call fails mid-batch', async () => {
      // arrange: heartbeat() and commitOffsetsIfNecessary() throw once the group is gone, which is
      // exactly when a shutdown is draining. Aborting there would strand the drain for no gain.
      const consumer = new ConsumerRouter();
      const failing = async (): Promise<void> => {
        throw new Error('Consumer group was not initialized');
      };

      // act & assert
      await expect((consumer as any).ignoringGroupErrors(failing)).resolves.toBeUndefined();
    });

    it('Retries the shutdown when a previous stop() failed', async () => {
      // arrange
      const consumer = new ConsumerRouter();
      const kafkaConsumer = {
        stop: jest.fn().mockRejectedValueOnce(new Error('leave failed')).mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined)
      };
      (consumer as any).consumer = kafkaConsumer;

      // act & assert: a SIGTERM handler that catches and retries has to be able to actually drain on
      // the retry, instead of getting the first failure's promise handed back to it forever.
      await expect(consumer.stop()).rejects.toThrow('leave failed');
      await expect(consumer.stop()).resolves.toBeUndefined();

      expect(kafkaConsumer.stop).toHaveBeenCalledTimes(2);
      expect(kafkaConsumer.disconnect).toHaveBeenCalledTimes(1);
    });

    it('Drains the remaining messages when one of them rejects', async () => {
      // arrange
      let slowFinished = false;
      const rejecting = new Promise<void>((_resolve, reject) => {
        setTimeout(() => reject(new Error('handler failed')), 50);
      });
      const slow = new Promise<void>((resolve) => {
        setTimeout(() => {
          slowFinished = true;
          resolve();
        }, 250);
      });

      const consumer = new ConsumerRouter();
      const kafkaConsumer = {
        stop: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined)
      };
      (consumer as any).consumer = kafkaConsumer;
      (consumer as any).queues = { 'topic-x': { status: 'alive', promises: [rejecting, slow] } };

      // act
      await consumer.stop();

      // assert: Promise.all would have settled on the rejection at 50ms and disconnected while the
      // sibling was still writing -- with no deadline hit, so it would have looked like a clean drain.
      expect(slowFinished).toBe(true);
      expect(kafkaConsumer.disconnect).toHaveBeenCalledTimes(1);
    });
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

      // There is no consumer to drain or disconnect in testing mode.
      await expect(consumer.stop()).resolves.toBeUndefined();
    });

    it('Should not work offline - no routes', async () => {
      // arrange
      setConfig({
        host: 'any-kafka:9092',
        consumer: {
          groupId: 'group-id'
        },
        onlyTesting: true
      });

      const consumer = new ConsumerRouter();

      // act & assert
      await expect(consumer.start()).rejects.toThrow('Missing routes, please add minimum 1 route');
    });

    it('Should not work offline - missing group id', async () => {
      // arrange
      setConfig({
        host: 'any-kafka:9092'
      });

      const consumer = new ConsumerRouter();

      // act & assert
      await expect(consumer.start()).rejects.toThrow('Missing configuration config.consumer.groupId for consumer');
    });

    it('Should not work offline - empty group id', async () => {
      // arrange
      setConfig({
        host: 'any-kafka:9092',
        consumer: {
          groupId: ''
        }
      });

      const consumer = new ConsumerRouter();

      // act & assert
      await expect(consumer.start()).rejects.toThrow('Missing configuration config.consumer.groupId for consumer');
    });
  });
});
