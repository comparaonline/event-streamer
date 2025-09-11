import { Consumer, EachMessagePayload, Kafka } from 'kafkajs';
import { getConfig } from '../config';
import { DEFAULT_CONFIG } from '../constants';
import { debug, getParsedJson, stringToUpperCamelCase, validateTestingConfig } from '../helpers';
import { Input, Callback, Debug, Output, Route, Strategy } from '../interfaces';
import { emit } from '../producer';
import { QueueManager, QueueConfig } from '../shared/queue-manager';
import { ErrorHandler, ErrorStrategy, ErrorHandlerConfig } from '../shared/error-handler';
import { getProducer } from '../producer/legacy-producer';

function warnDeprecation(message: string): void {
  const config = getConfig();
  if (config.showDeprecationWarnings) {
    console.warn(`[DEPRECATION WARNING] ${message}`);
  }
}

export interface LegacyConsumerConfig {
  errorStrategy?: ErrorStrategy;
  deadLetterTopic?: string;
  maxRetries?: number;
}

/**
 * @deprecated Use SchemaRegistryConsumerRouter instead for Schema Registry support and mixed format handling.
 *
 * Legacy consumer that only handles JSON messages without schema validation.
 * This class will be removed in a future major version.
 *
 * Migration guide:
 * ```typescript
 * // Old way
 * import { ConsumerRouter } from '@comparaonline/event-streamer';
 * const consumer = new ConsumerRouter();
 * consumer.add('my-topic', 'MyEvent', handler);
 *
 * // New way
 * import { SchemaRegistryConsumerRouter } from '@comparaonline/event-streamer';
 * const consumer = new SchemaRegistryConsumerRouter();
 * consumer.addWithSchema('my-topic', 'MyEvent', handler, { schema: MyEventSchema });
 * ```
 */
export class ConsumerRouter {
  private routes: Route[] = [];
  private consumer: Consumer | null = null;
  private queueManager?: QueueManager;
  private errorHandler?: ErrorHandler;
  private legacyConfig: LegacyConsumerConfig;

  constructor(legacyConfig: LegacyConsumerConfig = {}) {
    warnDeprecation('ConsumerRouter is deprecated. Use SchemaRegistryConsumerRouter for Schema Registry support and mixed format handling.');

    this.legacyConfig = legacyConfig;

    // Initialize error handler if strategy is provided
    if (legacyConfig.errorStrategy) {
      const config = getConfig();
      const errorConfig: ErrorHandlerConfig = {
        strategy: legacyConfig.errorStrategy,
        deadLetterTopic: legacyConfig.deadLetterTopic,
        maxRetries: legacyConfig.maxRetries || 3,
        appName: config.appName || config.consumer?.groupId || 'unknown',
        consumerGroupId: config.consumer?.groupId || 'unknown'
      };

      this.errorHandler = new ErrorHandler(errorConfig);
      debug(Debug.INFO, 'Legacy consumer error handler initialized', errorConfig);
    }
  }

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
    // Wait for all queued messages to complete if using parallel processing
    if (this.queueManager) {
      debug(Debug.INFO, 'Waiting for legacy consumer message queues to complete...');
      await this.queueManager.waitForAllQueues();
    }

    if (this.consumer != null) {
      await this.consumer.disconnect();
    }
  }

  public getQueueStats(): any {
    return this.queueManager?.getQueueStats() || {};
  }

  public getErrorHandlerConfig(): any {
    return this.errorHandler?.getConfig();
  }

  private async processMessage(topic: string, content: Input): Promise<void> {
    const matchingRoutes = this.routes.filter((route) => topic === route.topic && (route.eventName == null || route.eventName === content.code));

    if (matchingRoutes.length === 0) {
      debug(Debug.DEBUG, 'No matching routes for message', { topic, eventCode: content.code });
      return;
    }

    // Process all matching routes
    for (const route of matchingRoutes) {
      debug(Debug.TRACE, 'Processing message on route', route);
      await route.callback(content, emit);
    }

    debug(Debug.DEBUG, 'Message processed successfully', {
      topic,
      eventCode: content.code,
      routeCount: matchingRoutes.length
    });
  }

  /**
   * Handle processing errors using configured error strategy
   */
  private async handleProcessingError(error: Error, topic: string, content: Input): Promise<void> {
    if (!this.errorHandler) {
      // No error handler configured, use legacy behavior (log and continue)
      debug(Debug.ERROR, 'Legacy consumer processing error (no error handler)', {
        topic,
        eventCode: content.code,
        error: error.message
      });
      return;
    }

    const context = {
      topic,
      partition: 0, // Legacy consumer doesn't track partition in this context
      offset: '0', // Legacy consumer doesn't track offset in this context
      originalCode: content.code,
      originalPayload: content,
      retryCount: 0 // TODO: Implement retry tracking if needed
    };

    const result = this.errorHandler.handleError(error, context);

    // If we have a DLQ event, send it to the dead letter topic
    if (result.deadLetterEvent && this.legacyConfig.deadLetterTopic) {
      try {
        const config = getConfig();
        const producer = await getProducer(config.host);
        await producer.send({
          topic: this.legacyConfig.deadLetterTopic,
          messages: [
            {
              value: JSON.stringify(result.deadLetterEvent)
            }
          ]
        });

        debug(Debug.INFO, 'Sent legacy message to dead letter queue', {
          originalTopic: topic,
          eventCode: content.code,
          deadLetterTopic: this.legacyConfig.deadLetterTopic
        });
      } catch (dlqError) {
        debug(Debug.ERROR, 'Failed to send legacy message to dead letter queue', {
          originalTopic: topic,
          eventCode: content.code,
          dlqError
        });
      }
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
      await this.consumer.connect();
      debug(Debug.DEBUG, 'Consumer connected');
      await this.consumer.subscribe({ topics });

      const maxMessagesPerTopic = config.consumer?.maxMessagesPerTopic ?? DEFAULT_CONFIG.maxMessagesPerTopic;
      const strategy: Strategy = config.consumer?.strategy ?? DEFAULT_CONFIG.strategy;

      // Initialize queue manager for parallel processing (topic strategy)
      if (strategy === 'topic') {
        const queueConfig: QueueConfig = {
          maxMessagesPerTopic: maxMessagesPerTopic,
          maxMessagesPerSpecificTopic: config.consumer?.maxMessagesPerSpecificTopic
        };

        this.queueManager = new QueueManager(queueConfig);
        this.queueManager.initializeQueues(topics);
        this.queueManager.setConsumer(this.consumer);
        debug(Debug.INFO, 'Legacy consumer queue manager initialized', queueConfig);
      }

      await this.consumer.run({
        eachMessage: async ({ topic, message }: EachMessagePayload) => {
          const content = getParsedJson<Input>(message.value);

          if (content == null) {
            debug(Debug.DEBUG, 'Skipping message without content');
            return;
          }

          if (strategy === 'one-by-one') {
            try {
              await this.processMessage(topic, content);
            } catch (error) {
              await this.handleProcessingError(error as Error, topic, content);
            }
          } else {
            // Topic-based parallel processing with shared queue manager
            debug(Debug.DEBUG, 'Processing message in parallel', { topic, offset: message.offset });
            const processingPromise = this.processMessage(topic, content).catch((error) =>
              this.handleProcessingError(error as Error, topic, content)
            );

            if (this.queueManager) {
              this.queueManager.addToQueue(topic, processingPromise);
            }
          }
        }
      });
    }
  }
}
