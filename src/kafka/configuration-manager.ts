import {
  ConsumerGroupStreamOptions, KafkaClientOptions, ProducerOptions
} from 'kafka-node';
import { Configuration } from './interfaces/configuration';
import { ConsumerConfig } from './interfaces/consumer-config';
import { ProducerConfig } from './interfaces/producer-config';
import { BackpressureConfig } from './interfaces/backpressure-config';
import { ProducerRetryOptions } from './interfaces/producer-retry-options';

export class ConfigurationManager {
  constructor(
    private config: Configuration,
    public consumerTopics = config.consumer.topics,
    public producerTopic = config.producer.defaultTopic
  ) {}

  get consumerOptions(): ConsumerGroupStreamOptions {
    const get = this.getter(this.config.consumer);
    return {
      autoCommit: false,
      groupId: this.config.consumer.groupId,
      kafkaHost: get('kafkaHost'),
      ssl: get('ssl'),
      sslOptions: get('sslOptions'),
      sasl: get('sasl')
    };
  }

  get backpressureOptions(): BackpressureConfig {
    const get = this.getter(this.config.consumer);
    return {
      pause: (get<BackpressureConfig>('backpressure') || /* istanbul ignore next */{}).pause,
      resume: (get<BackpressureConfig>('backpressure') || /* istanbul ignore next */{}).resume,
      topMB: (get<BackpressureConfig>('backpressure') || /* istanbul ignore next */{}).topMB
    };
  }

  get kafkaClientOptions(): KafkaClientOptions {
    const get = this.getter(this.config.producer);
    return {
      kafkaHost: get('kafkaHost'),
      sslOptions: get('sslOptions'),
      sasl: get('sasl')
    };
  }
  get producerOptions(): ProducerOptions {
    return {
      partitionerType: this.config.producer.partitioner || 2
    };
  }

  get retryOptions(): ProducerRetryOptions {
    const options = this.config.producer.retry || { retries: 5, delay: 1000, increase: 2 };
    return {
      retries: options.retries,
      delay: options.delay
    };
  }
  private getter(elem: ConsumerConfig|ProducerConfig) {
    return <T>(property: string): T => elem[property] || this.config.global[property];
  }

  get consumerEnabled() {
    /* istanbul ignore next */
    return this.config.consumer.hasOwnProperty('enabled') ? this.config.consumer.enabled : true;
  }
}
