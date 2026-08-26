import { Consumer, EachMessagePayload, Kafka } from 'kafkajs';
import { getConfig } from '../config';
import { DEFAULT_CONFIG } from '../constants';
import { debug, getParsedJson, settlesWithin, stringToUpperCamelCase, validateTestingConfig } from '../helpers';
import { Input, Callback, Debug, Output, Route, Strategy } from '../interfaces';
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
    if (this.stopping == null) {
      this.stopping = this.shutdown(consumer);
    }
    return this.stopping;
  }

  private async shutdown(consumer: Consumer): Promise<void> {
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
    const drained = await settlesWithin(Promise.all(pending), this.shutdownTimeoutMs);
    if (!drained) {
      // Nothing left to do for these: their offsets were committed when they were queued, so Kafka
      // will not redeliver them. Log it loudly -- this is the silent loss becoming visible.
      debug(Debug.ERROR, 'Shutdown timed out after', this.shutdownTimeoutMs, 'ms, discarding', this.pendingMessages().length, 'in-flight messages');
    }
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

              queue.then(() => {
                topicQueue.promises.splice(topicQueue.promises.indexOf(queue), 1);
                if (topicQueue.status === 'paused') {
                  debug(Debug.INFO, 'Resuming topic', topic);
                  this.resumeTopic(topic);
                  topicQueue.status = 'alive';
                }
              });
            } else {
              debug(Debug.DEBUG, 'Committing without content');
            }
          }
        }
      });
    }
  }
}
