import { promises as fs } from 'fs';
import * as path from 'path';
import { SchemaRegistryClient } from '../schema-registry/client';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { debug } from '../helpers';
import { Debug } from '../interfaces';

interface PublishOptions {
  eventsDir: string;
  registryUrl: string;
  registryAuth?: string;
  dryRun?: boolean;
  force?: boolean;
}

interface SchemaFile {
  filePath: string;
  fileName: string;
  exports: Record<string, any>;
}

function parseAuth(authString: string): { username: string; password: string } {
  const [username, password] = authString.split(':');
  if (!username || !password) {
    throw new Error('Authentication must be in format "username:password"');
  }
  return { username, password };
}

export function createSchemaRegistryClient(options: PublishOptions): SchemaRegistryClient {
  const config: any = {
    url: options.registryUrl
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
        // Recursively search subdirectories
        const subFiles = await findSchemaFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }

    return files;
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      throw new Error(`Events directory not found: ${eventsDir}`);
    }
    throw error;
  }
}

async function loadSchemaFile(filePath: string): Promise<SchemaFile | null> {
  try {
    // Use dynamic import to load TypeScript files
    // Note: This requires the files to be compiled first
    const absolutePath = path.resolve(filePath);
    const moduleExports = await import(absolutePath);

    const fileName = path.basename(filePath, '.ts');

    // Find Zod schemas in the module
    const schemas: Record<string, any> = {};
    for (const [key, value] of Object.entries(moduleExports)) {
      // Check if it's a Zod schema (has _def property)
      if (value && typeof value === 'object' && '_def' in value) {
        schemas[key] = value;
      }
    }

    if (Object.keys(schemas).length === 0) {
      debug(Debug.WARN, 'No Zod schemas found in file', { filePath });
      return null;
    }

    return {
      filePath,
      fileName,
      exports: schemas
    };
  } catch (error) {
    debug(Debug.ERROR, 'Failed to load schema file', { filePath, error });
    throw new Error(`Failed to load schema file ${filePath}: ${error}`);
  }
}

function getSubjectName(schemaName: string): string {
  // Remove 'Schema' suffix if present
  const baseName = schemaName.replace(/Schema$/, '');

  // Convert to kebab-case and add -value suffix
  const kebabName = baseName
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');

  return `${kebabName}-value`;
}

async function publishSchema(client: SchemaRegistryClient, subject: string, schema: any, options: PublishOptions): Promise<void> {
  try {
    // Convert Zod schema to JSON Schema
    const jsonSchema = zodToJsonSchema(schema, {
      target: 'jsonSchema2019-09',
      $refStrategy: 'relative'
    });

    const schemaString = JSON.stringify(jsonSchema, null, 2);

    if (options.dryRun) {
      console.log(`[DRY RUN] Would publish schema for subject: ${subject}`);
      console.log('Schema:', schemaString);
      return;
    }

    // Check if schema already exists
    let shouldPublish = true;
    try {
      const existingSchema = await client.getLatestSchemaForProducer(subject);
      if (existingSchema.schema === schemaString) {
        console.log(`⏭️  Schema for ${subject} is already up to date`);
        return;
      }

      if (!options.force) {
        console.log(`⚠️  Schema for ${subject} exists but differs. Use --force to update.`);
        return;
      }
    } catch (error) {
      // Schema doesn't exist, which is fine
      shouldPublish = true;
    }

    if (shouldPublish) {
      // Register the schema
      await registerSchemaToRegistry(client, subject, schemaString);
      console.log(`✅ Published schema for subject: ${subject}`);
    }
  } catch (error) {
    debug(Debug.ERROR, 'Failed to publish schema', { subject, error });
    throw new Error(`Failed to publish schema for ${subject}: ${error}`);
  }
}

export async function registerSchemaToRegistry(client: SchemaRegistryClient, subject: string, schemaString: string): Promise<void> {
  // Use the underlying registry client
  const registry = (client as any).registry;
  await registry.register(subject, {
    type: 'JSON',
    schema: schemaString
  });
}

export async function publishSchemas(options: PublishOptions): Promise<void> {
  debug(Debug.INFO, 'Starting schema publishing', options);

  // Create Schema Registry client
  const client = createSchemaRegistryClient(options);

  // Find all schema files
  const schemaFilePaths = await findSchemaFiles(options.eventsDir);

  if (schemaFilePaths.length === 0) {
    throw new Error(`No TypeScript files found in ${options.eventsDir}`);
  }

  console.log(`📁 Found ${schemaFilePaths.length} potential schema files`);

  // Load and process each file
  const processedSchemas: Array<{ subject: string; schemaName: string; file: string }> = [];

  for (const filePath of schemaFilePaths) {
    try {
      const schemaFile = await loadSchemaFile(filePath);

      if (!schemaFile) {
        continue; // Skip files without schemas
      }

      console.log(`📄 Processing ${schemaFile.fileName}...`);

      // Process each schema in the file
      for (const [schemaName, schema] of Object.entries(schemaFile.exports)) {
        const subject = getSubjectName(schemaName);

        await publishSchema(client, subject, schema, options);

        processedSchemas.push({
          subject,
          schemaName,
          file: schemaFile.fileName
        });
      }
    } catch (error) {
      console.error(`❌ Error processing ${filePath}:`, error);
      if (!options.force) {
        throw error;
      }
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Files processed: ${schemaFilePaths.length}`);
  console.log(`   Schemas processed: ${processedSchemas.length}`);

  if (processedSchemas.length > 0) {
    console.log(`\n📋 Processed schemas:`);
    for (const { subject, schemaName, file } of processedSchemas) {
      console.log(`   ${subject} (${schemaName} from ${file})`);
    }
  }

  debug(Debug.INFO, 'Schema publishing completed', { processedCount: processedSchemas.length });
}
