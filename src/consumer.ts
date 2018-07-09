import {
  createReadStream, ConsumerStream, ConsumerStreamMessage
} from 'node-rdkafka';
import { Subject, Subscription } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { EventEmitter } from 'events';

import { Router } from './router';
import { RawEvent } from './events';

const CONNECT_TIMEOUT = 1000;

interface Partition {
  observer: Subject<ConsumerStreamMessage>;
  subscription: Subscription;
}

export interface ConsumerConfig {
  groupId: string;
  broker: string;
  topics: string[];
}

export interface ConsumerEvents {
  on(event: 'error', listener?: (error: Error) => void): this;
}

export class Consumer extends EventEmitter implements ConsumerEvents {
  private router: Router;
  private config: ConsumerConfig;
  private stream: ConsumerStream;
  private partitions = new Map<number, Partition>();

  constructor(router: Router, config: ConsumerConfig) {
    super();
    this.router = router;
    this.config = config;
  }

  start(): Promise<string> {
    this.stream = this.createStream();
    this.stream.on('error', error => this.emit('error', error));
    this.stream.on('data', (message: ConsumerStreamMessage) => {
      this.dispatch(message);
    });
    return new Promise((resolve) => {
      this.stream.consumer.once('ready', () => {
        resolve(`Consumer ready. Topics: ${this.config.topics.join(', ')}`);
      });
    });
  }

  stop(): Promise<string> {
    this.partitions.forEach(p => p.subscription.unsubscribe());
    return new Promise((resolve) => {
      this.stream.close(() => {
        resolve('Consumer disconnected');
      });
    });
  }

  dispatch(message: ConsumerStreamMessage) {
    const partition = this.getPartition(message.partition);
    partition.observer.next(message);
  }

  private createStream(): ConsumerStream {
    return createReadStream(
      {
        'group.id': this.config.groupId,
        'metadata.broker.list': this.config.broker,
        'enable.auto.offset.store': false
      },
      {
        'auto.offset.reset': 'beginning'
      },
      {
        topics: this.config.topics,
        objectMode: true,
        connectOptions: { timeout: CONNECT_TIMEOUT }
      }
    );
  }

  private getPartition(partitionIdx: number): Partition {
    let partition = this.partitions.get(partitionIdx);
    if (!partition) {
      partition = this.initPartition();
      this.partitions.set(partitionIdx, partition);
    }
    return partition;
  }

  private initPartition(): Partition {
    const observer = new Subject<ConsumerStreamMessage>();
    const subscription = observer.pipe(
        concatMap(message => this.consume(message))
      )
      .subscribe({
        next: message => this.commit(message),
        error: error => this.emit('error', error)
      });
    return { observer, subscription };
  }

  private consume(message: ConsumerStreamMessage): Promise<ConsumerStreamMessage> {
    const event = this.parseEvent(message);
    console.debug(`Consuming ${JSON.stringify(event)}`);
    return this.router.route(event)
      .then(() => message);
  }

  private parseEvent(message: ConsumerStreamMessage): RawEvent {
    try {
      return JSON.parse(message.value.toString());
    } catch (error) {
      console.error(`Omitted message. Unable to parse: ${JSON.stringify(message)}. ${error}`);
      return { code: '' };
    }
  }

  private commit(message: ConsumerStreamMessage) {
    console.debug(`Committing ${message.value}`);
    const consumer = this.stream.consumer;
    if (consumer.isConnected()) {
      consumer.commitMessage(message);
    }
  }
}
