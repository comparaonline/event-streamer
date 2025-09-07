import { z } from 'zod';
import { randomUUID } from 'crypto';
import { BaseEventSchema, LegacyEventSchema, SchemaRegistryEventSchema, validateEvent, createBaseEvent, createSchemaRegistryEvent } from '../index';

describe('Schema Validation', () => {
  describe('BaseEventSchema', () => {
    it('should validate minimal base event', () => {
      const event = {
        code: 'TestEvent'
      };

      const result = BaseEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should validate complete base event', () => {
      const event = {
        createdAt: '2023-01-01 12:00:00Z',
        appName: 'test-service',
        code: 'TestEvent'
      };

      const result = BaseEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should require code field', () => {
      const event = {
        createdAt: '2023-01-01 12:00:00Z',
        appName: 'test-service'
      };

      const result = BaseEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('should validate legacy datetime format for createdAt', () => {
      const event = {
        code: 'TestEvent',
        createdAt: 'invalid-date'
      };

      const result = BaseEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('should accept valid legacy datetime format', () => {
      const event = {
        code: 'TestEvent',
        createdAt: '2023-01-01 12:00:00Z'
      };

      const result = BaseEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });
  });

  describe('LegacyEventSchema', () => {
    it('should allow additional properties (passthrough)', () => {
      const event = {
        code: 'LegacyEvent',
        customField: 'custom-value',
        nestedObject: {
          prop1: 'value1',
          prop2: 123
        }
      };

      const result = LegacyEventSchema.safeParse(event);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.customField).toBe('custom-value');
        expect(result.data.nestedObject).toEqual({
          prop1: 'value1',
          prop2: 123
        });
      }
    });

    it('should still validate base event fields', () => {
      const event = {
        code: 'LegacyEvent',
        createdAt: 'invalid-date-format',
        customField: 'allowed'
      };

      const result = LegacyEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  describe('SchemaRegistryEventSchema', () => {
    it('should require all mandatory fields', () => {
      const completeEvent = {
        id: randomUUID(),
        createdAt: '2023-01-01 12:00:00Z',
        appName: 'test-service',
        code: 'TestEvent',
        version: '1.0.0',
        source: 'test-service'
      };

      const result = SchemaRegistryEventSchema.safeParse(completeEvent);
      expect(result.success).toBe(true);
    });

    it('should require source field', () => {
      const event = {
        id: randomUUID(),
        createdAt: '2023-01-01 12:00:00Z',
        appName: 'test-service',
        code: 'TestEvent'
        // missing source
      };

      const result = SchemaRegistryEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('should provide default version', () => {
      const event = {
        id: randomUUID(),
        createdAt: '2023-01-01 12:00:00Z',
        appName: 'test-service',
        code: 'TestEvent',
        source: 'test-service'
        // no version specified
      };

      const result = SchemaRegistryEventSchema.safeParse(event);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.version).toBe('1.0.0');
      }
    });
  });

  describe('validateEvent utility function', () => {
    const TestSchema = BaseEventSchema.extend({
      testField: z.string(),
      count: z.number().positive()
    });

    it('should return success for valid data', () => {
      const event = {
        code: 'TestEvent',
        testField: 'test-value',
        count: 5
      };

      const result = validateEvent(TestSchema, event);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(event);
      expect(result.error).toBeUndefined();
    });

    it('should return error for invalid data', () => {
      const event = {
        code: 'TestEvent',
        testField: 'test-value',
        count: -1 // Invalid: must be positive
      };

      const result = validateEvent(TestSchema, event);

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeInstanceOf(z.ZodError);
      expect(result.error?.issues).toHaveLength(1);
      expect(result.error?.issues[0].path).toEqual(['count']);
    });

    it('should handle missing required fields', () => {
      const event = {
        code: 'TestEvent',
        // missing testField
        count: 5
      };

      const result = validateEvent(TestSchema, event);

      expect(result.success).toBe(false);
      expect(result.error?.issues).toHaveLength(1);
      expect(result.error?.issues[0].path).toEqual(['testField']);
    });
  });

  describe('Factory functions', () => {
    describe('createBaseEvent', () => {
      it('should auto-generate createdAt when not provided', () => {
        const event = createBaseEvent({
          code: 'TestEvent',
          appName: 'test-service'
        });

        expect(event.createdAt).toBeDefined();
        expect(event.code).toBe('TestEvent');
        expect(event.appName).toBe('test-service');

        // Validate legacy datetime format (YYYY-MM-DD HH:mm:ssZ)
        if (event.createdAt) {
          expect(event.createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z$/);
        }
      });

      it('should use provided createdAt when given', () => {
        const customDate = '2023-01-01 12:00:00Z';

        const event = createBaseEvent({
          createdAt: customDate,
          code: 'TestEvent',
          appName: 'test-service'
        });

        expect(event.createdAt).toBe(customDate);
      });
    });

    describe('createSchemaRegistryEvent', () => {
      it('should create valid Schema Registry event with auto-generated fields', () => {
        const event = createSchemaRegistryEvent({
          code: 'TestEvent',
          appName: 'test-service',
          source: 'test-service',
          version: '1.0.0'
        });

        expect(event.id).toBeDefined();
        expect(event.createdAt).toBeDefined();
        expect(event.code).toBe('TestEvent');
        expect(event.appName).toBe('test-service');
        expect(event.source).toBe('test-service');
        expect(event.version).toBe('1.0.0'); // Default version

        const validation = SchemaRegistryEventSchema.safeParse(event);
        expect(validation.success).toBe(true);
      });

      it('should override default version when provided', () => {
        const event = createSchemaRegistryEvent({
          code: 'TestEvent',
          appName: 'test-service',
          source: 'test-service',
          version: '2.1.0'
        });

        expect(event.version).toBe('2.1.0');
      });
    });
  });

  describe('Event schema extension patterns', () => {
    it('should support extending BaseEventSchema for custom events', () => {
      const UserCreatedSchema = BaseEventSchema.extend({
        userId: z.string().uuid(),
        email: z.string().email(),
        userType: z.enum(['admin', 'user', 'guest']),
        metadata: z.record(z.unknown()).optional()
      });

      type UserCreatedEvent = z.infer<typeof UserCreatedSchema>;

      const event: UserCreatedEvent = {
        createdAt: '2023-01-01 12:00:00Z',
        appName: 'user-service',
        code: 'UserCreated',
        userId: randomUUID(),
        email: 'test@example.com',
        userType: 'user',
        metadata: {
          signupSource: 'web',
          campaign: 'summer2023'
        }
      };

      const result = UserCreatedSchema.safeParse(event);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.userId).toBeDefined();
        expect(result.data.email).toBe('test@example.com');
        expect(result.data.userType).toBe('user');
      }
    });

    it('should support complex nested schemas', () => {
      const OrderEventSchema = BaseEventSchema.extend({
        orderId: z.string().uuid(),
        customerId: z.string().uuid(),
        items: z.array(
          z.object({
            productId: z.string(),
            quantity: z.number().positive(),
            price: z.number().positive()
          })
        ),
        totals: z.object({
          subtotal: z.number(),
          tax: z.number(),
          shipping: z.number(),
          total: z.number()
        }),
        paymentMethod: z.enum(['credit_card', 'debit_card', 'paypal'])
      });

      const orderEvent = {
        createdAt: '2023-01-01 12:00:00Z',
        appName: 'order-service',
        code: 'OrderCreated',
        orderId: randomUUID(),
        customerId: randomUUID(),
        items: [
          {
            productId: 'product-123',
            quantity: 2,
            price: 29.99
          },
          {
            productId: 'product-456',
            quantity: 1,
            price: 59.99
          }
        ],
        totals: {
          subtotal: 119.97,
          tax: 12.0,
          shipping: 9.99,
          total: 141.96
        },
        paymentMethod: 'credit_card' as const
      };

      const result = OrderEventSchema.safeParse(orderEvent);
      expect(result.success).toBe(true);
    });

    it('should validate enum constraints properly', () => {
      const StatusEventSchema = BaseEventSchema.extend({
        status: z.enum(['active', 'inactive', 'pending', 'deleted']),
        priority: z.enum(['low', 'medium', 'high', 'critical'])
      });

      // Valid enum values
      const validEvent = {
        code: 'StatusChanged',
        status: 'active' as const,
        priority: 'high' as const
      };

      expect(StatusEventSchema.safeParse(validEvent).success).toBe(true);

      // Invalid enum values
      const invalidEvent = {
        code: 'StatusChanged',
        status: 'unknown' as any,
        priority: 'urgent' as any
      };

      const result = StatusEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues).toHaveLength(2);
        expect(result.error.issues.some((issue: any) => issue.path.includes('status'))).toBe(true);
        expect(result.error.issues.some((issue: any) => issue.path.includes('priority'))).toBe(true);
      }
    });
  });
});
