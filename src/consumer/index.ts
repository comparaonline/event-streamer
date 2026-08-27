import { Consumer, EachBatchPayload, EachMessagePayload, Kafka } from 'kafkajs';
import { getConfig } from '../config';
import { DEFAULT_CONFIG } from '../constants';
import { debug, getParsedJson, reportDataLoss, settlesWithin, stringToUpperCamelCase, validateTestingConfig } from '../helpers';
import { Input, Callback, Debug, Output, Route, Strategy, Unlimited } from '../interfaces';
import { emit } from '../producer';

interface Queue {
  status: 'alive' | 'paused';
  promises: Promise<void>[];
}

type Queues = Record<string, Queue>;

export class ConsumerRouter {
  private routes: Route[] = [];
  private consumer: Consumer | null = null;
  private queues: Queues = {};
  private stopping: Promise<void> | null = null;
  private shutdownTimeoutMs: number = DEFAULT_CONFIG.shutdownTimeoutMs;

  public add(topic: string, handler: Callback<any>): void;
  public add(topics: string[], handler: Callback<any>): void;
  public add(topic: string, eventName: string, handler: Callback<any>): void;
  public add(topic: string, eventNames: string[], handler: Callback<any>): void;
  public add(topics: string[], eventNames: string[], handler: Callback<any>): void;
  public add(topics: string[], eventNames: string, handler: Callback<any>): void;
  public add(route: Route): void;
  public add(param1: string | string[] | Route, param2?: string | string[] | Callback<any>, handler?: Callback<any>): void {
    const isRoute = typeof param1 === 'object' && !Array.isArray(param1);
    const topics = isRoute ? [param1.topic] : Array.isArray(param1) ? param1 : [param1];
    const eventNames = isRoute
      ? param1.eventName != null
        ? [stringToUpperCamelCase(param1.eventName)]
        : [undefined]
      : typeof param2 === 'string'
      ? [stringToUpperCamelCase(param2)]
      : Array.isArray(param2)
      ? param2.map((name) => stringToUpperCamelCase(name))
      : [undefined];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const callback = isRoute ? param1.callback : typeof param2 === 'function' ? param2 : handler!;
    for (const topic of topics) {
      for (const eventName of eventNames) {
        const route = {
          topic,
          eventName,
          callback
        };
        debug(Debug.INFO, 'Adding route', route);
        this.routes.push(route);
      }
    }
  }

  public async input({ data, topic, eventName }: Output): Promise<void> {
    validateTestingConfig();
    const code = stringToUpperCamelCase(eventName ?? topic);
    const routes = this.routes.filter((route) => topic === route.topic && (route.eventName == null || route.eventName === code));

    for (const route of routes) {
      await route.callback({ ...data, code }, emit);
    }
  }

  public async stop(): Promise<void> {
    const consumer = this.consumer;
    if (consumer == null) {
      return;
    }
    // Kubernetes can deliver more than one SIGTERM. The second one must wait for the shutdown
    // already in progress instead of racing it to disconnect() while handlers are still writing.
    // Clearing it once it settles keeps a failed shutdown retryable -- kafkajs rethrows from both
    // stop() and disconnect(), and a caller that catches and retries must be able to actually drain
    // on the retry instead of getting the first failure's promise back forever.
    if (this.stopping == null) {
      this.stopping = this.shutdown(consumer).finally(() => {
        this.stopping = null;
      });
    }
    return this.stopping;
  }

  private async shutdown(consumer: Consumer): Promise<void> {
    // The deadline covers the whole sequence, not just the drain: consumer.stop() leaves the group
    // and disconnect() closes the cluster, both network round trips under kafkajs' retry policy, and
    // an unreachable broker is one of the reasons a pod gets drained in the first place. Bounding
    // only the drain would leave the pod hanging until the SIGKILL, which is what this exists to
    // prevent.
    const work = this.drainAndDisconnect(consumer);
    const finished = await settlesWithin(work, this.shutdownTimeoutMs);
    if (!finished) {
      // Their offsets were committed when they were queued, so Kafka will not redeliver them.
      reportDataLoss('Shutdown timed out after', this.shutdownTimeoutMs, 'ms, discarding', this.pendingMessages().length, 'in-flight messages');
      return;
    }
    // Already settled: this only surfaces a failed stop()/disconnect() to the caller.
    await work;
  }

  private async drainAndDisconnect(consumer: Consumer): Promise<void> {
    // Stop fetching before draining. Under the default 'topic' strategy eachMessage returns as soon
    // as the message is queued, so kafkajs would keep delivering -- and committing the offsets of --
    // new messages into the queues while we await the ones already in flight, and the drain would
    // never catch up. consumer.stop() halts the fetch loop and leaves the group; the connection
    // stays up so the handlers still running can finish their work.
    await consumer.stop();
    await this.drainQueues();
    await consumer.disconnect();
  }

  private resumeTopic(topic: string): void {
    // Never while shutting down: kafkajs' stop() nulls its consumer group, and resume() throws
    // KafkaJSNonRetriableError when it is null. This runs from a queue completion callback, which
    // during the drain means the throw lands in a floating promise -- an unhandled rejection that
    // kills the process on Node >= 15, taking with it the very messages the drain is waiting for.
    if (this.consumer == null || this.stopping != null) {
      return;
    }
    try {
      this.consumer.resume([{ topic }]);
    } catch (e) {
      /* istanbul ignore next */
      debug(Debug.ERROR, e);
    }
  }

  private pendingMessages(): Promise<void>[] {
    // Each promise removes itself from its queue once it settles, so what is left here is exactly
    // the work whose offset is already committed but whose handler has not finished yet.
    return Object.values(this.queues).flatMap((queue) => queue.promises);
  }

  private async drainQueues(): Promise<void> {
    const pending = this.pendingMessages();
    if (pending.length === 0) {
      return;
    }
    debug(Debug.INFO, 'Draining', pending.length, 'in-flight messages before disconnecting');
    // Wait for every message to settle, not for the first failure: Promise.all would resolve on a
    // rejection and disconnect while its siblings were still writing, and it would look like a
    // clean drain because no deadline was hit.
    await Promise.all(pending.map((message) => message.catch(() => undefined)));
  }

  /**
   * Concurrency like the 'topic' strategy, but the offset only advances over messages whose handler
   * actually finished. kafkajs commits the offsets we resolve, so resolving strictly the completed
   * prefix of the batch is what keeps a half-processed message uncommitted: if the process dies now,
   * Kafka redelivers it instead of considering it handled. Handlers must therefore tolerate seeing a
   * message twice -- that is the trade this strategy makes, and the reason it is opt-in.
   */
  /**
   * Runs a consumer-group call that stops being valid the moment a rebalance or a shutdown takes the
   * group away. Swallowing the failure is the point: it must not abort a drain, and the offsets of
   * unfinished work stay unresolved regardless, which is the guarantee that actually matters.
   */
  private async ignoringGroupErrors(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (e) {
      debug(Debug.DEBUG, e);
    }
  }

  private async runAtLeastOnce(consumer: Consumer, maxMessagesPerTopic: number | Unlimited): Promise<void> {
    const config = getConfig();

    await consumer.run({
      eachBatchAutoResolve: false,
      eachBatch: async ({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary, isRunning, isStale }: EachBatchPayload) => {
        const topic = batch.topic;
        /* istanbul ignore next */
        const limit = config.consumer?.maxMessagesPerSpecificTopic?.[topic] ?? maxMessagesPerTopic;
        const inFlight = new Set<Promise<void>>();
        const tracked: Array<{ offset: string; settled: boolean }> = [];
        // One function for both arms of the settle: a rejected handler is finished work, and leaving
        // it in the set would stall the backpressure slot and every later prefix advance.
        const settled = (): undefined => undefined;

        // Stops at the first message still running: an offset resolved past it would tell Kafka that
        // message is done too, which is exactly the bug this strategy exists to avoid.
        const resolveCompletedPrefix = (): void => {
          while (tracked.length > 0 && tracked[0].settled) {
            resolveOffset(tracked[0].offset);
            tracked.shift();
          }
        };

        // Both of these talk to a consumer group that a rebalance or a shutdown can take away
        // mid-batch, and they throw when it is gone. Neither failure should abort the drain: the
        // offsets of unfinished work stay unresolved either way, which is the guarantee that matters.
        const beat = async (): Promise<void> => await this.ignoringGroupErrors(heartbeat);
        const commit = async (): Promise<void> => await this.ignoringGroupErrors(commitOffsetsIfNecessary);

        for (const message of batch.messages) {
          if (!isRunning() || isStale()) {
            break;
          }

          const entry = { offset: message.offset, settled: false };
          tracked.push(entry);

          const content = getParsedJson<Input>(message.value);
          if (content == null) {
            debug(Debug.DEBUG, 'Committing without content');
            entry.settled = true;
            resolveCompletedPrefix();
            continue;
          }

          while (limit !== 'unlimited' && inFlight.size >= limit) {
            await Promise.race(inFlight);
            resolveCompletedPrefix();
            await beat();
          }

          debug(Debug.DEBUG, 'Message offset', message.offset);
          // Settled either way: a rejected handler is finished work, and leaving it in the set would
          // stall both the backpressure slot and every later prefix advance.
          const work = this.processMessage(topic, content).then(settled, settled);
          inFlight.add(work);
          void work.then(() => {
            entry.settled = true;
            inFlight.delete(work);
          });

          resolveCompletedPrefix();
          await beat();
        }

        // Drains what is still running, including during a shutdown: kafkajs' stop() waits for this
        // callback to return, so this is where the wait happens for this strategy. Committing as the
        // prefix advances means work that did finish is not replayed on the next start.
        while (inFlight.size > 0) {
          await Promise.race(inFlight);
          resolveCompletedPrefix();
          await commit();
          await beat();
        }

        resolveCompletedPrefix();
        await commit();
      }
    });
  }

  private async processMessage(topic: string, content: Input): Promise<void> {
    return Promise.all(
      this.routes
        .filter((route) => topic === route.topic && (route.eventName == null || route.eventName === content.code))
        .map((route) => {
          debug(Debug.TRACE, 'Message received on route', route);
          try {
            return Promise.resolve(route.callback(content, emit))
              .then((value) => {
                return value;
              })
              .catch((e) => {
                debug(Debug.ERROR, e);
              });
          } catch (e) {
            /* istanbul ignore next */
            debug(Debug.ERROR, e);
          }
        })
    ).then((results) => {
      if (results.length === 0) {
        debug(Debug.DEBUG, 'Committing without match');
      } else {
        debug(Debug.DEBUG, 'Committing with', results.length, 'matches');
      }
    });
  }

  private initQueues(topics: string[]): void {
    for (const topic of topics) {
      this.queues[topic] = {
        status: 'alive',
        promises: []
      };
    }
  }

  public async start(): Promise<void> {
    const config = getConfig();

    if (config.consumer == null || config.consumer.groupId == null || config.consumer.groupId.trim() === '') {
      throw new Error('Missing configuration config.consumer.groupId for consumer');
    }

    const groupId = config.consumer.groupId;
    const kafkaHost = config.host;
    const onlyTesting = config.onlyTesting ?? DEFAULT_CONFIG.onlyTesting;

    if (this.routes.length === 0) {
      throw new Error('Missing routes, please add minimum 1 route');
    }
    if (onlyTesting) {
      return Promise.resolve();
    } else {
      const kafka = new Kafka({
        brokers: kafkaHost.split(','),
        logLevel: config.kafkaJSLogs
      });

      const topics = this.routes.map((route) => route.topic).filter((value, index, array) => array.indexOf(value) === index);

      this.consumer = kafka.consumer({ groupId });
      this.stopping = null;
      await this.consumer.connect();
      debug(Debug.DEBUG, 'Consumer connected');
      await this.consumer.subscribe({ topics });

      this.initQueues(topics);

      const maxMessagesPerTopic = config.consumer.maxMessagesPerTopic ?? DEFAULT_CONFIG.maxMessagesPerTopic;

      const strategy: Strategy = config.consumer.strategy ?? DEFAULT_CONFIG.strategy;

      this.shutdownTimeoutMs = config.consumer.shutdownTimeoutMs ?? DEFAULT_CONFIG.shutdownTimeoutMs;

      if (strategy === 'at-least-once') {
        await this.runAtLeastOnce(this.consumer, maxMessagesPerTopic);
        return;
      }

      await this.consumer.run({
        eachMessage: async ({ topic, message }: EachMessagePayload) => {
          const content = getParsedJson<Input>(message.value);

          if (strategy === 'one-by-one') {
            if (content != null) {
              await this.processMessage(topic, content);
            }
          } else {
            const topicQueue = this.queues[topic];
            /* istanbul ignore next */
            const topicMaxQueue = config.consumer?.maxMessagesPerSpecificTopic?.[topic] ?? maxMessagesPerTopic;

            if (content != null) {
              if (topicMaxQueue !== 'unlimited' && topicQueue.promises.length + 1 >= topicMaxQueue) {
                debug(Debug.INFO, 'Stopping topic', topic);
                if (this.consumer != null) {
                  this.consumer.pause([{ topic }]);
                }
                topicQueue.status = 'paused';
              }
              debug(Debug.DEBUG, 'Message offset', message.offset);
              const queue = this.processMessage(topic, content);
              topicQueue.promises.push(queue);

              const onSettled = (): void => {
                topicQueue.promises.splice(topicQueue.promises.indexOf(queue), 1);
                if (topicQueue.status === 'paused') {
                  debug(Debug.INFO, 'Resuming topic', topic);
                  this.resumeTopic(topic);
                  topicQueue.status = 'alive';
                }
              };
              // On settle, not on fulfil: a promise left in the queue inflates the backpressure
              // count forever, and now that this queue is what shutdown drains, it would stall every
              // later drain too.
              queue.then(onSettled, onSettled);
            } else {
              debug(Debug.DEBUG, 'Committing without content');
            }
          }
        }
      });
    }
  }
}
