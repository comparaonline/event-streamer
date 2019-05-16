import {
  KafkaClient, ProducerOptions, KafkaClientOptions, HighLevelProducer
} from 'kafka-node';
import { EventEmitter } from 'events';
import { KafkaOutputEvent } from './kafka-events';
import { clientOptions } from './client-options';

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
    return new Promise((resolve, reject) => this.producer.send(
      [{
        topic: event.topic || this.defaultTopic,
        messages: event.toString(),
        key: event.key
      }],
      (error: Error, data: any) => error ? reject(error) : resolve(data))
    );
  }
}
