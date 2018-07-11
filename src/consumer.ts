import {
  createReadStream, ConsumerStream, ConsumerStreamMessage
} from 'node-rdkafka';
import { Subject, Subscription } from 'rxjs';
import { concatMap } from 'rxjs/operators';

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
  onError: (error: Error) => any;
}

export class Consumer {
  private router: Router;
  private config: ConsumerConfig;
  private stream: ConsumerStream;
  private partitions = new Map<number, Partition>();

  constructor(router: Router, config: ConsumerConfig) {
    this.router = router;
    this.config = config;
  }

  start(): Promise<string> {
    return new Promise((resolve) => {
      this.stream = this.createStream();
      this.stream.on('error', error => this.config.onError(error));
      this.stream.on('data', (message: ConsumerStreamMessage) => {
        this.dispatch(message);
      });
      this.stream.consumer.once('ready', () => {
        resolve(`Consumer ready. Topics: ${this.config.topics.join(', ')}`);
      });
    });
  }

  stop(): Promise<string> {
    return new Promise((resolve) => {
      this.partitions.forEach(p => p.subscription.unsubscribe());
      // Supress handling future errors to prevent loops
      this.config.onError = () => null;
      this.stream.close(() => resolve('Consumer disconnected'));
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
    ).subscribe({
      error: error => this.config.onError(error)
    });
    return { observer, subscription };
  }

  private async consume(message: ConsumerStreamMessage): Promise<any> {
    console.debug(`Consuming offset ${message.offset} from topic ${message.topic}`);
    const event = this.parseMessage(message);
    await this.router.handle(event);
    this.stream.consumer.commitMessage(message);
    console.debug(`Committed offset ${message.offset} from topic ${message.topic}`);
  }

  private parseMessage(message: ConsumerStreamMessage): RawEvent {
    try {
      return JSON.parse(message.value.toString());
    } catch (error) {
      throw new Error(`Unparsable message: ${JSON.stringify(message)}`);
    }
  }

  private isConnected(): boolean {
    return this.stream &&
      this.stream.consumer &&
      this.stream.consumer.connectedTime() > 0;
  }
}
