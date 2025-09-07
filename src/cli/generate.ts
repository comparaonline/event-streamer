import { promises as fs } from 'fs';
import * as path from 'path';
import { debug } from '../helpers';
import { Debug } from '../interfaces';

interface GenerateOptions {
  outputDir: string;
  serviceName?: string;
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function generateEventTemplate(eventName: string, serviceName?: string): string {
  const pascalName = toPascalCase(eventName);
  const kebabName = toKebabCase(eventName);

  return `import { z } from 'zod';
import { randomUUID } from 'crypto';
import { BaseEventSchema } from '@comparaonline/event-streamer';

/**
 * Schema for ${pascalName} event
 * 
 * This event is triggered when...
 * 
 * @example
 * const event = create${pascalName}({
 *   data: {
 *     // Add your event data here
 *   },
 * });
 */
export const ${pascalName}Schema = BaseEventSchema.extend({
  // Define your event-specific fields here
  data: z.object({
    // Example field - replace with your actual data structure
    id: z.string().uuid().describe('Unique identifier'),
    name: z.string().min(1).describe('Name field'),
    timestamp: z.string().datetime().optional().describe('Optional timestamp'),
  }),
  
  // Override version if needed
  version: z.string().default('1.0.0'),
});

export type ${pascalName} = z.infer<typeof ${pascalName}Schema>;

/**
 * Factory function to create ${pascalName} events with auto-generated fields
 */
export function create${pascalName}(
  data: Omit<${pascalName}, 'id' | 'createdAt' | 'code' | 'appName'> & 
       Partial<Pick<${pascalName}, 'id' | 'createdAt' | 'appName'>>
): ${pascalName} {
  return {
    id: data.id || randomUUID(),
    createdAt: data.createdAt || new Date().toISOString(),
    code: '${pascalName}',
    appName: data.appName || process.env.SERVICE_NAME${serviceName ? ` || '${serviceName}'` : ''} || 'unknown-service',
    version: '1.0.0',
    ...data,
  };
}

/**
 * Example usage:
 * 
 * import { ${pascalName}Schema, create${pascalName} } from './events/${kebabName}';
 * import { SchemaRegistryProducer } from '@comparaonline/event-streamer';
 * 
 * const producer = new SchemaRegistryProducer();
 * const event = create${pascalName}({
 *   data: {
 *     id: '123e4567-e89b-12d3-a456-426614174000',
 *     name: 'Example Name',
 *   },
 * });
 * 
 * await producer.emitWithSchema({
 *   topic: '${kebabName}',
 *   eventName: '${pascalName}',
 *   data: event,
 *   schema: ${pascalName}Schema,
 * });
 */
`;
}

export async function generateExampleSchema(eventName: string, options: GenerateOptions): Promise<void> {
  debug(Debug.INFO, 'Generating example schema', { eventName, options });

  const pascalName = toPascalCase(eventName);
  const kebabName = toKebabCase(eventName);
  const fileName = `${kebabName}.ts`;
  const outputPath = path.resolve(options.outputDir, fileName);

  try {
    // Ensure output directory exists
    await fs.mkdir(options.outputDir, { recursive: true });

    // Check if file already exists
    try {
      await fs.access(outputPath);
      console.log(`⚠️  File already exists: ${outputPath}`);
      console.log(`   Use a different name or delete the existing file to regenerate.`);
      return;
    } catch {
      // File doesn't exist, continue
    }

    // Generate the schema content
    const content = generateEventTemplate(eventName, options.serviceName);

    // Write the file
    await fs.writeFile(outputPath, content);

    console.log(`✅ Generated schema file: ${outputPath}`);
    console.log(`   Schema name: ${pascalName}Schema`);
    console.log(`   Factory function: create${pascalName}()`);
    console.log(`   Suggested topic: ${kebabName}`);

    // Provide usage hints
    console.log(`\n💡 Next steps:`);
    console.log(`   1. Edit ${fileName} to match your actual event structure`);
    console.log(`   2. Validate the schema: yarn event-streamer-cli validate ${outputPath}`);
    console.log(`   3. Publish to registry: yarn event-streamer-cli publish --events-dir ${options.outputDir}`);

    debug(Debug.INFO, 'Schema generation completed', { outputPath });
  } catch (error) {
    debug(Debug.ERROR, 'Failed to generate schema', { eventName, error });
    throw new Error(`Failed to generate schema for ${eventName}: ${error}`);
  }
}
