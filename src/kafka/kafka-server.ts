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
import { extendConfig } from '../lib/extend-config';

const nullFn = () => { };

const defaultConfig: Partial<KafkaConfiguration> = {
  logger: {
    info: nullFn,
    debug: nullFn,
    error: nullFn
  },
  rdConfig: {},
  connectionTimeout: 1000,
  flushTimeout: 2000,
  initialOffset: InitialOffset.latest
};

export class KafkaServer extends Server {
  private consumer: EventConsumer;
  private producer: EventProducer;
  private config: KafkaConfiguration;

  constructor(
    router: Router,
    config: Partial<KafkaConfiguration>,
    rdConfig: RDKafkaConfiguration = {}
  ) {
    super(router);
    this.config = extendConfig(config, defaultConfig);
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
      logger: this.config.logger,
      groupId: this.config.groupId,
      broker: this.config.broker,
      topics: this.config.consumerTopics,
      initialOffset: this.config.initialOffset,
      connectionTimeout: this.config.connectionTimeout
    };
  }

  private get producerConfig(): EventProducerConfig {
    return {
      logger: this.config.logger,
      groupId: this.config.groupId,
      broker: this.config.broker,
      defaultTopic: this.config.producerTopic,
      connectionTimeout: this.config.connectionTimeout,
      flushTimeout: this.config.flushTimeout
    };
  }
}
