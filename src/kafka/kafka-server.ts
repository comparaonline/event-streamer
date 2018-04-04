import { Server } from '../server';
import { Router } from '../router';
import { OutputEvent } from '../events';
import { EventConsumer } from './event-consumer';
import { EventProducer } from './event-producer';

export interface KafkaConfig {
  groupId: string;
  broker: string;
  consumerTopics: string[];
  producerTopic?: string;
}

export class KafkaServer extends Server {
  private consumer: EventConsumer;
  private producer: EventProducer;

  constructor(protected router: Router, private config: KafkaConfig) {
    super(router);
    this.consumer = new EventConsumer(this.router, {
      groupId: this.config.groupId,
      broker: this.config.broker,
      topics: this.config.consumerTopics
    });
    this.producer = new EventProducer({
      groupId: this.config.groupId,
      broker: this.config.broker,
      defaultTopic: this.config.producerTopic
    });
  }

  start() {
    this.consumer.start();
    this.producer.start();
    this.consumer.on('error', error => this.emit('error', error));
    this.producer.on('error', error => this.emit('error', error));
  }

  stop(): Promise<any> {
    return Promise.all([this.consumer.stop(), this.producer.stop()]);
  }

  output(event: OutputEvent) {
    return this.producer.produce(event);
  }
}
