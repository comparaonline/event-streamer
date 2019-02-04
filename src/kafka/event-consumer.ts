import {
  createReadStream, ConsumerStream, ConsumerStreamMessage
} from 'node-rdkafka';
import { Subject } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { Router } from '../router';
import { EventEmitter } from 'events';
import { RawEvent } from '../events';
import { EventConsumerConfiguration } from './interfaces/event-consumer-configuration';
import { Partition } from './interfaces/partition';
import { InitialOffset } from './interfaces/initial-offset';
import { RDKafkaConfiguration } from './interfaces/rdkafka-configuration';

const CONNECT_TIMEOUT = 1000;

export class EventConsumer extends EventEmitter {
  private consumerStream: ConsumerStream;
  private partitions = new Map<number, Partition>();

  constructor(
    private router: Router,
    private config: EventConsumerConfiguration,
    private rdConfig: RDKafkaConfiguration = {}
  ) { super(); }

  start(): void {
    this.consumerStream = this.createStream(this.config.initialOffset);
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
        'enable.auto.offset.store': false,
        ...this.rdConfig
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
    const subscription = observer.pipe(
      concatMap(message => this.consume(message))
    ).subscribe(
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
