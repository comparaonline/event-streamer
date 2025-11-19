import { SchemaType } from '@kafkajs/confluent-schema-registry';
import fg from 'fast-glob';
import jitiFactory from 'jiti';
import pLimit from 'p-limit';
import * as path from 'path';
import { z } from 'zod';
import { getSubjectName } from '../helpers';
import { SchemaRegistryClient } from '../schema-registry/client';
import { zodToJsonSchema } from 'zod-to-json-schema';

interface PublishOptions {
  eventsDir: string;
  topic: string;
  registryUrl: string;
  registryAuth?: string;
  dryRun?: boolean;
  force?: boolean;

  // new:
  include?: string[];
  exclude?: string[];
  allowIndex?: boolean;
  concurrency?: number;
  verbose?: boolean;
  bail?: boolean;
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

function defaultIncludeGlobs(): string[] {
  // only “*.schema.*” by default
  return ['**/*.schema.{ts,js,mjs,cjs}'];
}

function defaultExcludeGlobs(allowIndex: boolean | undefined): string[] {
  const base = [
    '**/{__tests__,__mocks__,__fixtures__}/**',
    '**/*.{test,spec}.*',
    '**/*.d.ts',
  ];
  return allowIndex ? base : base.concat(['**/index.*']);
}

async function resolveFilePaths(root: string, include?: string[], exclude?: string[], allowIndex?: boolean): Promise<string[]> {
  const includes = include && include.length > 0 ? include : defaultIncludeGlobs();
  const ignores = [
    ...defaultExcludeGlobs(allowIndex),
    ...(exclude ?? []),
  ];
  const entries = await fg(includes, {
    cwd: root,
    absolute: true,
    onlyFiles: true,
    followSymbolicLinks: true,
    ignore: ignores,
  });
  return entries;
}

const jiti = jitiFactory(__filename, { interopDefault: true });

async function _loadFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const absolutePath = path.resolve(filePath);
    // jiti is sync; wrap to keep signature
    const mod = jiti(absolutePath);
    return Promise.resolve(mod);
  } catch (error) {
    throw new Error(`Failed to load schema file ${filePath}: ${error}`);
  }
}

function isZodSchema(value: unknown): value is z.ZodSchema {
  return !!value && typeof value === 'object' && typeof (value as { safeParse?: unknown }).safeParse === 'function';
}

function _findZodSchemas(moduleExports: Record<string, unknown>, verbose = false): Record<string, z.ZodSchema> {
  const schemas: Record<string, z.ZodSchema> = {};
  if (verbose) console.log(`📦 Exports:`, Object.keys(moduleExports));

  // allow explicit aggregator export: export const schemas = { FooSchema, BarSchema }
  const aggregator = moduleExports.schemas;
  if (aggregator && typeof aggregator === 'object') {
    for (const [k, v] of Object.entries(aggregator as Record<string, unknown>)) {
      if (isZodSchema(v)) schemas[k] = v as z.ZodSchema;
    }
  }

  for (const [key, value] of Object.entries(moduleExports)) {
    if (isZodSchema(value)) {
      schemas[key] = value as z.ZodSchema;
    }
  }

  if (verbose) console.log(`📋 Found ${Object.keys(schemas).length} Zod schemas:`, Object.keys(schemas));
  return schemas;
}

async function loadSchemaFile(filePath: string, options: PublishOptions): Promise<SchemaFile | null> {
  const moduleExports = await _loadFile(filePath);
  const schemas = _findZodSchemas(moduleExports, !!options.verbose);

  if (Object.keys(schemas).length === 0) {
    if (options.verbose) console.log('   (no Zod schemas exported, skipping)');
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
    const schemaFile = await loadSchemaFile(filePath, options);
    if (!schemaFile) {
      return [];
    }

    if (options.verbose) console.log(`📄 Processing ${schemaFile.fileName}...`);

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
  const files = await resolveFilePaths(options.eventsDir, options.include, options.exclude, options.allowIndex);
  if (files.length === 0) {
    throw new Error(`No schema files found. Searched in ${options.eventsDir} with includes=${(options.include||['<default>']).join(', ')} excludes=${(options.exclude||['<default>']).join(', ')}`);
  }

  if (options.verbose) {
    console.log(`📁 Candidate files: ${files.length}`);
    files.forEach((f) => console.log(`  • ${f}`));
  }

  const limit = pLimit(Math.max(1, options.concurrency ?? 4));
  const allProcessed: Array<{ subject: string; schemaName: string; file: string }> = [];
  const errors: Array<{ file: string; error: unknown }> = [];

  await Promise.all(
    files.map((filePath) =>
      limit(async () => {
        try {
          const processed = await _processSchemaFile(filePath, options, client);
          allProcessed.push(...processed);
        } catch (e) {
          errors.push({ file: filePath, error: e });
          console.error(`❌ Error processing ${filePath}:`, e instanceof Error ? e.message : e);
          if (options.bail) throw e;
        }
      })
    )
  );

  console.log(`\n📊 Summary:`);
  console.log(`   Files processed: ${files.length}`);
  console.log(`   Schemas processed: ${allProcessed.length}`);
  if (errors.length > 0) {
    console.log(`   Files failed: ${errors.length}`);
  }
  if (options.verbose && allProcessed.length > 0) {
    console.log(`\n📋 Processed schemas:`);
    for (const { subject, schemaName, file } of allProcessed) {
      console.log(`   ${subject} (${schemaName} from ${file})`);
    }
  }
}
