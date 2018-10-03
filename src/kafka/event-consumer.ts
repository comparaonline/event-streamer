import {
  createReadStream, ConsumerStream, ConsumerStreamMessage
} from 'node-rdkafka';
import { Subject, Subscription } from 'rxjs';
import { Router } from '../router';
import { EventEmitter } from 'events';
import { RawEvent } from '../events';

const CONNECT_TIMEOUT = 1000;

interface Partition {
  observer: Subject<ConsumerStreamMessage>;
  subscription: Subscription;
}

export interface EventConsumerConfig {
  groupId: string;
  broker: string;
  topics: string[];
}

export enum InitialOffset {
  smallest = 'smallest',
  earliest = 'earliest',
  beginning = 'beginning',
  largest = 'largest',
  latest = 'latest',
  end = 'end',
  error = 'error'
}

export class EventConsumer extends EventEmitter {
  private router: Router;
  private config: EventConsumerConfig;
  private consumerStream: ConsumerStream;
  private partitions = new Map<number, Partition>();

  constructor(router: Router, config: EventConsumerConfig) {
    super();
    this.router = router;
    this.config = config;
  }

  start(initialOffset: InitialOffset): void {
    this.consumerStream = this.createStream(initialOffset);
    this.consumerStream.on('error', error => this.emit('error', error));
    this.consumerStream.on('data', (message: ConsumerStreamMessage) => {
      this.dispatch(message);
    });
  }

  stop(): Promise<any> {
    this.partitions.forEach(p => p.subscription.unsubscribe());
    return new Promise((resolve) => {
      this.consumerStream.close(() => {
        resolve('Consumer disconnected');
      });
    });
  }

  dispatch(message: ConsumerStreamMessage) {
    const partition = this.getPartition(message.partition);
    partition.observer.next(message);
  }

  private createStream(initialOffset: InitialOffset): ConsumerStream {
    const stream = createReadStream(
      {
        'group.id': this.config.groupId,
        'metadata.broker.list': this.config.broker,
        'enable.auto.offset.store': false
      },
      {
        'auto.offset.reset': initialOffset
      },
      {
        topics: this.config.topics,
        objectMode: true,
        connectOptions: { timeout: CONNECT_TIMEOUT }
      }
    );
    stream.consumer.once('ready', () => {
      console.info(`Consumer ready. Topics: ${this.config.topics.join(', ')}`);
    });
    return stream;
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
    const subscription = observer
      .concatMap(message => this.consume(message))
      .subscribe(
        message => this.commit(message),
        error => this.emit('error', error)
      );
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
    const consumer = this.consumerStream.consumer;
    if (consumer.isConnected()) {
      consumer.commitMessage(message);
    }
  }
}
