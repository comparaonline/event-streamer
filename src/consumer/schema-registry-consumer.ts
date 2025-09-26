import { z } from 'zod';
import { Consumer, Kafka } from 'kafkajs';
import { SchemaRegistryClient } from '../schema-registry/client';
import { getConfig } from '../config';
import { debug, getParsedJson, stringToUpperCamelCase } from '../helpers';
import { Debug, Strategy } from '../interfaces';
import { BaseEvent, EventHandler, EventMetadata } from '../schemas';
import { Input, Config } from '../interfaces';
import { QueueManager, QueueConfig } from '../shared/queue-manager';
import { ErrorHandler, ErrorStrategy, ErrorHandlerConfig } from '../shared/error-handler';
import { getProducer } from '../producer/legacy-producer';

interface SchemaRegistryRoute<T extends BaseEvent = BaseEvent> {
  topic: string | string[];
  eventName?: string | string[];
  schema?: z.ZodSchema<T>; // Optional Zod schema for additional business validation
  callback: EventHandler<T>;
  validateWithRegistry?: boolean; // Whether to validate against Schema Registry schemas
}

export interface SchemaRegistryConsumerConfig {
  errorStrategy?: ErrorStrategy;
  deadLetterTopic?: string;
  maxRetries?: number;
  strategy?: Strategy;
  maxMessagesPerTopic?: number | 'unlimited';
  maxMessagesPerSpecificTopic?: Record<string, number | 'unlimited'>;
}

export class SchemaRegistryConsumerRouter {
  private schemaRegistryClient?: SchemaRegistryClient;
  private schemaRoutes: SchemaRegistryRoute<any>[] = [];
  private consumer: Consumer | null = null;
  private queueManager?: QueueManager;
  private errorHandler?: ErrorHandler;
  private consumerConfig: SchemaRegistryConsumerConfig;

  constructor(consumerConfig: SchemaRegistryConsumerConfig = {}) {
    const config = getConfig() as Config;
    this.consumerConfig = consumerConfig;

    if (config.schemaRegistry) {
      this.schemaRegistryClient = new SchemaRegistryClient(config.schemaRegistry);
      debug(Debug.INFO, 'Schema Registry consumer initialized with validation caching');
    }

    // Initialize error handler if strategy is provided
    if (consumerConfig.errorStrategy) {
      const errorConfig: ErrorHandlerConfig = {
        strategy: consumerConfig.errorStrategy,
        deadLetterTopic: consumerConfig.deadLetterTopic,
        maxRetries: consumerConfig.maxRetries || 3,
        appName: config.appName || config.consumer?.groupId || 'unknown',
        consumerGroupId: config.consumer?.groupId || 'unknown'
      };

      this.errorHandler = new ErrorHandler(errorConfig);
      debug(Debug.INFO, 'Error handler initialized', errorConfig);
    }
  }

  // Add route with Schema Registry support
  addWithSchema<T extends BaseEvent>(
    topic: string | string[],
    handler: EventHandler<T>,
    options?: { schema?: z.ZodSchema<T>; validateWithRegistry?: boolean }
  ): void;
  addWithSchema<T extends BaseEvent>(
    topic: string | string[],
    eventName: string | string[],
    handler: EventHandler<T>,
    options?: { schema?: z.ZodSchema<T>; validateWithRegistry?: boolean }
  ): void;
  addWithSchema<T extends BaseEvent>(route: SchemaRegistryRoute<T>): void;
  addWithSchema<T extends BaseEvent>(
    param1: string | string[] | SchemaRegistryRoute<T>,
    param2?: EventHandler<T> | string | string[],
    param3?: EventHandler<T> | { schema?: z.ZodSchema<T>; validateWithRegistry?: boolean },
    param4?: { schema?: z.ZodSchema<T>; validateWithRegistry?: boolean }
  ): void {
    let route: SchemaRegistryRoute<T>;

    if (typeof param1 === 'object' && !Array.isArray(param1)) {
      // Route object passed
      route = param1;
    } else {
      // Parse parameters
      const topics = Array.isArray(param1) ? param1 : [param1];

      if (typeof param2 === 'function') {
        // No eventName provided
        route = {
          topic: topics,
          callback: param2,
          schema: (param3 as any)?.schema,
          validateWithRegistry: (param3 as any)?.validateWithRegistry ?? true
        };
      } else {
        // EventName provided
        const rawEventNames = Array.isArray(param2) ? param2 : [param2];
        const normalizedEventNames = rawEventNames.filter((name): name is string => name !== undefined).map((name) => stringToUpperCamelCase(name));
        route = {
          topic: topics,
          eventName: normalizedEventNames,
          callback: param3 as EventHandler<T>,
          schema: (param4 as any)?.schema,
          validateWithRegistry: (param4 as any)?.validateWithRegistry ?? true
        };
      }
    }

    this.schemaRoutes.push(route);

    debug(Debug.INFO, 'Schema Registry route added', {
      topics: Array.isArray(route.topic) ? route.topic : [route.topic],
      eventNames: route.eventName ? (Array.isArray(route.eventName) ? route.eventName : [route.eventName]) : undefined,
      hasSchema: !!route.schema,
      validateWithRegistry: !!route.validateWithRegistry
    });
  }

  // Start the consumer with Schema Registry message processing
  async start(): Promise<void> {
    if (this.schemaRoutes.length === 0) {
      debug(Debug.WARN, 'No Schema Registry routes defined');
      return;
    }

    if (!this.schemaRegistryClient) {
      debug(Debug.WARN, 'Schema Registry client not initialized, consumer will handle only JSON messages');
      // Continue with JSON-only behavior; routes without SR messages will still work
    }

    const config = getConfig() as Config;

    if (config.consumer == null || config.consumer.groupId == null || config.consumer.groupId.trim() === '') {
      throw new Error('Missing configuration config.consumer.groupId for consumer');
    }

    const groupId = config.consumer.groupId;
    const kafkaHost = config.host;
    const onlyTesting = config.onlyTesting ?? false;

    if (onlyTesting) {
      return Promise.resolve();
    }

    // Get all topics from schema routes
    const allTopics = new Set<string>();
    this.schemaRoutes.forEach((route) => {
      const topics = Array.isArray(route.topic) ? route.topic : [route.topic];
      topics.forEach((topic) => allTopics.add(topic));
    });

    const topics = Array.from(allTopics);

    // Initialize queue manager for parallel processing (topic strategy)
    const strategy = this.consumerConfig.strategy || config.consumer?.strategy || 'topic';
    if (strategy === 'topic') {
      const queueConfig: QueueConfig = {
        maxMessagesPerTopic: this.consumerConfig.maxMessagesPerTopic || config.consumer?.maxMessagesPerTopic || 10,
        maxMessagesPerSpecificTopic: this.consumerConfig.maxMessagesPerSpecificTopic || config.consumer?.maxMessagesPerSpecificTopic
      };

      this.queueManager = new QueueManager(queueConfig);
      this.queueManager.initializeQueues(topics);
      debug(Debug.INFO, 'Queue manager initialized for parallel processing', queueConfig);
    }

    // Initialize Kafka consumer
    const kafka = new Kafka({
      brokers: kafkaHost.split(','),
      logLevel: config.kafkaJSLogs
    });

    this.consumer = kafka.consumer({ groupId });
    await this.consumer.connect();
    debug(Debug.INFO, 'Schema Registry consumer connected');

    // Set consumer in queue manager for pause/resume functionality
    if (this.queueManager) {
      this.queueManager.setConsumer(this.consumer);
    }

    await this.consumer.subscribe({ topics });

    const processingStrategy = this.consumerConfig.strategy || config.consumer?.strategy || 'topic';

    await this.consumer.run({
      eachMessage: async ({ topic, message, partition }) => {
        if (processingStrategy === 'one-by-one') {
          try {
            await this.processSchemaRegistryMessage(topic, message, partition);
          } catch (error) {
            await this.handleProcessingError(error as Error, topic, message, partition);
          }
        } else {
          // Topic-based parallel processing with queue management
          const processingPromise = this.processSchemaRegistryMessage(topic, message, partition).catch((error) =>
            this.handleProcessingError(error as Error, topic, message, partition)
          );

          if (this.queueManager) {
            this.queueManager.addToQueue(topic, processingPromise);
          }
        }
      }
    });

    debug(Debug.INFO, 'Schema Registry consumer started with enhanced validation', {
      topics,
      strategy: processingStrategy,
      errorStrategy: this.consumerConfig.errorStrategy || 'none',
      hasQueueManager: !!this.queueManager
    });
  }

  private async processSchemaRegistryMessage(topic: string, message: any, partition: number): Promise<void> {
    if (!message.value) {
      debug(Debug.DEBUG, 'Ignoring empty message', { topic, partition });
      return;
    }

    let parsedEvent: Input;
    let metadata: EventMetadata;

    // Check if message is Schema Registry encoded
    if (this.schemaRegistryClient && SchemaRegistryClient.isSchemaRegistryEncoded(message.value)) {
      // Schema Registry message

      // this.schemaRegistryClient is checked above

      try {
        const decoded = await this.schemaRegistryClient.decodeAndValidate(message.value, true);
        parsedEvent = decoded.value as Input;

        metadata = {
          topic,
          partition,
          offset: message.offset,
          timestamp: message.timestamp,
          headers: message.headers || {},
          isSchemaRegistryMessage: true,
          schemaId: decoded.schemaId
        };

        if (!decoded.valid && decoded.validationErrors?.length) {
          debug(Debug.WARN, 'Schema Registry validation failed', {
            topic,
            schemaId: decoded.schemaId,
            errors: decoded.validationErrors
          });
        }
      } catch (error) {
        debug(Debug.ERROR, 'Failed to decode Schema Registry message', { topic, error });
        return;
      }
    } else {
      // Legacy JSON message
      try {
        const parsed = getParsedJson<Input>(message.value);
        if (!parsed) {
          debug(Debug.DEBUG, 'Could not parse JSON message', { topic });
          return;
        }
        parsedEvent = parsed;

        metadata = {
          topic,
          partition,
          offset: message.offset,
          timestamp: message.timestamp,
          headers: message.headers || {},
          isSchemaRegistryMessage: false
        };
      } catch (error) {
        debug(Debug.ERROR, 'Failed to parse JSON message', { topic, error });
        return;
      }
    }

    // Find and execute matching routes
    const matchingRoutes = this.schemaRoutes.filter((route) => {
      const topics = Array.isArray(route.topic) ? route.topic : [route.topic];
      const eventNames = route.eventName ? (Array.isArray(route.eventName) ? route.eventName : [route.eventName]) : [undefined];

      const topicMatches = topics.includes(topic);
      const eventMatches = eventNames.some((eventName) => eventName === undefined || eventName === parsedEvent.code);

      return topicMatches && eventMatches;
    });

    // Process each matching route
    for (const route of matchingRoutes) {
      // Respect route-level registry validation preference for SR messages
      const shouldValidate = route.validateWithRegistry !== undefined ? route.validateWithRegistry : true;

      // Additional Zod validation if schema provided
      if (route.schema && shouldValidate) {
        const validation = route.schema.safeParse(parsedEvent);
        if (!validation.success) {
          const validationError = new Error(
            `Route schema validation failed: ${validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`
          );
          throw validationError;
        }
      }

      await route.callback(parsedEvent as any, metadata);
    }
  }

  /**
   * Handle processing errors using configured error strategy
   */
  private async handleProcessingError(error: Error, topic: string, message: any, partition: number): Promise<void> {
    if (!this.errorHandler) {
      // No error handler configured, use legacy behavior (log and continue)
      debug(Debug.ERROR, 'Message processing error (no error handler)', {
        topic,
        partition,
        offset: message.offset,
        error: error.message
      });
      return;
    }

    // Extract event code if possible
    let originalCode = 'UnknownEvent';
    let originalPayload = message.value;

    try {
      if (SchemaRegistryClient.isSchemaRegistryEncoded(message.value)) {
        // For Schema Registry messages, we can't easily extract the code without decoding
        // Use topic name as fallback
        originalCode = topic;
      } else {
        // For JSON messages, try to extract the code
        const parsed = getParsedJson<Input>(message.value);
        if (parsed?.code) {
          originalCode = parsed.code;
        }
        originalPayload = parsed;
      }
    } catch {
      // If we can't parse, use topic name
      originalCode = topic;
    }

    const context = {
      topic,
      partition,
      offset: message.offset,
      timestamp: message.timestamp,
      originalCode,
      originalPayload,
      retryCount: 0 // TODO: Implement retry tracking if needed
    };

    const result = this.errorHandler.handleError(error, context);

    // If we have a DLQ event, send it to the dead letter topic
    if (result.deadLetterEvent && this.consumerConfig.deadLetterTopic) {
      try {
        const config = getConfig();
        const producer = await getProducer(config.host);
        await producer.send({
          topic: this.consumerConfig.deadLetterTopic,
          messages: [
            {
              value: JSON.stringify(result.deadLetterEvent)
            }
          ]
        });

        debug(Debug.INFO, 'Sent message to dead letter queue', {
          originalTopic: topic,
          originalOffset: message.offset,
          deadLetterTopic: this.consumerConfig.deadLetterTopic
        });
      } catch (dlqError) {
        debug(Debug.ERROR, 'Failed to send message to dead letter queue', {
          originalTopic: topic,
          originalOffset: message.offset,
          dlqError
        });
      }
    }
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

  getCacheStats(): any {
    return this.schemaRegistryClient?.getCacheStats();
  }

  clearCaches(): void {
    this.schemaRegistryClient?.clearCaches();
  }

  getQueueStats(): any {
    return this.queueManager?.getQueueStats() || {};
  }

  getErrorHandlerConfig(): any {
    return this.errorHandler?.getConfig();
  }
}
