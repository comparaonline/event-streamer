import type { DeadLetterQueueMessage } from '../schemas/dead-letter-queue.schema';

export function toDeadLetterMessage(params: {
  topic: string;
  value: unknown;
  error: unknown;
  headers?: Record<string, string | string[] | null>;
}): DeadLetterQueueMessage {
  const err = params.error instanceof Error ? params.error : new Error(String(params.error));
  return {
    topic: params.topic,
    value: params.value,
    error: {
      message: err.message,
      stack: err.stack
    },
    headers: params.headers ?? {},
    timestamp: new Date().toISOString()
  };
}
