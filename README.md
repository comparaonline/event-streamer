# Event Streamer

## Description

Event Streamer is a library for connecting microservices using Kafka, with first-class support for Confluent Schema Registry.

This is a wrapper around [kafka-js](https://github.com/tulios/kafkajs) and [@kafkajs/confluent-schema-registry](https://github.com/kafkajs/confluent-schema-registry), simplifying connections, error handling, and schema management.

## Installation

```bash
pnpm add @comparaonline/event-streamer
```

## Initialization

Before using the library, you must initialize it with `setConfig`.

```ts
import { setConfig } from '@comparaonline/event-streamer';

setConfig({
  host: 'kafka:9092', // Kafka broker addresses
  consumer: {
    groupId: 'my-consumer-group'
  },
  schemaRegistry: {
    url: 'http://schema-registry:8081'
  }
});
```

### Configuration Options

| Key              | Type                                              | Description                                                                                             | Default                  |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------ |
| `host`           | `string`                                          | **Required.** Comma-separated list of Kafka broker hosts.                                               | -                        |
| `appName`        | `string`                                          | The name of your application, used for logging and metadata.                                            | `unknown`                |
| `consumer`       | `object`                                          | Consumer-specific settings. `groupId` is required to run a consumer.                                    | -                        |
| `producer`       | `object`                                          | Producer-specific settings.                                                                             | -                        |
| `schemaRegistry` | `object`                                          | Schema Registry settings. `url` is required to use the Schema Registry producer/consumer.               | -                        |
| `onlyTesting`    | `boolean`                                         | Set to `true` in a test environment to disable real Kafka connections and enable mock functionalities. | `false`                  |


---

## CLI for Schema Management

The library includes a CLI for managing your Zod schemas with the Schema Registry.

### 1. Define Your Schemas

Create schema definition files (e.g., `./events/user-registered.schema.ts`). Schemas must be defined with `zod` and extend the `BaseEventSchema` to ensure they have the required baseline properties. It's a best practice to include a factory function to easily create valid event objects.

```ts
// ./events/user-registered.schema.ts
import { z } from 'zod';
import { BaseEventSchema, createBaseEvent } from '@comparaonline/event-streamer';

// Define the schema for your event
export const UserRegisteredSchema = BaseEventSchema.extend({
  userId: z.string().uuid(),
  email: z.string().email(),
});

// Export the inferred type for type safety
export type UserRegistered = z.infer<typeof UserRegisteredSchema>;

// Create a factory function to build the event
export function createUserRegistered(data: Partial<UserRegistered>): UserRegistered {
  return {
    ...createBaseEvent({ code: 'UserRegistered' }), // Provides createdAt
    appName: 'my-service-name',
    ...data,
  } as UserRegistered;
}
```

### 2. CLI Commands

- **`init`**: Scaffolds a new event schema structure in your project by creating a `./src/events` directory with an example schema and a README.
  - **Usage**: `pnpm event-streamer-cli init`

- **`generate-example <event-code>`**: Creates a new example schema file to get you started.
  - **Usage**: `pnpm event-streamer-cli generate-example user-created`

- **`validate <schema-file-path>`**: Validates a single Zod schema file to ensure it's correctly structured.
  - **Usage**: `pnpm event-streamer-cli validate ./events/user-registered.schema.ts`

- **`publish`**: Publishes all schemas from a directory to the Schema Registry.
  - **Usage**: `pnpm event-streamer-cli publish --events-dir ./events --registry-url http://localhost:8081 --topic <topic-name>`
  - **Options**:
    - `--topic <name>`: **Required.** The topic name used to derive the schema subject (e.g., `<topic>-<event-code>`).
    - `--registry-auth <user:pass>`: For Schema Registry instances that require basic authentication.
    - `--dry-run`: Simulates the publish process without making any actual changes.
    - `--force`: Forces the registration of a new schema version even if the schema has not changed.

---

## Modern Usage (Schema Registry)

This is the recommended approach for producing and consuming events.

### Producing Events

Use the `SchemaRegistryProducer` to automatically handle schema registration, validation, and encoding.

#### Note on Singleton Behavior
The `SchemaRegistryProducer` is a **singleton**. The first time you create an instance with `new SchemaRegistryProducer()`, it will establish a persistent connection to Kafka. Every subsequent call to `new SchemaRegistryProducer()` anywhere in your application will return the *exact same instance* and reuse that connection.

You should create it once and share it or simply call `new SchemaRegistryProducer()` wherever you need it, knowing it's an efficient operation.

#### Basic Usage
Use your factory function to create the event payload. The `eventCode` and `schema` parameters are **required**.

```ts
import { SchemaRegistryProducer } from '@comparaonline/event-streamer';
import { UserRegisteredSchema, createUserRegistered } from './events/user-registered.schema';

const producer = new SchemaRegistryProducer();

async function sendUserRegistration() {
  // Use the factory function to create a complete and valid event
  const eventData = createUserRegistered({
    userId: 'some-uuid-v4',
    email: 'test@example.com',
  });

  await producer.emitWithSchema({
    topic: 'users',
    eventCode: 'UserRegistered', // **Required.** Used to derive the subject name.
    data: eventData,
    schema: UserRegisteredSchema  // **Required.** The Zod schema for validation.
  });
}
```

#### Graceful Shutdown
The singleton producer maintains an open connection to Kafka. In a long-running application (like a web server or a microservice), it's important to close this connection when the application is shutting down to prevent message loss.

You can do this by calling the `disconnect` method.

```ts
// In your application's shutdown hook
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing Kafka producer');
  const producer = new SchemaRegistryProducer(); // Gets the existing instance
  await producer.disconnect();
  process.exit(0);
});
```

### Consuming Events

Use the `SchemaRegistryConsumerRouter` to handle both Schema Registry-encoded messages and legacy JSON messages gracefully.

```ts
import { SchemaRegistryConsumerRouter } from '@comparaonline/event-streamer';
import { UserRegisteredSchema, UserRegistered } from './events/user-registered.schema';

const consumer = new SchemaRegistryConsumerRouter();

// Handler for valid messages (Schema Registry or JSON)
consumer.add({
  topic: 'users',
  eventCode: 'UserRegistered',
  schema: UserRegisteredSchema,
  handler: (data: UserRegistered, metadata) => {
    console.log('Received a valid UserRegistered event:', data);
  }
});

// Fallback handler for all other messages on the topic
consumer.addFallback({
  topic: 'users',
  handler: (data, metadata) => {
    console.warn('Received a message on the fallback handler:', data);
  }
});

consumer.start();
```

### Advanced Consumer Configuration

#### Processing Strategies and Backpressure

The `SchemaRegistryConsumerRouter` can process messages in two ways, controlled by the `strategy` option. This is critical for managing how your consumer handles high volumes of messages.

- **`strategy: 'one-by-one'`**: This is the simplest strategy. The consumer will process one message to completion before fetching the next one. It's safe and predictable but offers no concurrency.

- **`strategy: 'topic'` (Default)**: This strategy processes messages concurrently, with a separate queue for each topic. This provides much higher throughput but requires you to manage backpressure to avoid overwhelming your service with too many in-flight messages.

To control memory usage and prevent your application from crashing under heavy load, you can set limits on the size of these in-memory queues.

- **`maxMessagesPerTopic`**: A global limit for the maximum number of messages being processed concurrently for any single topic. If this limit is reached, the consumer will pause fetching new messages for that topic until some of the current messages are finished.
- **`maxMessagesPerSpecificTopic`**: An object to override the global limit for specific, named topics.

**Example Configuration:**

```ts
import { SchemaRegistryConsumerRouter } from '@comparaonline/event-streamer';

const consumer = new SchemaRegistryConsumerRouter({
  // Enable the concurrent topic strategy (this is the default)
  strategy: 'topic',

  // Set a global limit of 50 concurrent messages for any topic.
  maxMessagesPerTopic: 50,

  // Override the global limit for specific topics.
  maxMessagesPerSpecificTopic: {
    // This is a high-volume topic, so we use a smaller queue.
    'real-time-logs': 20,
    // This topic has lightweight messages, so we can handle more.
    'user-clicks': 200,
  },

  // For new consumer groups, start reading from the beginning of the topic.
  fromBeginning: true,
});

// Routes are added as normal
consumer.add({ topic: 'real-time-logs', ... });
consumer.add({ topic: 'user-clicks', ... });
consumer.add({ topic: 'another-topic', ... }); // This will use the default limit of 50

consumer.start();
```

---

## Features

### Error Handling Strategies

Both the `SchemaRegistryConsumerRouter` and the legacy `ConsumerRouter` support strategies for handling messages that fail during processing. To enable a strategy, provide an `errorStrategy` in the consumer configuration.

#### Dead Letter Queue (DLQ)
If you want to isolate failing messages for later analysis, use the `DEAD_LETTER` strategy. This will catch any error from your handler and forward the original message, along with error details, to a specified `deadLetterTopic`.

```ts
const consumer = new SchemaRegistryConsumerRouter({
  errorStrategy: 'DEAD_LETTER',
  deadLetterTopic: 'my-service-dlq'
});
```

#### Ignore
If you want the consumer to simply log the error and move on to the next message without stopping or forwarding, use the `IGNORE` strategy.

```ts
const consumer = new SchemaRegistryConsumerRouter({
  errorStrategy: 'IGNORE'
  // No deadLetterTopic is needed
});
```

---

## Running Tests

### Prerequisites
- Docker and Docker Compose

### Setup

The integration tests require live Kafka, Zookeeper, and Schema Registry instances. A `docker-compose.yml` file is provided to easily spin up the necessary services.

1.  **Start the services:**
    ```sh
    docker-compose up -d
    ```

2.  **Run the tests:**
    - **Unit tests:** `pnpm test`
    - **Integration tests:** `pnpm test:integration`
    - **All tests:** `pnpm test:all`

3.  **Stop the services:**
    ```sh
    docker-compose down
    ```

### Testing in Your Application

When running tests for your own application, set `onlyTesting: true` in your configuration. This prevents real Kafka connections and enables mock capabilities.

```ts
// In your jest.setup.js or test file
import { setConfig } from '@comparaonline/event-streamer';

setConfig({
  host: 'fake-kafka:9092',
  consumer: { groupId: 'fake-group-id' },
  schemaRegistry: { url: 'http://fake-registry:8081' },
  onlyTesting: true
});
```

---

## Legacy Usage (Deprecated)

<details>
  <summary>Click to expand for legacy usage details.</summary>
  
  The `ConsumerRouter` and global `emit` function are still available for backward compatibility but are considered deprecated. They do not support schema registry integration.

  ### Legacy Producer

  ```ts
  import { emit } from '@comparaonline/event-streamer';

  // Note: The legacy emit function still uses `eventName` for backward compatibility.
  await emit({
    topic: 'my-topic',
    eventName: 'my-event-name',
    data: { firstName: 'John' }
  });
  ```

  ### Legacy Consumer

  ```ts
  import { ConsumerRouter } from '@comparaonline/event-streamer';

  const consumer = new ConsumerRouter();

  consumer.add('topic-a', 'eventName', (data, emit) => { 
    console.log('Handler for topic-a and eventName');
  });

  await consumer.start();
  ```
</details>

---

## TODO

- [ ] Refactor the `src/test` and `src/local-tests` directories into a unified `tests` directory with `utils` and `manual` subdirectories for better organization.

