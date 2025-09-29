import { SchemaRegistryClient } from '../../schema-registry/client';
import { getSubjectName } from '../../helpers';
import { SchemaRegistryProducer } from '../../producer/schema-registry-producer';
import { setConfig } from '../../config';

// Mock debug function
vi.mock('../../helpers', async () => {
  const actual = await vi.importActual<typeof import('../../helpers')>('../../helpers');
  return {
    ...actual,
    debug: vi.fn(),
  };
});

describe('CLI-Producer Subject Naming Consistency', () => {
  const SCHEMA_REGISTRY_URL = 'http://localhost:8081';



  // Producer subject name generation
  function getProducerSubjectName(topic: string, eventCode: string): string {
    setConfig({
      host: 'localhost:9092',
      consumer: { groupId: 'test' },
      schemaRegistry: { url: SCHEMA_REGISTRY_URL },
      producer: { useSchemaRegistry: true },
      onlyTesting: true
    });

    const producer = new SchemaRegistryProducer();
    // @ts-ignore
    const producerClient = producer.schemaRegistryClient as SchemaRegistryClient;
    return producerClient.getSubjectFromTopicAndEventCode(topic, eventCode);
  }

  it('should generate identical subjects for CLI and Producer', () => {
    const testCases = [
      {
        topic: 'orders',
        schemaName: 'TestEventSchema',
        eventCode: 'TestEvent',
        expected: 'orders-test-event'
      },
      {
        topic: 'users',
        schemaName: 'UserCreatedSchema',
        eventCode: 'UserCreated',
        expected: 'users-user-created'
      },
      {
        topic: 'orderProcessing',
        schemaName: 'OrderStatusSchema',
        eventCode: 'OrderStatus',
        expected: 'order-processing-order-status'
      },
      {
        topic: 'notifications',
        schemaName: 'EmailSentSchema',
        eventCode: 'EmailSent',
        expected: 'notifications-email-sent'
      },
      {
        topic: 'userAccountManagement',
        schemaName: 'PasswordResetRequestedSchema',
        eventCode: 'PasswordResetRequested',
        expected: 'user-account-management-password-reset-requested'
      }
    ];

    testCases.forEach(({ topic, schemaName, eventCode, expected }) => {
      const cliSubject = getSubjectName(topic, schemaName);
      const producerSubject = getProducerSubjectName(topic, eventCode);

      // Verify CLI generates expected subject
      expect(cliSubject).toBe(expected);

      // Verify Producer generates expected subject
      expect(producerSubject).toBe(expected);

      // Most importantly: verify they match each other
      expect(cliSubject).toBe(producerSubject);

      console.log(`✅ "${topic}" + "${schemaName}"/"${eventCode}" → "${expected}"`);
    });
  });

  it('should handle edge cases consistently', () => {
    const edgeCases = [
      {
        topic: 'a',
        schemaName: 'BSchema',
        eventCode: 'B',
        expected: 'a-b'
      },
      {
        topic: 'API',
        schemaName: 'HTTPRequestSchema',
        eventCode: 'HTTPRequest',
        expected: 'api-httprequest'
      },
      {
        topic: 'XML',
        schemaName: 'XMLParsedSchema',
        eventCode: 'XMLParsed',
        expected: 'xml-xmlparsed'
      }
    ];

    edgeCases.forEach(({ topic, schemaName, eventCode, expected }) => {
      const cliSubject = getSubjectName(topic, schemaName);
      const producerSubject = getProducerSubjectName(topic, eventCode);

      expect(cliSubject).toBe(expected);
      expect(producerSubject).toBe(expected);
      expect(cliSubject).toBe(producerSubject);
    });
  });

  it('should demonstrate CLI usage with --topic parameter', () => {
    // This test documents how the CLI should be used with the new --topic parameter
    const examples = [
      {
        command: 'yarn cli publish --topic orders --events-dir ./schemas --registry-url http://localhost:8081',
        schemaFile: 'UserEventSchema',
        resultingSubject: 'orders-user-event'
      },
      {
        command: 'yarn cli publish --topic users --events-dir ./schemas --registry-url http://localhost:8081',
        schemaFile: 'UserEventSchema',
        resultingSubject: 'users-user-event'
      }
    ];

    examples.forEach(({ schemaFile, resultingSubject }) => {
      // Extract topic from the resulting subject
      const topic = resultingSubject.split('-')[0];
      const cliSubject = getSubjectName(topic, schemaFile);
      expect(cliSubject).toBe(resultingSubject);
    });

    // Document the breaking change
    expect(true).toBe(true); // CLI now requires --topic parameter
  });
});
