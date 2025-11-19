import { z } from 'zod';
import { BaseEventSchema } from '../../schemas';

export const NotificationEventSchema = BaseEventSchema.extend({
  notificationId: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.enum(['email', 'sms', 'push', 'in-app']),
  subject: z.string(),
  content: z.string(),
  scheduled: z.boolean(),
  scheduledFor: z.string().datetime().optional()
});

export type NotificationEvent = z.infer<typeof NotificationEventSchema>;
