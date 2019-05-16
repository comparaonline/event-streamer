import { fromEvent, GroupedObservable } from 'rxjs';
import { map, groupBy, tap, flatMap, filter } from 'rxjs/operators';
import { ConsumerGroupStream, ConsumerGroupStreamOptions, Message } from 'kafka-node';
import { Router } from '../router';
import { EventEmitter } from 'events';
import { RawEvent } from '../events';
import { messageTracer } from '../lib/message-tracer';
import { EventMessage } from './interfaces/event-message';

const topicPartition = ({ topic, partition }: Message) => `${topic}:${partition}`;

export class EventConsumer extends EventEmitter {
  private consumerStream: ConsumerGroupStream;

  constructor(
    private router: Router,
    private config: ConsumerGroupStreamOptions,
    private topics: string[]
  ) { super(); }

  start(): void {
    this.consumerStream = this.createStream();
    this.consumerStream.on('error', error => this.emit('error', error));
    fromEvent(this.consumerStream, 'message').pipe(
      groupBy(topicPartition),
      map(partition => this.handlePartition(partition)),
      flatMap(partition => partition)
    ).subscribe(
      null,
      (error) => { this.emit('error', error); }
    );
  }

  stop(): Promise<any> {
    return new Promise((resolve) => {
      this.consumerStream.close(() => {
        resolve('Consumer disconnected');
      });
    });
  }

  private createStream(): ConsumerGroupStream {
    const config = { ...this.config, autoCommit: false };
    const stream = new ConsumerGroupStream(config, this.topics);
    stream.once('ready', () => {
      console.info(`Consumer ready. Topics: ${this.topics.join(', ')}`);
    });
    return stream;
  }

  private handlePartition(partition: GroupedObservable<string, Message>) {
    const trace = messageTracer(this.config.groupId, partition.key);

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
    return map((message: Message) =>
      ({ message, event: this.parseEvent(message.value.toString()) }));
  }

  private filterEvents() {
    return filter(({ event: { code } }: EventMessage) =>
      this.router.canHandle(code));
  }

  private log(message: string) {
    return tap(({ event }: EventMessage) =>
      console.debug(`${message} ${JSON.stringify(event)}`));
  }

  private commit() {
    return tap(({ message }: EventMessage) => this.consumerStream.commit(message));
  }

  private parseEvent(json: string): RawEvent {
    try {
      return JSON.parse(json);
    } catch (error) {
      console.error(`Omitted message. Unable to parse: ${json}. ${error}`);
      return { code: '' };
    }
  }
}
