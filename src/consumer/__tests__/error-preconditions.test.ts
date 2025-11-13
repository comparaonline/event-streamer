import { describe, it, expect } from 'vitest';
import { setConfig } from '../../config';
import { SchemaRegistryConsumerRouter } from '../schema-registry-consumer';

/**
 * DLQ preconditions unit tests
 * - DEAD_LETTER requires Schema Registry configured and producer.useSchemaRegistry=true
 */
describe('SchemaRegistryConsumerRouter DLQ preconditions', () => {
  const BASE = {
    host: 'test-kafka:9092',
    consumer: { groupId: 'g' },
    onlyTesting: true,
  } as const;

  it('throws when errorStrategy=DEAD_LETTER and missing config.schemaRegistry', () => {
    setConfig({
      ...BASE,
      // schemaRegistry: missing on purpose
      producer: { useSchemaRegistry: true },
    } as any);

    expect(
      () => new SchemaRegistryConsumerRouter({ errorStrategy: 'DEAD_LETTER', deadLetterTopic: 'dlq' })
    ).toThrow(
      'DEAD_LETTER errorStrategy requires Schema Registry (config.schemaRegistry) and producer.useSchemaRegistry=true'
    );
  });

  it('throws when errorStrategy=DEAD_LETTER and producer.useSchemaRegistry is falsy', () => {
    setConfig({
      ...BASE,
      schemaRegistry: { url: 'http://schema-registry:8081' },
      producer: { useSchemaRegistry: false },
    } as any);

    expect(
      () => new SchemaRegistryConsumerRouter({ errorStrategy: 'DEAD_LETTER', deadLetterTopic: 'dlq' })
    ).toThrow(
      'DEAD_LETTER errorStrategy requires Schema Registry (config.schemaRegistry) and producer.useSchemaRegistry=true'
    );
  });

  it('does not throw when both schemaRegistry and producer.useSchemaRegistry=true are set', () => {
    setConfig({
      ...BASE,
      schemaRegistry: { url: 'http://schema-registry:8081' },
      producer: { useSchemaRegistry: true },
    } as any);

    expect(
      () => new SchemaRegistryConsumerRouter({ errorStrategy: 'DEAD_LETTER', deadLetterTopic: 'dlq' })
    ).not.toThrow();
  });
});
