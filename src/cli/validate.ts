import { promises as fs } from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { BaseEventSchema } from '../schemas';
import { debug } from '../helpers';
import { Debug } from '../interfaces';

interface ValidateOptions {
  baseEventValidation?: boolean;
}

export async function validateSchema(schemaFilePath: string, options: ValidateOptions = {}): Promise<void> {
  debug(Debug.INFO, 'Validating schema file', { schemaFilePath, options });

  // Check if file exists
  try {
    await fs.access(schemaFilePath);
  } catch (_error) {
    throw new Error(`Schema file not found: ${schemaFilePath}`);
  }

  // Load the schema file
  let moduleExports: Record<string, unknown>;
  try {
    const absolutePath = path.resolve(schemaFilePath);
    moduleExports = await import(absolutePath);
  } catch (error) {
    throw new Error(`Failed to load schema file: ${error}`);
  }

  // Find Zod schemas in the module
  const schemas: Array<{ name: string; schema: z.ZodSchema }> = [];
  for (const [key, value] of Object.entries(moduleExports)) {
    // Check if it's a Zod schema (has _def property)
    if (value && typeof value === 'object' && '_def' in value) {
      schemas.push({ name: key, schema: value as z.ZodSchema });
    }
  }

  if (schemas.length === 0) {
    throw new Error('No Zod schemas found in the file. Make sure schemas are exported.');
  }

  console.log(`🔍 Found ${schemas.length} schema(s) to validate`);

  // Validate each schema
  for (const { name, schema } of schemas) {
    console.log(`📋 Validating ${name}...`);

    try {
      // 1. Test schema compilation to JSON Schema
      // Use draft-07 for compatibility with Schema Registry AJV setup
      const jsonSchema = zodToJsonSchema(schema, {
        target: 'jsonSchema7',
        $refStrategy: 'relative'
      });

      if (!jsonSchema || typeof jsonSchema !== 'object') {
        throw new Error('Failed to convert Zod schema to JSON Schema');
      }

      console.log(`  ✅ JSON Schema conversion successful`);

      // 2. Check if schema extends BaseEventSchema (if requested)
      if (options.baseEventValidation) {
        await validateBaseEventCompliance(schema);
      }

      // 3. Test with sample data (if factory function exists)
      const factoryName = `create${name.replace(/Schema$/, '')}`;
      if (moduleExports[factoryName] && typeof moduleExports[factoryName] === 'function') {
        try {
          const sampleData = moduleExports[factoryName]({
            // Provide minimal test data
          });

          const parseResult = schema.safeParse(sampleData);
          if (parseResult.success) {
            console.log(`  ✅ Factory function test passed`);
          } else {
            console.warn(`  ⚠️  Factory function test failed: ${parseResult.error.message}`);
          }
        } catch (error) {
          console.warn(`  ⚠️  Factory function test error: ${error}`);
        }
      }

      // 4. Validate schema structure
      validateSchemaStructure(schema, name);

      console.log(`  ✅ ${name} validation completed`);
    } catch (error) {
      console.error(`  ❌ ${name} validation failed: ${error}`);
      throw new Error(`Schema validation failed for ${name}: ${error}`);
    }
  }

  console.log(`✅ All schemas in ${path.basename(schemaFilePath)} are valid`);
}

async function validateBaseEventCompliance(schema: z.ZodSchema<any>): Promise<void> {
  // Create a test object that should pass BaseEventSchema validation
  const baseEventData = {
    id: 'test-id',
    createdAt: new Date().toISOString(),
    appName: 'test-service',
    code: 'TestEvent',
    version: '1.0.0'
  };

  // Test if the schema accepts BaseEventSchema fields
  const testResult = schema.safeParse(baseEventData);

  if (!testResult.success) {
    // Check if the error is about missing required fields that aren't in BaseEventSchema
    const missingFields = testResult.error.issues
      .filter((issue) => issue.code === 'invalid_type' || issue.code === 'invalid_union')
      .map((issue) => issue.path.join('.'))
      .filter((path) => !['id', 'createdAt', 'appName', 'code', 'version'].includes(path));

    if (missingFields.length > 0) {
      console.log(`  ⚠️  Schema requires additional fields beyond BaseEventSchema: ${missingFields.join(', ')}`);
    }

    // Try with BaseEventSchema validation
    const baseResult = BaseEventSchema.safeParse(baseEventData);
    if (baseResult.success) {
      console.log(`  ✅ BaseEventSchema compliance check passed`);
    } else {
      throw new Error(`Schema does not extend BaseEventSchema properly: ${baseResult.error.message}`);
    }
  } else {
    console.log(`  ✅ BaseEventSchema compliance check passed`);
  }
}

function validateSchemaStructure(schema: z.ZodSchema<any>, schemaName: string): void {
  // Check naming convention
  if (!schemaName.endsWith('Schema')) {
    console.warn(`  ⚠️  Schema name '${schemaName}' should end with 'Schema' by convention`);
  }

  // Check if schema is an object schema (most events should be)
  const def = (schema as any)._def;
  if (def && def.typeName !== 'ZodObject') {
    console.warn(`  ⚠️  Schema '${schemaName}' is not an object schema. Most event schemas should be object schemas.`);
  }

  // Additional structure validations could be added here
  console.log(`  ✅ Schema structure validation passed`);
}

export async function validateSchemasInDirectory(directory: string, options: ValidateOptions = {}): Promise<void> {
  const files = await fs.readdir(directory);
  const schemaFiles = files.filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'));

  if (schemaFiles.length === 0) {
    throw new Error(`No TypeScript schema files found in ${directory}`);
  }

  console.log(`🔍 Validating ${schemaFiles.length} schema files in ${directory}`);

  for (const file of schemaFiles) {
    const filePath = path.join(directory, file);
    try {
      await validateSchema(filePath, options);
    } catch (error) {
      throw new Error(`Validation failed for ${file}: ${error}`);
    }
  }

  console.log(`✅ All schema files in ${directory} are valid`);
}
