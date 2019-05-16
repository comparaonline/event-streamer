import { Server } from '../server';
import { Router } from '../router';
import { OutputEvent } from '../events';
import { EventConsumer } from './event-consumer';
import { EventProducer } from './event-producer';
import { ConsumerGroupStreamOptions, ProducerStreamOptions } from 'kafka-node';

export class KafkaServer extends Server {
  private consumer: EventConsumer;
  private producer: EventProducer;

  constructor(
    router: Router,
    private consumerOptions: ConsumerGroupStreamOptions,
    private producerOptions: ProducerStreamOptions,
    topics: string[],
    defaultTopic: string
  ) {
    super(router);
    this.consumer = new EventConsumer(router, this.consumerOptions, topics);
    this.producer = new EventProducer(this.producerOptions, defaultTopic);
  }

  start() {
    this.consumer.start();
    this.consumer.on('error', error => this.emit('error', error));
    this.producer.start();
    this.producer.on('error', error => this.emit('error', error));
  }

  stop(): Promise<string[]> {
    return Promise.all([this.consumer.stop(), this.producer.stop()]);
  }

  output(event: OutputEvent) {
    return this.producer.produce(event);
  }
}
