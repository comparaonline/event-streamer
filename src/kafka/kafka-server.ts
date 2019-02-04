import { Server } from '../server';
import { Router } from '../router';
import { OutputEvent } from '../events';
import { EventConsumer } from './event-consumer';
import { EventProducer } from './event-producer';
import { RDKafkaConfiguration } from './interfaces/rdkafka-configuration';
import { KafkaConfiguration } from './interfaces/kafka-configuration';
import { InitialOffset } from './interfaces/initial-offset';
import { EventConsumerConfiguration } from './interfaces/event-consumer-configuration';
import { EventProducerConfig } from './interfaces/event-producer-configuration';

const DEFAULT_CONNECTION_TIMEOUT = 1000;
const DEFAULT_FLUSH_TIMEOUT = 2000;

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

  private get consumerConfig(): EventConsumerConfiguration {
    return {
      groupId: this.config.groupId,
      broker: this.config.broker,
      topics: this.config.consumerTopics,
      initialOffset: this.config.initialOffset || InitialOffset.beginning,
      connectionTimeout: this.config.connectionTimeout || DEFAULT_CONNECTION_TIMEOUT
    };
  }

  private get producerConfig(): EventProducerConfig {
    return {
      groupId: this.config.groupId,
      broker: this.config.broker,
      defaultTopic: this.config.producerTopic,
      connectionTimeout: this.config.connectionTimeout || DEFAULT_CONNECTION_TIMEOUT,
      flushTimeout: this.config.flushTimeout || DEFAULT_FLUSH_TIMEOUT
    };
  }
}
