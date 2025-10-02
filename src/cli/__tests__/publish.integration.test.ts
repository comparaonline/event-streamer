import { exec } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { SchemaRegistryClient } from '../../schema-registry/client';
import { setConfig } from '../../config';

const TEST_TIMEOUT = 60000; // 60s

describe('CLI Publish Command Integration Test', () => {
  const SCHEMA_REGISTRY_URL = process.env.SCHEMA_REGISTRY_URL || 'http://localhost:8081';
  const cliCommand = 'node build/cli/index.js publish';
  let tempDir: string;

  beforeAll(async () => {
    // Create a unique, git-ignored directory for this test run.
    const tempRoot = path.join(__dirname, 'temp-test-data');
    await fs.mkdir(tempRoot, { recursive: true });
    tempDir = await fs.mkdtemp(path.join(tempRoot, 'publish-test-'));

    // Create a dummy schema file.
    const schemaContent = `
      const { z } = require('zod');
      const { BaseEventSchema } = require('../../../../../build/schemas');
      exports.CliTestSchema = BaseEventSchema.extend({
        testId: z.string(),
      });
    `;
    await fs.writeFile(path.join(tempDir, 'cli-test.schema.js'), schemaContent);
  });

  // No afterAll hook - temp directories are git-ignored and not deleted.

  it(
    'should execute the publish command and register a schema',
    async () => {
      const topic = `cli-publish-test-${Date.now()}`;
      const command = `${cliCommand} --events-dir ${tempDir} --registry-url ${SCHEMA_REGISTRY_URL} --topic ${topic}`;

      const output = await new Promise<string>((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            return reject(new Error(`CLI execution failed: ${error.message}\n${stderr}`));
          }
          resolve(stdout);
        });
      });

      // 1. Check the CLI output
      expect(output).toContain('Found 1 potential schema files');
      expect(output).toContain('Processing cli-test.schema...');
      expect(output).toContain(`Published schema for subject: ${topic}-cli-test`);
      expect(output).toContain('Summary:');

      // 2. Verify with a NEW Schema Registry client
      const client = new SchemaRegistryClient({ url: SCHEMA_REGISTRY_URL });
      const subject = `${topic}-cli-test`;
      // @ts-ignore
      const registry = client.registry;
      const latestVersion = await registry.getLatestSchemaId(subject);
      expect(latestVersion).toBeGreaterThan(0);
    },
    TEST_TIMEOUT
  );
});
