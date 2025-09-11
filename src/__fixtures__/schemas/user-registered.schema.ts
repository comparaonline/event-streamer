import { z } from 'zod';
import { BaseEventSchema, SchemaRegistryEventSchema } from '../../schemas';

// Business data schema for user validation
export const UserRegisteredSchema = BaseEventSchema.extend({
  userId: z.string().uuid().describe('Unique user identifier'),
  email: z.string().email().describe('User email address'),
  registrationSource: z.enum(['web', 'mobile', 'api']).describe('Registration source'),
  metadata: z
    .object({
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
      referrer: z.string().optional()
    })
    .optional()
});

// Schema Registry schema for registration (includes internal fields)
export const UserRegisteredSchemaRegistrySchema = SchemaRegistryEventSchema.extend({
  userId: z.string().uuid().describe('Unique user identifier'),
  email: z.string().email().describe('User email address'),
  registrationSource: z.enum(['web', 'mobile', 'api']).describe('Registration source'),
  metadata: z
    .object({
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
      referrer: z.string().optional()
    })
    .optional()
});

export type UserRegistered = z.infer<typeof UserRegisteredSchema>;
