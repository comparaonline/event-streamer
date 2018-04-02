import { Router } from '../router';
import { Consumer } from './consumer';
import { Producer } from './producer';
import { Server, OutputEvent } from '..';
import { ConsumerStreamMessage } from 'node-rdkafka';

export interface KafkaConfig {
  groupId: string;
  broker: string;
  consumerTopics: string[];
  producerTopic: string;
}

export class KafkaServer extends Server {

  private consumer: Consumer;
  private producer: Producer;

  constructor(router: Router, config: KafkaConfig) {
    super(router);
    this.initConsumer(config);
    this.initProducer(config);
  }

  output(event: OutputEvent) {
    return this.producer.produce('test2', 0, 0);
  }

  private initConsumer(config: KafkaConfig) {
    this.consumer = new Consumer(this.router, {
      groupId: config.groupId,
      broker: config.broker,
      topics: config.consumerTopics
    });
    this.consumer.on('error', (error) => {
      this.emit('error', error);
    });
  }

  private initProducer(config: KafkaConfig) {
    this.producer = new Producer({
      groupId: config.groupId,
      broker: config.broker,
      defaultTopic: config.producerTopic
    });
    this.producer.on('error', (error) => {
      this.emit('error', error);
    });
  }
}
