import { BaseServer, BindingCallback, RawEvent } from '../base-server';
import { Producer, KafkaConsumer  } from 'node-rdkafka';
import { Subject, Observable } from 'rxjs';
import { Router } from '../../router';
import { BaseEvent } from '../../event/index';
import { KafkaEvent } from './kafka-event';

export interface KafkaConfiguration {
  producer?: {
    'client.id'?: string,
    'metadata.broker.list'?: string,
    'compression.codec'?: string,
    'retry.backoff.ms'?: number,
    'message.send.max.retries'?: number,
    'socket.keepalive.enable'?: boolean,
    'queue.buffering.max.messages'?: number,
    'queue.buffering.max.ms'?: number,
    'batch.num.messages'?: number
  };
  consumer?: {
    'group.id'?: string,
    'metadata.broker.list'?: string
  };
  consumerTopics: string[];
  consumerTopicConfiguration?: {};
  producerTopic?: string;
  rest?: {
    url?: string
  };
}

interface RawData {
  value: Buffer;
  size: number;
  key: string | null;
  topic: string;
  offset: number;
  partition: number;
  timestamp: number;
}

export interface RawKafkaEvent extends RawEvent {
  key?: string;
  timestamp: number;
}

export class KafkaServer extends BaseServer {
  private producer: Producer;
  private consumer: KafkaConsumer;
  constructor(router: Router, private config: KafkaConfiguration) {
    super(router);
  }
  link(callback: (event: Observable<RawEvent>) => Observable<KafkaEvent>) {
    const events = new Subject<RawEvent>();
    this.initProducer()
      .then(() => this.initConsumer())
      .then(() => console.log(`Consuming ${this.config.consumerTopics.join(', ')}`))
      .then(() => this.consumer.on('data', (data: RawData) => {
        const value = data.value.toString();
        try {
          const event: RawKafkaEvent = JSON.parse(value);
          if (data.key !== null) {
            event.key = data.key;
            event.timestamp = data.timestamp;
          }
          events.next(event);
        } catch (error) {
          console.error(error.stack);
        }
      }))
      .then(() => new Promise((resolve: Function, reject: Function) =>
        callback(events).subscribe(
          (event: KafkaEvent) => this.produce(event),
          (error: Error) => this.error(error),
          () => this.error(new Error('Stream finished!'))
        )
      ));
  }

  private produce(event: KafkaEvent) {
    this.producer.produce(
      // Topic
      event.topic !== undefined ? event.topic : this.config.producerTopic,
      // Partition
      null,
      // Message
      new Buffer(event.toString()),
      // Key
      event.key,
      // Timestamp
      Date.now()
    );
  }

  private error(error: Error) {
    console.error(error.stack);
    process.exit(1);
  }

  private initProducer(): Promise<void> {
    return new Promise((resolve: () => void, reject: (error) => any) => {
      this.producer = new Producer(this.config.producer);
      this.producer.on('ready', resolve);
      this.producer.on('error', reject);
      this.producer.connect();
    });
  }

  private initConsumer(): Promise<void> {
    return new Promise((resolve: () => void, reject: (error) => any) => {
      this.consumer = new KafkaConsumer(
        this.config.consumer,
        this.config.consumerTopicConfiguration
      );
      this.consumer.on('ready', () => {
        this.consumer.subscribe(this.config.consumerTopics);
        this.consumer.consume();
        resolve();
      });
      this.consumer.on('error', reject);
      this.consumer.connect();
    });
  }
}
