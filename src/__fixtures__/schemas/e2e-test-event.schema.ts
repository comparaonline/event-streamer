import { z } from 'zod';
import { BaseEventSchema } from '../../schemas';

export const E2eTestEventSchema = BaseEventSchema.extend({
  testField: z.string(),
  value: z.number(),
});

export type E2eTestEvent = z.infer<typeof E2eTestEventSchema>;