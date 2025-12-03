import { getConfig } from '../config';
import type { Config } from '../interfaces';
import { SchemaRegistryClient } from '../schema-registry/client';
import { getSubjectName } from '../helpers';

export class SchemaRegistryProducer {
  private readonly config: Config;
  private readonly client: SchemaRegistryClient;

  constructor(config?: Config) {
    this.config = config ?? getConfig();
    if (this.config.producer?.useSchemaRegistry !== true) {
      throw new Error('SchemaRegistryProducer requires config.producer.useSchemaRegistry = true');
    }
    if (!this.config.schemaRegistry?.url) {
      throw new Error('SchemaRegistryProducer requires config.schemaRegistry.url');
    }
    this.client = new SchemaRegistryClient(this.config.schemaRegistry);
  }

  async send(params: { topic: string; schemaName: string; data: unknown; headers?: Record<string, string> }): Promise<void> {
    const subject = getSubjectName(params.topic, params.schemaName);
    // PR2 minimal: ensure encoding works and do not affect legacy flows.
    // Integrations with Kafka producer can be added in PR3 tests if needed.
    await this.client.encode(subject, params.data);
    // Intentionally no Kafka send to keep PR2 additive and isolated.
  }
}
