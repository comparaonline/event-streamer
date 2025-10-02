import { Consumer } from 'kafkajs';

interface Queue {
  status: 'alive' | 'paused';
  promises: Promise<void>[];
}

type Queues = Record<string, Queue>;

export interface QueueConfig {
  maxMessagesPerTopic: number | 'unlimited';
  maxMessagesPerSpecificTopic?: Record<string, number | 'unlimited'>;
}

/**
 * Shared queue management system for both legacy and Schema Registry consumers
 * Handles backpressure by pausing/resuming topics when queue limits are reached
 */
export class QueueManager {
  private queues: Queues = {};
  private config: QueueConfig;
  private consumer: Consumer | null = null;

  constructor(config: QueueConfig) {
    this.config = config;
  }

  /**
   * Initialize queues for the given topics
   */
  initializeQueues(topics: string[]): void {
    for (const topic of topics) {
      this.queues[topic] = {
        status: 'alive',
        promises: []
      };
    }
  }

  /**
   * Set the Kafka consumer instance for pause/resume operations
   */
  setConsumer(consumer: Consumer): void {
    this.consumer = consumer;
  }

  /**
   * Add a processing promise to the topic queue
   * Returns true if the message should be processed, false if topic should be paused
   */
  addToQueue(topic: string, processingPromise: Promise<void>): boolean {
    const topicQueue = this.queues[topic];
    if (!topicQueue) {
      return true; // Process the message anyway
    }

    const topicMaxQueue = this.config.maxMessagesPerSpecificTopic?.[topic] ?? this.config.maxMessagesPerTopic;

    // Check if we need to pause the topic
    if (topicMaxQueue !== 'unlimited' && topicQueue.promises.length + 1 >= topicMaxQueue) {
      if (this.consumer) {
        this.consumer.pause([{ topic }]);
      }
      topicQueue.status = 'paused';
    }

    // Add the promise to the queue
    topicQueue.promises.push(processingPromise);

    // Set up cleanup when promise completes
    processingPromise
      .finally(() => {
        this.removeFromQueue(topic, processingPromise);
      })
      .catch(() => {
        // ignore, error is handled elsewhere
      });

    return true;
  }

  /**
   * Remove a completed promise from the queue and resume topic if needed
   */
  private removeFromQueue(topic: string, processingPromise: Promise<void>): void {
    const topicQueue = this.queues[topic];
    if (!topicQueue) {
      return;
    }

    // Remove the promise from the queue
    const index = topicQueue.promises.indexOf(processingPromise);
    if (index !== -1) {
      topicQueue.promises.splice(index, 1);
    }

    // Resume the topic if it was paused and queue has space
    if (topicQueue.status === 'paused') {
      if (this.consumer) {
        this.consumer.resume([{ topic }]);
      }
      topicQueue.status = 'alive';
    }
  }

  /**
   * Get current queue statistics for monitoring
   */
  getQueueStats(): Record<string, { size: number; status: string }> {
    const stats: Record<string, { size: number; status: string }> = {};

    for (const [topic, queue] of Object.entries(this.queues)) {
      stats[topic] = {
        size: queue.promises.length,
        status: queue.status
      };
    }

    return stats;
  }

  /**
   * Get total messages across all queues
   */
  getTotalQueueSize(): number {
    return Object.values(this.queues).reduce((total, queue) => total + queue.promises.length, 0);
  }

  /**
   * Check if any topics are currently paused
   */
  hasPausedTopics(): boolean {
    return Object.values(this.queues).some((queue) => queue.status === 'paused');
  }

  /**
   * Pause all topics manually (for shutdown or maintenance)
   */
  pauseAllTopics(): void {
    const topics = Object.keys(this.queues);

    if (this.consumer && topics.length > 0) {
      this.consumer.pause(topics.map((topic) => ({ topic })));

      for (const topic of topics) {
        this.queues[topic].status = 'paused';
      }
    }
  }

  /**
   * Resume all topics manually
   */
  resumeAllTopics(): void {
    const topics = Object.keys(this.queues);

    if (this.consumer && topics.length > 0) {
      this.consumer.resume(topics.map((topic) => ({ topic })));

      for (const topic of topics) {
        this.queues[topic].status = 'alive';
      }
    }
  }

  /**
   * Wait for all processing to complete (useful for graceful shutdown)
   */
  async waitForAllQueues(): Promise<void> {
    const allPromises = Object.values(this.queues).flatMap((queue) => queue.promises);

    if (allPromises.length > 0) {
      await Promise.all(allPromises);
    }
  }

  /**
   * Clear all queues (for testing or emergency shutdown)
   */
  clearAllQueues(): void {
    for (const topic of Object.keys(this.queues)) {
      this.queues[topic] = {
        status: 'alive',
        promises: []
      };
    }
  }
}
