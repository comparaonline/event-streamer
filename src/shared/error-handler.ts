import { DeadLetterQueueEvent, createDeadLetterQueueEvent } from '../schemas';

export type ErrorStrategy = 'IGNORE' | 'DEAD_LETTER';

export interface ErrorHandlerConfig {
  strategy: ErrorStrategy;
  deadLetterTopic?: string;
  appName: string;
  consumerGroupId: string;
}

export interface MessageContext {
  topic: string;
  partition: number;
  offset: string;
  timestamp?: string;
  originalCode?: string;
  schemaId?: number;
  originalPayload: unknown;
  retryCount?: number;
}

export interface ErrorHandlerResult {
  shouldContinue: boolean;
  deadLetterEvent?: DeadLetterQueueEvent;
  errorLogged: boolean;
}

/**
 * Shared error handling system for both legacy and Schema Registry consumers
 * Implements consistent error strategies without affecting message commits
 */
export class ErrorHandler {
  private config: ErrorHandlerConfig;

  constructor(config: ErrorHandlerConfig) {
    this.config = config;

    if (config.strategy === 'DEAD_LETTER' && !config.deadLetterTopic) {
      throw new Error('Dead Letter topic must be specified when using DEAD_LETTER strategy');
    }
  }

  /**
   * Handle an error that occurred during message processing
   * Returns information about how the error was handled
   */
  handleError(error: Error, context: MessageContext): ErrorHandlerResult {
    const errorType = this.categorizeError(error);

    switch (this.config.strategy) {
      case 'IGNORE':
        return this.handleIgnoreStrategy(error, context);

      case 'DEAD_LETTER':
        return this.handleDeadLetterStrategy(error, context, errorType);

      default:
        return this.handleIgnoreStrategy(error, context);
    }
  }

  /**
   * IGNORE strategy: Log the error and continue processing
   */
  private handleIgnoreStrategy(error: Error, context: MessageContext): ErrorHandlerResult {
    return {
      shouldContinue: true,
      errorLogged: true
    };
  }

  /**
   * DEAD_LETTER strategy: Create DLQ event for failed message
   */
  private handleDeadLetterStrategy(
    error: Error,
    context: MessageContext,
    errorType: DeadLetterQueueEvent['errorType'],
  ): ErrorHandlerResult {
    const deadLetterEvent = createDeadLetterQueueEvent({
      originalCode: context.originalCode || 'UnknownEvent',
      originalTopic: context.topic,
      originalPartition: context.partition,
      originalOffset: context.offset,
      originalTimestamp: context.timestamp,
      originalSchemaId: context.schemaId,

      errorMessage: error.message,
      errorType,
      errorStack: error.stack,

      retryCount: context.retryCount || 0,

      originalPayload: context.originalPayload,
      consumerGroupId: this.config.consumerGroupId,
      processingHost: process.env.HOSTNAME,

      appName: this.config.appName
    });

    return {
      shouldContinue: true,
      deadLetterEvent,
      errorLogged: true
    };
  }

  /**
   * Categorize the error to help with monitoring and alerting
   */
  private categorizeError(error: Error): DeadLetterQueueEvent['errorType'] {
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes('validation') || errorMessage.includes('schema')) {
      return 'VALIDATION_ERROR';
    }

    if (errorMessage.includes('schema registry') || errorMessage.includes('avro') || errorMessage.includes('json schema')) {
      return 'SCHEMA_ERROR';
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('network') || errorMessage.includes('connection')) {
      return 'PROCESSING_ERROR';
    }

    return 'UNKNOWN_ERROR';
  }



  /**
   * Get configuration for monitoring/debugging
   */
  getConfig(): ErrorHandlerConfig {
    return { ...this.config };
  }

  /**
   * Update error strategy at runtime (useful for testing)
   */
  updateStrategy(strategy: ErrorStrategy, deadLetterTopic?: string): void {
    this.config.strategy = strategy;

    if (strategy === 'DEAD_LETTER' && deadLetterTopic) {
      this.config.deadLetterTopic = deadLetterTopic;
    }
  }
}
