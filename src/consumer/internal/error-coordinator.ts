import { ErrorHandler } from '../../shared/error-handler';
import { getParsedJson } from '../../helpers';
import { KafkaMessage } from 'kafkajs';
import { Input } from '../../interfaces';
import { SchemaRegistryClient } from '../../schema-registry/client';
import { SchemaRegistryProducer } from '../../producer/schema-registry-producer';
import { DeadLetterQueueSchema } from '../../schemas';

export class ErrorCoordinator {
  private readonly errorHandler: ErrorHandler;
  private readonly deadLetterTopic?: string;
  private readonly schemaRegistryClient?: SchemaRegistryClient;

  constructor(errorHandler: ErrorHandler, deadLetterTopic?: string, schemaRegistryClient?: SchemaRegistryClient) {
    this.errorHandler = errorHandler;
    this.deadLetterTopic = deadLetterTopic;
    this.schemaRegistryClient = schemaRegistryClient;
  }


  async handle(error: Error, topic: string, message: KafkaMessage, partition: number): Promise<void> {
    if (!this.errorHandler) {
      console.error('Message processing error (no error handler)', {
        topic,
        partition,
        offset: message.offset,
        error: error.message,
      });
      return;
    }

    let originalPayload = message.value;
    let parsedPayload: Input | null = null;

    // Try to decode SR messages to get original payload
    try {
      if (message.value && SchemaRegistryClient.isSchemaRegistryEncoded(message.value)) {
        if (this.schemaRegistryClient) {
          const { value } = await this.schemaRegistryClient.decodeAndValidate(message.value);
          originalPayload = value as Buffer | null;
        }
      } else {
        // For plain JSON, the value is the payload
        parsedPayload = getParsedJson<Input>(message.value);
        originalPayload = parsedPayload as Buffer | null;
      }
    } catch (_decodeError) {
      // Ignore decode error, proceed with raw payload
    }

    const result = this.errorHandler.handleError(error, {
      topic,
      partition,
      offset: message.offset,
      timestamp: message.timestamp,
      originalCode: (parsedPayload || ({} as Input)).code,
      originalPayload,
      retryCount: 0 // TODO: Implement retry tracking
    });
    if (result.deadLetterEvent && this.deadLetterTopic) {
      try {
        const producer = new SchemaRegistryProducer();
        await producer.emitWithSchema({
          topic: this.deadLetterTopic,
          eventCode: 'DeadLetterQueueEvent',
          data: result.deadLetterEvent,
          schema: DeadLetterQueueSchema,
        });
      } catch (dlqError) {
        console.error('Failed to send message to dead letter queue', {
          originalTopic: topic,
          originalOffset: message.offset,
          dlqError,
        });
      }
    }
  }
}
