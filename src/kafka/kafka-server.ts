import { Server } from '../server';
import { Router } from '../router';
import { OutputEvent } from '../events';
import { EventConsumer } from './event-consumer';
import { EventProducer } from './event-producer';
import { RDKafkaConfiguration } from './interfaces/rdkafka-configuration';
import { KafkaConfiguration } from './interfaces/kafka-configuration';
import { InitialOffset } from './interfaces/initial-offset';

export class KafkaServer extends Server {
  private consumer: EventConsumer;
  private producer: EventProducer;

  constructor(
    router: Router,
    private config: KafkaConfiguration,
    rdConfig: RDKafkaConfiguration = {}
  ) {
    super(router);
    this.consumer = new EventConsumer(router, this.consumerConfig, rdConfig);
    this.producer = new EventProducer(this.producerConfig, rdConfig);
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

  private get consumerConfig() {
    return {
      groupId: this.config.groupId,
      broker: this.config.broker,
      topics: this.config.consumerTopics,
      initialOffset: this.config.initialOffset || InitialOffset.beginning
    };
  }

  private get producerConfig() {
    return {
      groupId: this.config.groupId,
      broker: this.config.broker,
      defaultTopic: this.config.producerTopic
    };
  }
}
