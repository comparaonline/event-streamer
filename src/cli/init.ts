import { promises as fs } from 'fs';
import * as path from 'path';

interface InitOptions {
  serviceName?: string;
}

const DEFAULT_EVENT_TEMPLATE = `import { z } from 'zod';
import { BaseEventSchema } from '@comparaonline/event-streamer';

// Example event schema extending BaseEventSchema
export const ExampleEventSchema = BaseEventSchema.extend({
  // Add your event-specific fields here
  data: z.object({
    userId: z.string().uuid(),
    amount: z.number().positive(),
    currency: z.string().length(3),
  }),
});

export type ExampleEvent = z.infer<typeof ExampleEventSchema>;

// Factory function to create events with auto-generated fields
export function createExampleEvent(
  data: Omit<ExampleEvent, 'id' | 'createdAt' | 'code' | 'appName'>
): ExampleEvent {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    code: 'ExampleEvent',
    appName: process.env.SERVICE_NAME || 'unknown-service',
    ...data,
  };
}
`;

const README_TEMPLATE = `# Event Schemas

This directory contains event schema definitions for the service.

## Structure

- Each event type should have its own file
- Event schemas should extend \`BaseEventSchema\`
- Include factory functions for creating events
- Use TypeScript and Zod for schema definition

## Usage

\`\`\`typescript
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
\`\`\`

## CLI Commands

- \`yarn event-streamer-cli publish\`: Publish schemas to registry
- \`yarn event-streamer-cli validate <schema-file>\`: Validate a schema file
- \`yarn event-streamer-cli generate-example <event-name>\`: Generate example schema
`;

export async function initializeEventSchemas(options: InitOptions): Promise<void> {
  const eventsDir = path.resolve('./src/events');
  const exampleFile = path.join(eventsDir, 'example-event.ts');
  const readmeFile = path.join(eventsDir, 'README.md');

  try {
    // Create events directory if it doesn't exist
    await fs.mkdir(eventsDir, { recursive: true });
    console.log(`📁 Created events directory: ${eventsDir}`);

    // Create example event file if it doesn't exist
    try {
      await fs.access(exampleFile);
      console.log(`⏭️  Example event file already exists: ${exampleFile}`);
    } catch {
      await fs.writeFile(exampleFile, DEFAULT_EVENT_TEMPLATE);
      console.log(`📄 Created example event file: ${exampleFile}`);
    }

    // Create README if it doesn't exist
    try {
      await fs.access(readmeFile);
      console.log(`⏭️  README already exists: ${readmeFile}`);
    } catch {
      await fs.writeFile(readmeFile, README_TEMPLATE);
      console.log(`📄 Created README: ${readmeFile}`);
    }

    // Create package.json scripts section suggestion
    console.log(`\n💡 Suggested package.json scripts:`);
    console.log(`   "schemas:publish": "event-streamer-cli publish --events-dir ./src/events --registry-url $SCHEMA_REGISTRY_URL"`);
    console.log(`   "schemas:validate": "event-streamer-cli validate src/events/**/*.ts"`);
  } catch (error) {
    throw new Error(`Failed to initialize event schemas: ${error}`);
  }
}
