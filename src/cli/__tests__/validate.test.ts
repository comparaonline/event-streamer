// Test schema validation logic, not the CLI wrapper
import { z } from 'zod';
import { BaseEventSchema } from '../../schemas';

jest.mock('../../helpers', () => ({ debug: jest.fn() }));

describe('Schema Validation Logic', () => {
  describe('Zod schema validation', () => {
    it('should validate valid schemas against BaseEventSchema', () => {
      const UserSchema = BaseEventSchema.extend({
        userId: z.string().uuid(),
        email: z.string().email(),
        name: z.string()
      });

      const validUser = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        timestamp: new Date().toISOString(),
        appName: 'test-app',
        version: '1.0.0',
        code: 'UserCreated',
        source: 'test',
        userId: '123e4567-e89b-12d3-a456-426614174001',
        email: 'test@example.com',
        name: 'Test User'
      };

      const result = UserSchema.safeParse(validUser);
      expect(result.success).toBe(true);
    });

    it('should reject invalid schemas', () => {
      const UserSchema = BaseEventSchema.extend({
        userId: z.string().uuid(),
        email: z.string().email()
      });

      const invalidUser = {
        id: 'not-a-uuid',
        timestamp: 'not-a-date',
        appName: 'test-app',
        version: '1.0.0',
        code: 'UserCreated',
        source: 'test',
        userId: 'not-a-uuid',
        email: 'not-an-email'
      };

      const result = UserSchema.safeParse(invalidUser);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });

    it('should validate required BaseEvent fields', () => {
      const validBase = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        timestamp: new Date().toISOString(),
        appName: 'test-app',
        version: '1.0.0',
        code: 'TestEvent',
        source: 'test'
      };

      const result = BaseEventSchema.safeParse(validBase);
      expect(result.success).toBe(true);
    });

    it('should reject incomplete BaseEvent objects', () => {
      const incompleteBase = {
        id: '123e4567-e89b-12d3-a456-426614174000'
        // Missing required fields
      };

      const result = BaseEventSchema.safeParse(incompleteBase);
      expect(result.success).toBe(false);
    });
  });

  describe('schema type detection', () => {
    it('should identify Zod schemas by _def property', () => {
      const TestSchema = z.object({ name: z.string() });
      const notASchema = { type: 'object' };

      expect(TestSchema._def.typeName).toBe('ZodObject');
      expect((notASchema as unknown as { _def: unknown })._def).toBeUndefined();
    });

    it('should detect different Zod schema types', () => {
      const objectSchema = z.object({ name: z.string() });
      const arraySchema = z.array(z.string());
      const stringSchema = z.string();

      expect(objectSchema._def.typeName).toBe('ZodObject');
      expect(arraySchema._def.typeName).toBe('ZodArray');
      expect(stringSchema._def.typeName).toBe('ZodString');
    });
  });
});
