import {
  KafkaClient, HighLevelProducer
} from 'kafka-node';
import { EventEmitter } from 'events';
import { KafkaOutputEvent } from './kafka-events';
import { clientOptions } from './client-options';
import { promisify } from 'util';
import { ConfigurationManager } from './configuration-manager';

export class EventProducer extends EventEmitter {
  private producer: HighLevelProducer;

  constructor(
    private config: ConfigurationManager
  ) { super(); }

  start(): void {
    const client = new KafkaClient(clientOptions(this.config.kafkaClientOptions));
    this.producer = new HighLevelProducer(client, this.config.producerOptions);
  /* istanbul ignore next */
    this.producer.on('ready', () => {
      console.info(`Producer ready. Default topic: ${this.config.producerTopic}`);
    });
  }

  stop(): Promise<any> {
    return new Promise((resolve) => {
      this.producer.close(() => {
        resolve('Producer disconnected');
      });
    });
  }

  produce(event: KafkaOutputEvent): Promise<void> {
    const fn = promisify(this.producer.send.bind(this.producer));
    return fn(this.message(event));
  }

  private message(event: KafkaOutputEvent) {
    return [{
      topic: event.topic || this.config.producerTopic,
      messages: event.toString(),
      key: event.key
    }];
  }
}
