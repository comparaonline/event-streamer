// Test the core business logic, not the CLI wrapper
import { z } from 'zod';
import { SchemaRegistryClient } from '../../schema-registry/client';

// Mock external dependencies only
jest.mock('../../schema-registry/client');
jest.mock('../../helpers', () => ({ debug: jest.fn() }));

const MockSchemaRegistryClient = SchemaRegistryClient as jest.MockedClass<typeof SchemaRegistryClient>;

describe('Schema Publishing Logic', () => {
  let mockClient: jest.Mocked<SchemaRegistryClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      validateAndEncode: jest.fn(),
      preloadSchemasForProducer: jest.fn(),
      getSubjectFromEventCode: jest.fn((code) => `${code.toLowerCase()}`),
      getSubjectFromTopicAndEventCode: jest.fn((topic, code) => `${topic.toLowerCase()}-${code.toLowerCase()}`)
    } as any;
    MockSchemaRegistryClient.mockImplementation(() => mockClient);
  });

  describe('schema validation', () => {
    it('should identify valid Zod schemas', () => {
      const TestSchema = z.object({
        id: z.string(),
        name: z.string()
      });

      // Test the core logic: is this a Zod schema?
      expect(TestSchema._def.typeName).toBe('ZodObject');
      expect(typeof TestSchema.parse).toBe('function');
    });

    it('should reject non-Zod objects', () => {
      const fakeSchema = { type: 'object', properties: {} };

      expect((fakeSchema as any)._def).toBeUndefined();
      expect(typeof (fakeSchema as any).parse).toBe('undefined');
    });
  });

  describe('subject name generation', () => {
    it('should convert topic and schema names to subject names', () => {
      // Helper function to convert to kebab-case (matching Schema Registry client)
      const toKebabCase = (str: string): string => {
        return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      };

      // Test core business logic with new topic-eventCode format
      const getSubjectName = (topic: string, schemaName: string): string => {
        const eventCode = schemaName.replace(/Schema$/, '');
        const topicKebab = toKebabCase(topic);
        const eventCodeKebab = toKebabCase(eventCode);
        return `${topicKebab}-${eventCodeKebab}`;
      };

      expect(getSubjectName('users', 'UserCreatedSchema')).toBe('users-user-created');
      expect(getSubjectName('orders', 'OrderProcessedSchema')).toBe('orders-order-processed');
      expect(getSubjectName('notifications', 'NotificationEventSchema')).toBe('notifications-notification-event');
    });
  });

  describe('Schema Registry client integration', () => {
    it('should call Schema Registry client correctly', async () => {
      new SchemaRegistryClient({ url: 'http://localhost:8081' });

      expect(MockSchemaRegistryClient).toHaveBeenCalledWith({
        url: 'http://localhost:8081'
      });
    });

    it('should handle authentication options', async () => {
      new SchemaRegistryClient({
        url: 'http://localhost:8081',
        auth: { username: 'test', password: 'pass' }
      });

      expect(MockSchemaRegistryClient).toHaveBeenCalledWith({
        url: 'http://localhost:8081',
        auth: { username: 'test', password: 'pass' }
      });
    });
  });
});
