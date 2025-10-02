import { SchemaType } from '@kafkajs/confluent-schema-registry';
import { promises as fs } from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { SchemaRegistryClient } from '../schema-registry/client';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getSubjectName } from '../helpers';

interface PublishOptions {
  eventsDir: string;
  topic: string;
  registryUrl: string;
  registryAuth?: string;
  dryRun?: boolean;
  force?: boolean;
}

interface SchemaFile {
  filePath: string;
  fileName: string;
  exports: Record<string, z.ZodSchema>;
}

function parseAuth(authString: string): { username: string; password: string } {
  const [username, password] = authString.split(':');
  if (!username || !password) {
    throw new Error('Authentication must be in format "username:password"');
  }
  return { username, password };
}

export function createSchemaRegistryClient(options: PublishOptions): SchemaRegistryClient {
  const config: { url: string; auth?: { username: string; password: string } } = {
    url: options.registryUrl,
  };

  if (options.registryAuth) {
    config.auth = parseAuth(options.registryAuth);
  }

  return new SchemaRegistryClient(config);
}

async function findSchemaFiles(eventsDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(eventsDir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(eventsDir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await findSchemaFiles(fullPath)));
      } else if ((entry.name.endsWith('.ts') || entry.name.endsWith('.js')) && !entry.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
    return files;
  } catch (error) {
    if ((error as { code: string }).code === 'ENOENT') {
      throw new Error(`Events directory not found: ${eventsDir}`);
    }
    throw error;
  }
}

async function _loadFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const absolutePath = path.resolve(filePath);
    console.log(`📂 Loading schema file: ${absolutePath}`);
    return await import(absolutePath);
  } catch (error) {
    throw new Error(`Failed to load schema file ${filePath}: ${error}`);
  }
}

function _findZodSchemas(moduleExports: Record<string, unknown>): Record<string, z.ZodSchema> {
  const schemas: Record<string, z.ZodSchema> = {};
  console.log(`📦 Module exports:`, Object.keys(moduleExports));

  for (const [key, value] of Object.entries(moduleExports)) {
    const isZodSchema = value && typeof value === 'object' && '_def' in value;
    console.log(`🔍 Checking export "${key}":`, typeof value, isZodSchema ? 'IS ZOD SCHEMA' : 'not a zod schema');
    if (isZodSchema) {
      schemas[key] = value as z.ZodSchema;
    }
  }

  console.log(`📋 Found ${Object.keys(schemas).length} Zod schemas:`, Object.keys(schemas));
  return schemas;
}

async function loadSchemaFile(filePath: string): Promise<SchemaFile | null> {
  const moduleExports = await _loadFile(filePath);
  const schemas = _findZodSchemas(moduleExports);

  if (Object.keys(schemas).length === 0) {
    return null;
  }

  return {
    filePath,
    fileName: path.basename(filePath, path.extname(filePath)),
    exports: schemas,
  };
}

async function publishSchema(client: SchemaRegistryClient, subject: string, schema: z.ZodSchema<unknown>, options: PublishOptions): Promise<void> {
  try {
    const jsonSchema = zodToJsonSchema(schema, {
      target: 'jsonSchema7',
      $refStrategy: 'relative',
    });
    const schemaString = JSON.stringify(jsonSchema, null, 2);

    if (options.dryRun) {
      console.log(`[DRY RUN] Would publish schema for subject: ${subject}`);
      console.log('Schema:', schemaString);
      return;
    }

    try {
      const existingId = await client.getRegistryIdBySchema(subject, schemaString);
      console.log(`⏭️  Schema for ${subject} is already up to date (ID: ${existingId})`);
      return;
    } catch (_error) {
      // Schema not found, proceed to publish
    }

    await registerSchemaToRegistry(client, subject, schemaString);
    console.log(`✅ Published schema for subject: ${subject}`);
  } catch (error) {
    throw new Error(`Failed to publish schema for ${subject}: ${error}`);
  }
}

export async function registerSchemaToRegistry(client: SchemaRegistryClient, subject: string, schemaString: string): Promise<void> {
  await client.registry.register(
    {
      type: SchemaType.JSON,
      schema: schemaString,
    },
    {
      subject: subject,
    }
  );
}

async function _processSchemaFile(filePath: string, options: PublishOptions, client: SchemaRegistryClient): Promise<Array<{ subject: string; schemaName: string; file: string }>> {
  const processedInFile: Array<{ subject: string; schemaName: string; file: string }> = [];
  try {
    const schemaFile = await loadSchemaFile(filePath);
    if (!schemaFile) {
      return [];
    }

    console.log(`📄 Processing ${schemaFile.fileName}...`);

    for (const [schemaName, schema] of Object.entries(schemaFile.exports)) {
      const subject = getSubjectName(options.topic, schemaName);
      await publishSchema(client, subject, schema, options);
      processedInFile.push({
        subject,
        schemaName,
        file: schemaFile.fileName,
      });
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error);
    if (!options.force) {
      throw error;
    }
  }
  return processedInFile;
}

export async function publishSchemas(options: PublishOptions): Promise<void> {
  const client = createSchemaRegistryClient(options);
  const schemaFilePaths = await findSchemaFiles(options.eventsDir);

  if (schemaFilePaths.length === 0) {
    throw new Error(`No TypeScript files found in ${options.eventsDir}`);
  }

  console.log(`📁 Found ${schemaFilePaths.length} potential schema files`);

  const allProcessedSchemas: Array<{ subject: string; schemaName: string; file: string }> = [];

  for (const filePath of schemaFilePaths) {
    const processed = await _processSchemaFile(filePath, options, client);
    allProcessedSchemas.push(...processed);
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Files processed: ${schemaFilePaths.length}`);
  console.log(`   Schemas processed: ${allProcessedSchemas.length}`);

  if (allProcessedSchemas.length > 0) {
    console.log(`\n📋 Processed schemas:`);
    for (const { subject, schemaName, file } of allProcessedSchemas) {
      console.log(`   ${subject} (${schemaName} from ${file})`);
    }
  }
}
