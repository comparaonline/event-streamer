import {
  KafkaClient, ProducerOptions, KafkaClientOptions, HighLevelProducer
} from 'kafka-node';
import { EventEmitter } from 'events';
import { KafkaOutputEvent } from './kafka-events';
import { clientOptions } from './client-options';
import { promisify } from 'util';

export class EventProducer extends EventEmitter {
  private producer: HighLevelProducer;

  constructor(
    private clientConfig: KafkaClientOptions,
    private producerConfig: ProducerOptions,
    private defaultTopic: string
  ) { super(); }

  start(): void {
    const client = new KafkaClient(clientOptions(this.clientConfig));
    this.producer = new HighLevelProducer(client, this.producerConfig);
    this.producer.on('ready', () => {
      console.info(`Producer ready. Default topic: ${this.defaultTopic}`);
    });
  }

  stop(): Promise<any> {
    return new Promise((resolve) => {
      this.producer.close(() => {
        resolve('Producer disconnected');
      });
    });
  }

  produce(event: KafkaOutputEvent) {
    const fn = promisify(this.producer.send.bind(this.producer));
    return fn(this.message(event));
  }

  private message(event: KafkaOutputEvent) {
    return [{
      topic: event.topic || this.defaultTopic,
      messages: event.toString(),
      key: event.key
    }];
  }
}
