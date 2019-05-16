import { Producer, KafkaClient, ProducerOptions, KafkaClientOptions } from 'kafka-node';
import { EventEmitter } from 'events';
import { KafkaOutputEvent } from './kafka-events';

export class EventProducer extends EventEmitter {
  private producer: Producer;

  constructor(
    private clientConfig: KafkaClientOptions,
    private producerConfig: ProducerOptions,
    private defaultTopic: string
  ) { super(); }

  start(): void {
    const client = new KafkaClient(this.clientConfig);
    this.producer = new Producer(client, this.producerConfig);
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
