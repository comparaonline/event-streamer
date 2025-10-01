import { ErrorHandler } from '../../shared/error-handler';
import { getParsedJson, debug } from '../../helpers';
import { Debug, Input } from '../../interfaces';
import { SchemaRegistryClient } from '../../schema-registry/client';
import { SchemaRegistryProducer } from '../../producer/schema-registry-producer';
import { DeadLetterQueueSchema } from '../../schemas';

export class ErrorCoordinator {
  constructor(
    private readonly errorHandler: ErrorHandler | undefined,
    private readonly deadLetterTopic: string | undefined
  ) {}

  async handle(error: Error, topic: string, message: any, partition: number): Promise<void> {
    if (!this.errorHandler) {
      debug(Debug.ERROR, 'Message processing error (no error handler)', {
        topic,
        partition,
        offset: message.offset,
        error: error.message,
      });
      return;
    }

    let originalCode = 'UnknownEvent';
    let originalPayload = message.value;

    try {
      if (SchemaRegistryClient.isSchemaRegistryEncoded(message.value)) {
        originalCode = topic;
      } else {
        const parsed = getParsedJson<Input>(message.value);
        if (parsed?.code) originalCode = parsed.code;
        originalPayload = parsed;
      }
    } catch {
      originalCode = topic;
    }

    const context = {
      topic,
      partition,
      offset: message.offset,
      timestamp: message.timestamp,
      originalCode,
      originalPayload,
      retryCount: 0,
    };

    const result = this.errorHandler.handleError(error, context);
    if (result.deadLetterEvent && this.deadLetterTopic) {
      try {
        const producer = new SchemaRegistryProducer();
        await producer.emitWithSchema({
          topic: this.deadLetterTopic,
          eventCode: 'DeadLetterQueueEvent',
          data: result.deadLetterEvent,
          schema: DeadLetterQueueSchema,
        });
        debug(Debug.INFO, 'Sent message to dead letter queue', {
          originalTopic: topic,
          originalOffset: message.offset,
          deadLetterTopic: this.deadLetterTopic,
        });
      } catch (dlqError) {
        debug(Debug.ERROR, 'Failed to send message to dead letter queue', {
          originalTopic: topic,
          originalOffset: message.offset,
          dlqError,
        });
      }
    }
  }
}
