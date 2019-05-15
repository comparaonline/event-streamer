import {
  createReadStream, ConsumerStream, ConsumerStreamMessage
} from 'node-rdkafka';
import { fromEvent, GroupedObservable } from 'rxjs';
import { concatMap, map, groupBy, tap, flatMap } from 'rxjs/operators';
import { Router } from '../router';
import { EventEmitter } from 'events';
import { RawEvent } from '../events';
import { EventConsumerConfiguration } from './interfaces/event-consumer-configuration';
import { Partition } from './interfaces/partition';
import { InitialOffset } from './interfaces/initial-offset';
import { RDKafkaConfiguration } from './interfaces/rdkafka-configuration';
import { messageTracer } from '../lib/message-tracer';

const topicPartition = ({ topic, partition }: ConsumerStreamMessage) => `${topic}:${partition}`;

export class EventConsumer extends EventEmitter {
  private consumerStream: ConsumerStream;
  private partitions = new Map<string, Partition>();

  constructor(
    private router: Router,
    private config: EventConsumerConfiguration,
    private rdConfig: RDKafkaConfiguration = {},
    private logger = config.logger
  ) { super(); }

  start(): void {
    this.consumerStream = this.createStream(this.config.initialOffset);
    this.consumerStream.on('error', error => this.emit('error', error));
    fromEvent(this.consumerStream, 'data').pipe(
      groupBy(topicPartition),
      map(partition => this.handlePartition(partition)),
      flatMap(partition => partition)
    ).subscribe(
      null,
      (error) => { this.emit('error', error); }
    );
  }

  stop(): Promise<any> {
    this.partitions.forEach(p => p.subscription.unsubscribe());
    return new Promise((resolve) => {
      this.consumerStream.close(() => {
        resolve('Consumer disconnected');
      });
    });
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
        connectOptions: { timeout: this.config.connectionTimeout }
      }
    );
    stream.consumer.once('ready', () => {
      this.logger.info(`Consumer ready. Topics: ${this.config.topics.join(', ')}`);
    });
    return stream;
  }

  private handlePartition(partition: GroupedObservable<string, ConsumerStreamMessage>) {
    const trace = messageTracer(this.config.projectName, partition.key);

    return partition.pipe(
      map(this.parseEvent()),
      tap(this.log('Consuming')),
      map(this.route()),
      map(trace),
      concatMap(this.awaitResult()),
      tap(this.log('Committing')),
      map(this.commit())
    );
  }

  private parseEvent() {
    return (message: ConsumerStreamMessage) => {
      try {
        return { message, event: JSON.parse(message.value.toString()) as RawEvent };
      } catch (error) {
        this.logger.error(`Omitted message. Unable to parse: ${JSON.stringify(message)}. ${error}`);
        return { message, event: { code: '' } };
      }
    };
  }

  private log<T extends { event: RawEvent }>(message: string) {
    return ({ event }: T) => this.logger.debug(`${message} ${JSON.stringify(event)}`);
  }

  private route<T extends { event: RawEvent }>() {
    return (data: T) => ({ ...data, result: this.router.route(data.event) });
  }

  private awaitResult<T extends { result: Promise<any> }>() {
    return async (data: T) => ({ ...data, result: await data.result });
  }

  private commit() {
    return ({ message }: { message: ConsumerStreamMessage }) => {
      const consumer = this.consumerStream.consumer;
      if (consumer.isConnected()) {
        consumer.commitMessage(message);
      }
    };
  }
}
