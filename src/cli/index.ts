#!/usr/bin/env node

import { Command } from 'commander';
import { publishSchemas } from './publish';
import { validateSchema } from './validate';
import { setConfig } from '../config';

// Initialize the event streamer config for the CLI
setConfig({ host: 'cli' });

const program = new Command();

program
  .name('event-streamer-cli')
  .description('CLI toolkit for CompareOnline event-streamer schema management')
  .version(require('../../package.json').version);

program
  .command('publish')
  .description('Publish event schemas to Confluent Schema Registry')
  .option('--events-dir <path>', 'Directory containing event schema files', './src/events')
  .option('--topic <name>', 'Topic name for schema subjects (required)')
  .option('--registry-url <url>', 'Schema registry URL (required)')
  .option('--registry-auth <user:password>', 'Registry authentication credentials')
  .option('--dry-run', 'Show what would be published without actually doing it')
  .option('--force', 'Force update existing schemas (use with caution)')
  .action(async (options) => {
    try {
      if (!options.registryUrl) {
        console.error('❌ Registry URL is required. Use --registry-url option.');
        process.exit(1);
      }

      if (!options.topic) {
        console.error('❌ Topic name is required. Use --topic option.');
        console.error('   Example: --topic orders (will create subjects like "orders-user-event")');
        process.exit(1);
      }

      await publishSchemas(options);
      console.log('✅ Schema publishing completed');
    } catch (error) {
      console.error('❌ Failed to publish schemas:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('validate <schema-file>')
  .description('Validate an event schema file')
  .option('--base-event-validation', 'Validate that schema extends BaseEventSchema', true)
  .action(async (schemaFile, options) => {
    try {
      await validateSchema(schemaFile, options);
      console.log(`✅ Schema ${schemaFile} is valid`);
    } catch (error) {
      console.error('❌ Schema validation failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize event schemas structure in current project')
  .option('--service-name <name>', 'Service name for schema organization')
  .action(async (options) => {
    try {
      const { initializeEventSchemas } = await import('./init');
      await initializeEventSchemas(options);
      console.log('✅ Event schemas structure initialized');
    } catch (error) {
      console.error('❌ Failed to initialize schemas:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('generate-example <event-name>')
  .description('Generate example event schema file')
  .option('--output-dir <path>', 'Output directory for the generated schema', './src/events')
  .option('--service-name <name>', 'Service name for the schema')
  .action(async (eventName, options) => {
    try {
      const { generateExampleSchema } = await import('./generate');
      await generateExampleSchema(eventName, options);
      console.log(`✅ Example schema generated for ${eventName}`);
    } catch (error) {
      console.error('❌ Failed to generate example:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Only run if this file is executed directly
if (require.main === module) {
  program.parse();
}

export { program };
