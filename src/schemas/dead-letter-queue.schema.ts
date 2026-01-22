import { z } from 'zod';

export const DeadLetterQueueSchema = z.object({
  topic: z.string(),
  partition: z.number().optional(),
  offset: z.string().optional(),
  key: z.string().nullable().optional(),
  value: z.any(),
  error: z.object({
    message: z.string(),
    stack: z.string().optional(),
    code: z.string().optional()
  }),
  headers: z.record(z.string(), z.string().or(z.array(z.string())).nullable()).optional(),
  timestamp: z.string().optional()
});

export type DeadLetterQueueMessage = z.infer<typeof DeadLetterQueueSchema>;
