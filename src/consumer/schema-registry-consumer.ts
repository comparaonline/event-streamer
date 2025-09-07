import { z } from 'zod';
import { Consumer, Kafka } from 'kafkajs';
import { SchemaRegistryClient } from '../schema-registry/client';
import { getConfig } from '../config';
import { debug, getParsedJson } from '../helpers';
import { Debug } from '../interfaces';
import { BaseEvent, EventHandler, EventMetadata } from '../schemas';
import { Input, Config } from '../interfaces';

interface SchemaRegistryRoute<T extends BaseEvent = BaseEvent> {
  topic: string | string[];
  eventName?: string | string[];
  schema?: z.ZodSchema<T>; // Optional Zod schema for additional business validation
  callback: EventHandler<T>;
  validateWithRegistry?: boolean; // Whether to validate against Schema Registry schemas
}

export class SchemaRegistryConsumerRouter {
  private schemaRegistryClient?: SchemaRegistryClient;
  private schemaRoutes: SchemaRegistryRoute<any>[] = [];
  private consumer: Consumer | null = null;

  constructor() {
    const config = getConfig() as Config;

    if (config.schemaRegistry) {
      this.schemaRegistryClient = new SchemaRegistryClient(config.schemaRegistry);
      debug(Debug.INFO, 'Schema Registry consumer initialized with validation caching');
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
        const eventNames = Array.isArray(param2) ? param2 : [param2];
        route = {
          topic: topics,
          eventName: eventNames.filter((name): name is string => name !== undefined),
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
      throw new Error('Schema Registry client not initialized. Check schemaRegistry config.');
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

    // Initialize Kafka consumer
    const kafka = new Kafka({
      brokers: kafkaHost.split(','),
      logLevel: config.kafkaJSLogs
    });

    this.consumer = kafka.consumer({ groupId });
    await this.consumer.connect();
    debug(Debug.INFO, 'Schema Registry consumer connected');

    await this.consumer.subscribe({ topics });

    await this.consumer.run({
      eachMessage: async ({ topic, message, partition }) => {
        try {
          await this.processSchemaRegistryMessage(topic, message, partition);
        } catch (error) {
          debug(Debug.ERROR, 'Error processing message', { topic, partition, error });
        }
      }
    });

    debug(Debug.INFO, 'Schema Registry consumer started with enhanced validation', { topics });
  }

  private async processSchemaRegistryMessage(topic: string, message: any, partition: number): Promise<void> {
    if (!message.value) {
      debug(Debug.DEBUG, 'Ignoring empty message', { topic, partition });
      return;
    }

    let parsedEvent: Input;
    let metadata: EventMetadata;

    // Check if message is Schema Registry encoded
    if (SchemaRegistryClient.isSchemaRegistryEncoded(message.value)) {
      // Schema Registry message

      if (!this.schemaRegistryClient) {
        debug(Debug.ERROR, 'Schema Registry message received but client not initialized');
        return;
      }

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
      try {
        // Additional Zod validation if schema provided
        if (route.schema) {
          const validation = route.schema.safeParse(parsedEvent);
          if (!validation.success) {
            debug(Debug.ERROR, 'Route schema validation failed', {
              topic,
              eventName: parsedEvent.code,
              errors: validation.error.issues
            });
            continue;
          }
        }

        await route.callback(parsedEvent as any, metadata);
      } catch (error) {
        debug(Debug.ERROR, 'Route handler error', {
          topic,
          eventName: parsedEvent.code,
          error
        });
      }
    }
  }

  async stop(): Promise<void> {
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
}
