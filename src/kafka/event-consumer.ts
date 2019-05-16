import {
  createReadStream, ConsumerStream, ConsumerStreamMessage
} from 'node-rdkafka';
import { fromEvent, GroupedObservable } from 'rxjs';
import { map, groupBy, tap, flatMap, filter } from 'rxjs/operators';
import { Router } from '../router';
import { EventEmitter } from 'events';
import { RawEvent } from '../events';
import { EventConsumerConfiguration } from './interfaces/event-consumer-configuration';
import { Partition } from './interfaces/partition';
import { InitialOffset } from './interfaces/initial-offset';
import { RDKafkaConfiguration } from './interfaces/rdkafka-configuration';
import { messageTracer } from '../lib/message-tracer';
import { EventMessage } from './interfaces/event-message';

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
      this.buildEvent(),
      this.filterEvents(),
      this.log('Consuming'),
      this.router.route(trace),
      this.log('Committing'),
      this.commit()
    );
  }

  private buildEvent() {
    return map((message: ConsumerStreamMessage) =>
      ({ message, event: this.parseEvent(message.value.toString()) }));
  }

  private filterEvents() {
    return filter(({ event: { code } }: EventMessage) =>
      this.router.canHandle(code));
  }

  private log(message: string) {
    return tap(({ event }: EventMessage) =>
      this.logger.debug(`${message} ${JSON.stringify(event)}`));
  }

  private commit() {
    return tap(({ message }: EventMessage) => {
      const consumer = this.consumerStream.consumer;
      if (consumer.isConnected()) {
        consumer.commitMessage(message);
      }
    });
  }

  private parseEvent(json: string): RawEvent {
    try {
      return JSON.parse(json);
    } catch (error) {
      this.logger.error(`Omitted message. Unable to parse: ${json}. ${error}`);
      return { code: '' };
    }
  }
}
