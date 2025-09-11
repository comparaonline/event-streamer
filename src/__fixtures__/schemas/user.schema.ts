import { z } from 'zod';
import { BaseEventSchema } from '../../schemas';

export const UserSchema = BaseEventSchema.extend({
  userId: z.string().uuid().optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  // Evolution testing fields
  phoneNumber: z.string().optional(),
  address: z
    .object({
      street: z.string(),
      city: z.string(),
      country: z.string()
    })
    .optional(),
  preferences: z
    .object({
      newsletter: z.boolean(),
      notifications: z.boolean()
    })
    .optional(),
  // Message fields (for forward compatibility test)
  messageId: z.string().uuid().optional(),
  content: z.string().optional(),
  authorId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  attachments: z.array(z.string()).optional(),
  reactions: z
    .object({
      likes: z.number(),
      shares: z.number()
    })
    .optional(),
  // Type change testing fields
  eventId: z.string().uuid().optional(),
  count: z.union([z.string(), z.number()]).optional(),
  metadata: z
    .object({
      source: z.string()
    })
    .optional(),
  // Versioning fields
  itemId: z.string().uuid().optional(),
  version: z.string().optional(),
  data: z
    .object({
      value: z.string(),
      extraField: z.string().optional(),
      anotherField: z.number().optional()
    })
    .optional()
});

export type User = z.infer<typeof UserSchema>;
