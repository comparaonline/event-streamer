import { z } from 'zod';
import { Consumer, Kafka } from 'kafkajs';
import { SchemaRegistryClient } from '../schema-registry/client';
import { getConfig } from '../config';
import { debug, stringToUpperCamelCase } from '../helpers';
import { Debug, Strategy } from '../interfaces';
import { BaseEvent, EventHandler, EventMetadata } from '../schemas';
import { Input } from '../interfaces';
import { QueueManager, QueueConfig } from '../shared/queue-manager';
import { ErrorHandler, ErrorStrategy, ErrorHandlerConfig } from '../shared/error-handler';
import { MessageDecoder } from './internal/message-decoder';
import { RouteRegistry } from './internal/route-registry';
import { Validator } from './internal/validator';
import { ErrorCoordinator } from './internal/error-coordinator';

// New, simplified route definition for non-legacy code
interface SchemaRegistryRoute<T extends BaseEvent = BaseEvent> {
  topic: string | string[];
  eventCode?: string | string[]; // Replaces legacy eventName
  schema?: z.ZodSchema<T>; // Optional business validation (Zod)
  handler: EventHandler<T>;
  validateWithRegistry?: boolean; // Toggle SR (AJV) validation on consumer side
}

export interface SchemaRegistryConsumerConfig {
  errorStrategy?: ErrorStrategy;
  deadLetterTopic?: string;
  strategy?: Strategy;
  maxMessagesPerTopic?: number | 'unlimited';
  maxMessagesPerSpecificTopic?: Record<string, number | 'unlimited'>;
}

export class SchemaRegistryConsumerRouter {
  private schemaRegistryClient?: SchemaRegistryClient;
  private routes = new RouteRegistry();
  private decoder?: MessageDecoder;
  private validator?: Validator;
  private errorCoordinator?: ErrorCoordinator;
  private consumer: Consumer | null = null;
  private queueManager?: QueueManager;
  private errorHandler?: ErrorHandler;
  private consumerConfig: SchemaRegistryConsumerConfig;

  constructor(consumerConfig: SchemaRegistryConsumerConfig = {}) {
    this.consumerConfig = consumerConfig;
    this._initializeDependencies();
  }

  /**
   * Initializes and configures the dependencies for the consumer router.
   */
  private _initializeDependencies(): void {
    const config = getConfig();

    if (config.schemaRegistry) {
      this.schemaRegistryClient = new SchemaRegistryClient(config.schemaRegistry);
      debug(Debug.INFO, 'Schema Registry client initialized with validation caching.');
      this.decoder = new MessageDecoder(this.schemaRegistryClient);
      this.validator = new Validator(this.schemaRegistryClient);
    } else {
      this.decoder = new MessageDecoder();
      this.validator = new Validator();
    }

    if (this.consumerConfig.errorStrategy) {
      const errorConfig: ErrorHandlerConfig = {
        strategy: this.consumerConfig.errorStrategy,
        deadLetterTopic: this.consumerConfig.deadLetterTopic,
        appName: config.appName || config.consumer?.groupId || 'unknown',
        consumerGroupId: config.consumer?.groupId || 'unknown',
      };

      this.errorHandler = new ErrorHandler(errorConfig);
      this.errorCoordinator = new ErrorCoordinator(this.errorHandler, this.consumerConfig.deadLetterTopic);
      debug(Debug.INFO, 'Error handler initialized', errorConfig);
    }
  }

  // New API: object-first add()
  add<T extends BaseEvent>(route: SchemaRegistryRoute<T>): void {
    const topics = Array.isArray(route.topic) ? route.topic : [route.topic];
    const eventCodes = route.eventCode
      ? (Array.isArray(route.eventCode) ? route.eventCode : [route.eventCode]).map((n) => stringToUpperCamelCase(n))
      : [undefined];

    this.routes.add(route);

    debug(Debug.INFO, 'Route added', {
      topics,
      eventCodes,
      hasSchema: !!route.schema,
      validateWithRegistry: route.validateWithRegistry ?? true
    });
  }



  // Add fallback per topic
  addFallback<T = unknown>(config: { topic: string; handler: EventHandler<T> }): void {
    this.routes.addFallback(config.topic, config.handler as EventHandler<any>);
    debug(Debug.INFO, 'Fallback handler added', { topic: config.topic });
  }

  async start(): Promise<void> {
    if (!this._validatePreconditions()) {
      return;
    }

    const config = getConfig();
    if (config.onlyTesting) {
      return;
    }

    this._initializeQueueManager();
    await this._initializeKafkaConsumer();
    await this._runMessageProcessingLoop();
  }

  /**
   * Validates that the consumer can start.
   * @returns `true` if the consumer can start, `false` otherwise.
   */
  private _validatePreconditions(): boolean {
    const topics = this.routes.listTopics();
    if (topics.length === 0 && !this.consumerConfig.deadLetterTopic) {
      debug(Debug.WARN, 'No routes or fallbacks defined, consumer will not start.');
      return false;
    }

    if (!this.schemaRegistryClient) {
      debug(Debug.WARN, 'Schema Registry client not initialized, consumer will handle only JSON messages.');
    }

    const config = getConfig();
    if (!config.consumer?.groupId) {
      throw new Error('Missing configuration config.consumer.groupId for consumer');
    }

    return true;
  }

  /**
   * Initializes the QueueManager if the strategy is 'topic'.
   */
  private _initializeQueueManager(): void {
    const config = getConfig();
    const strategy = this.consumerConfig.strategy || config.consumer?.strategy || 'topic';

    if (strategy === 'topic') {
      const queueConfig: QueueConfig = {
        maxMessagesPerTopic: this.consumerConfig.maxMessagesPerTopic || config.consumer?.maxMessagesPerTopic || 10,
        maxMessagesPerSpecificTopic: this.consumerConfig.maxMessagesPerSpecificTopic || config.consumer?.maxMessagesPerSpecificTopic,
      };

      this.queueManager = new QueueManager(queueConfig);
      this.queueManager.initializeQueues(this.routes.listTopics());
      debug(Debug.INFO, 'Queue manager initialized for parallel processing', queueConfig);
    }
  }

  /**
   * Initializes the Kafka consumer, connects it, and subscribes to topics.
   */
  private async _initializeKafkaConsumer(): Promise<void> {
    const config = getConfig();
    const kafka = new Kafka({
      brokers: config.host.split(','),
      logLevel: config.kafkaJSLogs,
    });

    this.consumer = kafka.consumer({ groupId: config.consumer!.groupId! });
    await this.consumer.connect();
    debug(Debug.INFO, 'Schema Registry consumer connected');

    if (this.queueManager) {
      this.queueManager.setConsumer(this.consumer);
    }

    await this.consumer.subscribe({ topics: this.routes.listTopics() });
  }

  /**
   * Starts the main message processing loop for the consumer.
   */
  private async _runMessageProcessingLoop(): Promise<void> {
    const config = getConfig();
    const processingStrategy = this.consumerConfig.strategy || config.consumer?.strategy || 'topic';

    await this.consumer!.run({
      eachMessage: async ({ topic, message, partition }) => {
        if (processingStrategy === 'one-by-one') {
          try {
            await this.processSchemaRegistryMessage(topic, message, partition);
          } catch (error) {
            await this.handleProcessingError(error as Error, topic, message, partition);
          }
        } else {
          const processingPromise = this.processSchemaRegistryMessage(topic, message, partition).catch((error) =>
            this.handleProcessingError(error as Error, topic, message, partition)
          );

          if (this.queueManager) {
            this.queueManager.addToQueue(topic, processingPromise);
          }
        }
      },
    });

    debug(Debug.INFO, 'Schema Registry consumer started with enhanced validation', {
      topics: this.routes.listTopics(),
      strategy: processingStrategy,
      errorStrategy: this.consumerConfig.errorStrategy || 'none',
      hasQueueManager: !!this.queueManager,
    });
  }

  private async processSchemaRegistryMessage(topic: string, message: any, partition: number): Promise<void> {
    if (!message.value) {
      debug(Debug.DEBUG, 'Ignoring empty message', { topic, partition });
      return;
    }

    let parsedEvent: Input;
    let metadata: EventMetadata;
    let schemaId: number | undefined;

    // Decode without implicit validation; route-level flags decide
    try {
      const decoded = await this.decoder!.decode<Input>(topic, partition, message);
      if (!decoded) return;
      parsedEvent = decoded.value as Input;
      metadata = decoded.metadata;
      schemaId = decoded.schemaId;
    } catch (error) {
      debug(Debug.ERROR, 'Failed to decode message', { topic, error });
      return;
    }

    // Match routes for this topic
    const matchingRoutes = this.routes.getRoutes(topic, parsedEvent.code);

    if (matchingRoutes.length === 0) {
      const fallback = this.routes.getFallback(topic);
      if (fallback) {
        await fallback(parsedEvent, metadata);
        return;
      }
      debug(Debug.DEBUG, 'No matching routes and no fallback for topic', { topic, code: parsedEvent.code });
      return;
    }

    for (const route of matchingRoutes) {
      // SR validation (AJV) if enabled and SR message
      await this.validator!.validateWithRegistry(schemaId, parsedEvent, !!route.validateWithRegistry && !!metadata.isSchemaRegistryMessage);

      // Business validation (Zod)
      this.validator!.validateWithZod(route.schema as any, parsedEvent);

      await route.handler(parsedEvent as any, metadata);
    }
  }

  /**
   * Handle processing errors using configured error strategy
   */
  private async handleProcessingError(error: Error, topic: string, message: any, partition: number): Promise<void> {
    await this.errorCoordinator?.handle(error, topic, message, partition);
  }

  async stop(): Promise<void> {
    // Wait for all queued messages to complete if using parallel processing
    if (this.queueManager) {
      debug(Debug.INFO, 'Waiting for message queues to complete...');
      await this.queueManager.waitForAllQueues();
    }

    if (this.consumer != null) {
      await this.consumer.disconnect();
    }
  }
}
