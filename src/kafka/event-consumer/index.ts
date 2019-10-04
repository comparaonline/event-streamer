import { fromEvent, GroupedObservable, Observable } from 'rxjs';
import {
  map, groupBy, tap, flatMap
} from 'rxjs/operators';
import { ConsumerGroupStream, Message } from 'kafka-node';
import { Router } from '../../router';
import { EventEmitter } from 'events';
import { RawEvent } from '../../raw-event';
import { ConfigurationManager } from '../configuration-manager';
import { defaultLogger } from '../../lib/default-logger';
import { Databag } from '../../lib/databag';
import { Tracer } from '../../tracer';
import { BackpressureHandler } from './backpressure-handler';

const topicPartition = ({ topic, partition }: Message) => `${topic}:${partition}`;

export class EventConsumer extends EventEmitter {
  private consumerStream: ConsumerGroupStream;
  private backpressureHandler: BackpressureHandler;
  private tracer = Tracer.instance();

  constructor(
    private router: Router,
    private config: ConfigurationManager
  ) { super(); }

  start(): void {
    this.consumerStream = this.createStream();
    this.consumerStream.on('error', error => this.emit('error', error));
    this.backpressureHandler = new BackpressureHandler(
      this.consumerStream,
      this.config.backpressureOptions.pause,
      this.config.backpressureOptions.resume
    );
    this.processMessages();
    this.consumerStream.resume();

  }

  stop(): Promise<any> {
    return new Promise((resolve) => {
      this.consumerStream.close(() => {
        resolve('Consumer disconnected');
      });
    });
  }

  private processMessages() {
    fromEvent<Message>(this.consumerStream, 'data').pipe(
      this.backpressureHandler.increment(),
      Databag.wrap(),
      Databag.store('message'),
      groupBy(bag => topicPartition(bag.data)),
      map(partition => this.handlePartition(partition)),
      flatMap(partition => partition),
      Databag.swap<Message>('message'),
      Databag.inside(this.commit()),
      this.backpressureHandler.decrement(),
      Databag.unwrap()
    ).subscribe(
      message => this.emit('next', message),
      error => this.emit('error', error)
    );
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

  private handlePartition(partition: GroupedObservable<string, Databag<Message>>) {
    return partition.pipe(
      Databag.setMany({
        partition: partition.key,
        consumerGroup: this.config.consumerOptions.groupId
      }),
      this.before(),
      this.process(),
      this.after()
    );
  }

  private before() {
    return (obs: Observable<Databag<Message>>) => obs.pipe(
      Databag.inside(this.buildEvent()),
      this.setupTracer(),
      Databag.inside(this.log('Consuming'))
    );
  }
  setupTracer() {
    return (obs: Observable<Databag<RawEvent>>) => obs.pipe(
      Databag.setWithBag('context', bag => this.tracer.startTracing(bag.data)
        .set('partition', bag.get('partition'))
        .set('consumerGroup', bag.get('consumerGroup'))
      )
    );
  }

  trace<A>(eventName: string, event: 'next' | 'error' | 'complete' = 'next') {
    const handler = (data: Databag<A>) =>
      this.tracer.emit(eventName, data.get('context'));
    return tap(...['next', 'error', 'complete']
      .map(name => name !== event ? undefined : handler)
    );
  }

  private process() {
    return (obs: Observable<Databag<RawEvent>>) => obs.pipe(
      this.trace('process'),
      Databag.inside(this.router.route()),
      this.trace('process-finished'),
      this.trace('process-error', 'error')
    );
  }

  private after() {
    return <T>(obs: Observable<Databag<T>>) => obs.pipe(
      this.backpressureHandler.decrement()
    );
  }

  private log(message: string) {
    return tap((event: RawEvent) =>
      defaultLogger.debug(`${message} ${JSON.stringify(event)}`));
  }

  private commit() {
    return tap((message: Message) => {
      defaultLogger.debug(`Committing ${JSON.stringify(message)}`);
      return this.consumerStream.commit(message, true);
    });
  }

  private buildEvent() {
    return map((message: Message) => this.parseEvent(message.value.toString()));
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
