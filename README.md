# Event Streamer

## Description

Event Streamer is a library for connecting microservices using Kafka, with first-class support for Confluent Schema Registry.

This is a wrapper around [kafka-js](https://github.com/tulios/kafkajs) and [@kafkajs/confluent-schema-registry](https://github.com/kafkajs/confluent-schema-registry), simplifying connections, error handling, and schema management.

## Installation

```bash
yarn add @comparaonline/event-streamer
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

---

## CLI for Schema Management

The library includes a CLI for managing your Zod schemas with the Schema Registry.

### 1. Define Your Schemas

Create schema definition files (e.g., `./events/user-registered.schema.ts`). Schemas must be defined with `zod` and extend the `BaseEventSchema` to ensure they have the required baseline properties.

```ts
// ./events/user-registered.schema.ts
import { z } from 'zod';
import { BaseEventSchema } from '@comparaonline/event-streamer';

// Define the schema for your event
export const UserRegisteredSchema = BaseEventSchema.extend({
  userId: z.string().uuid(),
  email: z.string().email(),
});

// Export the inferred type for type safety
export type UserRegistered = z.infer<typeof UserRegisteredSchema>;
```

### 2. CLI Commands

- **`generate-example <event-name>`**: Creates a new example schema file to get you started.
  - **Usage**: `yarn event-streamer-cli generate-example user-created`

- **`validate <schema-file-path>`**: Validates a single Zod schema file to ensure it's correctly structured.
  - **Usage**: `yarn event-streamer-cli validate ./events/user-registered.schema.ts`

- **`publish`**: Publishes all schemas from a directory to the Schema Registry.
  - **Usage**: `yarn event-streamer-cli publish --events-dir ./events --registry-url http://localhost:8081`
  - **Options**:
    - `--registry-auth <user:pass>`: For Schema Registry instances that require basic authentication.
    - `--dry-run`: Simulates the publish process without making any actual changes.

---

## Modern Usage (Schema Registry)

This is the recommended approach for producing and consuming events.

### Producing Events

Use the `SchemaRegistryProducer` to automatically handle schema registration, validation, and Avro encoding.

```ts
import { SchemaRegistryProducer } from '@comparaonline/event-streamer';
import { UserRegisteredSchema, UserRegistered } from './events/user-registered.schema';

const producer = new SchemaRegistryProducer();

async function sendUserRegistration() {
  const eventData: Partial<UserRegistered> = {
    userId: 'some-uuid-v4',
    email: 'test@example.com',
  };

  await producer.emitWithSchema({
    topic: 'users',
    eventName: 'UserRegistered', // Used to derive the subject name
    data: eventData,
    schema: UserRegisteredSchema
  });
}
```

### Consuming Events

Use the `SchemaRegistryConsumerRouter` to handle both Schema Registry-encoded messages and legacy JSON messages gracefully.

```ts
import { SchemaRegistryConsumerRouter } from '@comparaonline/event-streamer';
import { UserRegisteredSchema, UserRegistered } from './events/user-registered.schema';

const consumer = new SchemaRegistryConsumerRouter();

// Handler for valid, schema-registry encoded messages
consumer.add({
  topic: 'users',
  eventCode: 'UserRegistered',
  schema: UserRegisteredSchema,
  handler: (data: UserRegistered, metadata, emit) => {
    console.log('Received a valid UserRegistered event:', data);
  }
});

// Fallback handler for all other messages on the topic
consumer.addFallback({
  topic: 'users',
  handler: (data, metadata, emit) => {
    console.warn('Received a message on the fallback handler:', data);
    if (metadata.error) {
      console.error('Error processing message:', metadata.error);
    }
  }
});

consumer.start();
```

---

## Legacy Usage (Deprecated)

<details>
  <summary>Click to expand for legacy usage details.</summary>
  
  The `ConsumerRouter` and global `emit` function are still available for backward compatibility but are considered deprecated. They do not support schema registry integration.

  ### Legacy Producer

  ```ts
  import { emit } from '@comparaonline/event-streamer';

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

  consumer.add('topic-a', 'event-name-a', (data, emit) => { 
    console.log('Handler for topic-a and event-name-a');
  });

  await consumer.start();
  ```
</details>

---

## Testing

To run tests without connecting to a real Kafka server, set `onlyTesting: true` in your configuration. This enables mock capabilities for both producers and consumers.

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

### Example Test

```ts
import { SchemaRegistryProducer, SchemaRegistryConsumerRouter } from '@comparaonline/event-streamer';
import { UserRegisteredSchema, UserRegistered } from './events/user-registered.schema';

describe('Producer and Consumer Testing', () => {
  const producer = new SchemaRegistryProducer();
  const consumer = new SchemaRegistryConsumerRouter();

  beforeEach(() => {
    producer.clearEmittedEvents();
  });

  it('should produce an event that the consumer can process', async () => {
    const handler = jest.fn();

    consumer.add({
      topic: 'users',
      eventCode: 'UserRegistered',
      schema: UserRegisteredSchema,
      handler,
    });

    const eventData: Partial<UserRegistered> = { userId: 'test-user' };

    // 1. Emit an event
    await producer.emitWithSchema({
      topic: 'users',
      eventName: 'UserRegistered',
      data: eventData,
      schema: UserRegisteredSchema,
    });

    // 2. Get the mock event from the producer
    const emittedEvent = producer.getEmittedEvents()[0];

    // 3. Feed the mock event into the consumer
    await consumer.input(emittedEvent);

    // 4. Assert that the handler was called correctly
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'test-user' }),
      expect.any(Object), // metadata
      expect.any(Function) // emit
    );
  });
});
```
