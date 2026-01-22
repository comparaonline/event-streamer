import { z } from 'zod';

export const EventMetadataSchema = z.record(z.any()).optional();

export const BaseEventSchema = z.object({
  topic: z.string(),
  eventName: z.string().optional(),
  data: z.any(),
  metadata: EventMetadataSchema
});

export type EventMetadata = z.infer<typeof EventMetadataSchema> extends undefined
  ? Record<string, unknown> | undefined
  : z.infer<typeof EventMetadataSchema>;

export type BaseEvent = z.infer<typeof BaseEventSchema>;

export function createBaseEvent(input: BaseEvent): BaseEvent {
  const parsed = BaseEventSchema.parse(input);
  return parsed;
}
