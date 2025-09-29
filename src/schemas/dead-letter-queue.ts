import { z } from 'zod';
import { BaseEventSchema } from './base';

export const DeadLetterQueueSchema = z
  .object({
    // Dead Letter Queue specific fields
    originalCode: z.string().describe('Original event code that failed'),
    originalTopic: z.string().describe('Original Kafka topic'),
    originalPartition: z.number().describe('Original Kafka partition'),
    originalOffset: z.string().describe('Original Kafka offset'),
    originalTimestamp: z.string().optional().describe('Original message timestamp'),
    originalSchemaId: z.number().optional().describe('Original Schema Registry schema ID'),

    // Error information
    errorMessage: z.string().describe('Error message from failed processing'),
    errorType: z.enum(['VALIDATION_ERROR', 'PROCESSING_ERROR', 'SCHEMA_ERROR', 'UNKNOWN_ERROR']).describe('Type of error that occurred'),
    errorStack: z.string().optional().describe('Error stack trace for debugging'),

    // Retry information
    retryCount: z.number().default(0).describe('Number of times processing was attempted'),
    maxRetries: z.number().default(3).describe('Maximum retry attempts configured'),

    // Original message payload (for potential reprocessing)
    originalPayload: z.unknown().describe('Original message payload that failed processing'),

    // Processing context
    processingTimestamp: z.string().describe('Timestamp when message was moved to DLQ'),
    consumerGroupId: z.string().describe('Consumer group that failed to process the message'),
    processingHost: z.string().optional().describe('Host that attempted processing')
  })
  .merge(BaseEventSchema);

export type DeadLetterQueueEvent = z.infer<typeof DeadLetterQueueSchema>;

// Helper function to create a DLQ event
export function createDeadLetterQueueEvent(params: {
  originalCode: string;
  originalTopic: string;
  originalPartition: number;
  originalOffset: string;
  originalTimestamp?: string;
  originalSchemaId?: number;
  errorMessage: string;
  errorType: DeadLetterQueueEvent['errorType'];
  errorStack?: string;
  retryCount?: number;
  maxRetries?: number;
  originalPayload: unknown;
  consumerGroupId: string;
  processingHost?: string;
  appName: string;
}): DeadLetterQueueEvent {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z';

  return {
    code: 'DeadLetterQueueEvent',
    appName: params.appName,
    createdAt: now,

    // DLQ specific fields
    originalCode: params.originalCode,
    originalTopic: params.originalTopic,
    originalPartition: params.originalPartition,
    originalOffset: params.originalOffset,
    originalTimestamp: params.originalTimestamp,
    originalSchemaId: params.originalSchemaId,

    errorMessage: params.errorMessage,
    errorType: params.errorType,
    errorStack: params.errorStack,

    retryCount: params.retryCount || 0,
    maxRetries: params.maxRetries || 3,

    originalPayload: params.originalPayload,

    processingTimestamp: now,
    consumerGroupId: params.consumerGroupId,
    processingHost: params.processingHost || process.env.HOSTNAME
  };
}
