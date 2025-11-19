import { z } from 'zod';

// Base event schema matching legacy producer/consumer exactly
export const BaseEventSchema = z
  .object({
    code: z.string().min(1).describe('Event type code in UpperCamelCase'),
    createdAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z$/, 'Must be in YYYY-MM-DD HH:mm:ssZ format')
      .optional()
      .describe('Timestamp when event was created (YYYY-MM-DD HH:mm:ssZ format)'),
    appName: z.string().min(1).optional().describe('Service that produced the event')
  })
  .passthrough();

export type BaseEvent = z.infer<typeof BaseEventSchema>;

// Factory function to create base events with legacy-compatible defaults
export function createBaseEvent(data: { code: string } & Partial<BaseEvent>): BaseEvent {
  return {
    ...data,
    createdAt: data.createdAt || new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z'
  };
}
