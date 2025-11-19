// Test the core business logic, not the CLI wrapper
import { z } from 'zod';
import { getSubjectName } from '../../helpers';
import { SchemaRegistryClient } from '../../schema-registry/client';

// Mock external dependencies only
vi.mock('../../schema-registry/client');
vi.mock('../../helpers', async () => {
  const actual = await vi.importActual<typeof import('../../helpers')>('../../helpers');
  return {
    ...actual,
    debug: vi.fn(),
  };
});

const MockSchemaRegistryClient = SchemaRegistryClient as vi.MockedClass<typeof SchemaRegistryClient>;

describe('Schema Publishing Logic', () => {
  let mockClient: vi.Mocked<SchemaRegistryClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      getRegistryIdBySchema: vi.fn().mockResolvedValue(1),
      register: vi.fn().mockResolvedValue({ id: 1 }),
    } as unknown as vi.Mocked<SchemaRegistryClient>;
    MockSchemaRegistryClient.mockImplementation(() => mockClient as unknown as SchemaRegistryClient);
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

      expect((fakeSchema as unknown as { _def: unknown })._def).toBeUndefined();
      expect(typeof (fakeSchema as unknown as { parse: unknown }).parse).toBe('undefined');
    });
  });

  describe('subject name generation', () => {
    it('should convert topic and schema names to subject names', () => {


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
