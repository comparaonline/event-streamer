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

const nullFn = () => { };

const defaultConfig: KafkaConfiguration = {
  groupId: '',
  broker: '',
  consumerTopics: [],
  producerTopic: '',
  logger: {
    info: nullFn,
    debug: nullFn,
    error: nullFn
  },
  rdConfig: {},
  connectionTimeout: 1000,
  flushTimeout: 2000,
  initialOffset: InitialOffset.latest,
  projectName: process.env.npm_package_version || 'unnamed-project'
};

export class KafkaServer extends Server {
  private consumer: EventConsumer;
  private producer: EventProducer;

  constructor(
    router: Router,
    private config: Partial<KafkaConfiguration>,
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
      logger: this.config.logger || defaultConfig.logger,
      groupId: this.config.groupId || defaultConfig.groupId,
      broker: this.config.broker || defaultConfig.broker,
      topics: this.config.consumerTopics || defaultConfig.consumerTopics,
      initialOffset: this.config.initialOffset || defaultConfig.initialOffset,
      connectionTimeout: this.config.connectionTimeout || defaultConfig.connectionTimeout,
      projectName: this.config.projectName || defaultConfig.projectName
    };
  }

  private get producerConfig(): EventProducerConfig {
    return {
      logger: this.config.logger || defaultConfig.logger,
      groupId: this.config.groupId || defaultConfig.groupId,
      broker: this.config.broker || defaultConfig.broker,
      defaultTopic: this.config.producerTopic || defaultConfig.producerTopic,
      connectionTimeout: this.config.connectionTimeout || defaultConfig.connectionTimeout,
      flushTimeout: this.config.flushTimeout || defaultConfig.flushTimeout
    };
  }
}
