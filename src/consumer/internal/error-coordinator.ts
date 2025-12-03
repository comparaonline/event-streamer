import { toDeadLetterMessage } from '../../shared/error-handler';
import type { DeadLetterQueueMessage } from '../../schemas/dead-letter-queue.schema';

export class ErrorCoordinator {
  toDeadLetter(params: { topic: string; value: unknown; error: unknown }): DeadLetterQueueMessage {
    return toDeadLetterMessage(params);
  }
}
