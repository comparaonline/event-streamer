import { fromEvent, GroupedObservable, Subject, of, EMPTY } from 'rxjs';
import {
  map, groupBy, tap, flatMap, scan, share, distinctUntilChanged, skip
} from 'rxjs/operators';
import { ConsumerGroupStream, Message } from 'kafka-node';
import { Router } from '../router';
import { EventEmitter } from 'events';
import { RawEvent } from '../raw-event';
import { messageTracer } from '../lib/message-tracer';
import { EventMessage } from './interfaces/event-message';
import { ConfigurationManager } from './configuration-manager';
import { defaultLogger } from '../lib/default-logger';

const topicPartition = ({ topic, partition }: Message) => `${topic}:${partition}`;

export class EventConsumer extends EventEmitter {
  private consumerStream: ConsumerGroupStream;
  private readonly backpressureSubject = new Subject<number>();
  public readonly backpressure = this.backpressureSubject.pipe(
    scan((acc, value) => acc + value, 0),
    share()
  );
  /* istanbul ignore next */
  private actions = {
    pause: of(() => this.consumerStream.pause()),
    resume: of(() => this.consumerStream.resume()),
    nothing: EMPTY
  };

  constructor(
    private router: Router,
    private config: ConfigurationManager
  ) { super(); }

  start(): void {
    this.consumerStream = this.createStream();
    this.consumerStream.on('error', error => this.emit('error', error));
    fromEvent(this.consumerStream, 'data').pipe(
      groupBy(topicPartition),
      map(partition => this.handlePartition(partition)),
      flatMap(partition => partition)
    ).subscribe(
      ({ message }) => this.emit('next', message),
      (error) => { this.emit('error', error); }
    );
    this.consumerStream.resume();
    this.handleBackpressure();
  }

  stop(): Promise<any> {
    return new Promise((resolve) => {
      this.consumerStream.close(() => {
        resolve('Consumer disconnected');
      });
    });
  }

  private handleBackpressure() {
    const { pause, resume } = this.config.backpressureOptions;
    /* istanbul ignore next */
    if (pause === undefined || resume === undefined) return;
    this.backpressure.pipe(
      this.backpressureAction(pause, resume),
      distinctUntilChanged(),
      skip(1)
    ).subscribe(action => action());
  }

  private backpressureAction(pause: number, resume: number) {
    /* istanbul ignore next */
    return flatMap((current: number) => {
      if (current >= pause) return this.actions.pause;
      if (current <= resume) return this.actions.resume;
      return this.actions.nothing;
    });
  }

  private createStream(): ConsumerGroupStream {
    const topics = this.config.consumerTopics;
    const stream = new ConsumerGroupStream(this.config.consumerOptions, topics);
    /* istanbul ignore next */
    stream.on('ready', () => {
      defaultLogger.info(`Consumer ready. Topics: ${topics.join(', ')}`);
    });
    return stream;
  }

  private handlePartition(partition: GroupedObservable<string, Message>) {
    const trace = messageTracer(this.config.consumerOptions.groupId, partition.key);

    return partition.pipe(
      this.eventRead(),
      this.buildEvent(),
      this.log('Consuming'),
      this.router.route(trace),
      this.eventHandled(),
      this.log('Committing'),
      this.commit()
    );
  }

  private eventRead() {
    return tap(() => this.backpressureSubject.next(1));
  }

  private eventHandled() {
    return tap(() => this.backpressureSubject.next(-1));
  }

  private buildEvent() {
    return map((message: Message) =>
      ({ message, event: this.parseEvent(message.value.toString()) }));
  }

  private log(message: string) {
    return tap(({ event }: EventMessage) =>
      defaultLogger.debug(`${message} ${JSON.stringify(event)}`));
  }

  private commit() {
    return tap(({ message }: EventMessage) =>
      this.consumerStream.commit(message, true));
  }

  private parseEvent(json: string): RawEvent {
    try {
      return JSON.parse(json);
    } catch (error) {
      defaultLogger.error(`Omitted message. Unable to parse: ${json}. ${error}`);
      return { code: '' };
    }
  }
}
