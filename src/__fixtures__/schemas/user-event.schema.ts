import { z } from 'zod';
import { BaseEventSchema } from '../../schemas';

export const UserEventSchema = BaseEventSchema.extend({
  userId: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['admin', 'user', 'moderator'])
});

export type UserEvent = z.infer<typeof UserEventSchema>;
