# Event Schemas

This directory contains event schema definitions for the service.

## Structure

- Each event type should have its own file
- Event schemas should extend `BaseEventSchema`
- Include factory functions for creating events
- Use TypeScript and Zod for schema definition

## Usage

```typescript
import { ExampleEventSchema, createExampleEvent } from './events/example-event';

// Create an event
const event = createExampleEvent({
  data: {
    userId: '123e4567-e89b-12d3-a456-426614174000',
    amount: 100.50,
    currency: 'USD',
  },
});

// Publish using Schema Registry producer
await producer.emitWithSchema({
  topic: 'user-actions',
  eventName: 'ExampleEvent',
  data: event,
  schema: ExampleEventSchema,
});
```

## CLI Commands

- `yarn event-streamer-cli publish`: Publish schemas to registry
- `yarn event-streamer-cli validate <schema-file>`: Validate a schema file
- `yarn event-streamer-cli generate-example <event-name>`: Generate example schema
