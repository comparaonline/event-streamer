import { fromEvent, Observable, OperatorFunction } from 'rxjs';
import {
  map, groupBy, tap, flatMap
} from 'rxjs/operators';
import { ConsumerGroupStream, Message } from 'kafka-node';
import { Router } from '../../router';
import { EventEmitter } from 'events';
import { ConfigurationManager } from '../configuration-manager';
import { defaultLogger } from '../../lib/default-logger';
import { Databag } from '../../lib/databag';
import { BackpressureHandler } from './backpressure-handler';
import { PartitionHandler } from './partition-handler';

const topicPartition = ({ topic, partition }: Message) => `${topic}:${partition}`;

export class EventConsumer extends EventEmitter {
  private consumerStream: ConsumerGroupStream;
  private backpressureHandler: BackpressureHandler;
  private partitionHandler: PartitionHandler;

  constructor(
    private router: Router,
    private config: ConfigurationManager
  ) { super(); }

  start(): void {
    const { pause, resume } = this.config.backpressureOptions;
    const { groupId } = this.config.consumerOptions;
    this.consumerStream = this.createStream();
    this.backpressureHandler = new BackpressureHandler(this.consumerStream, pause, resume);
    this.partitionHandler = new PartitionHandler(groupId, this.router);
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
      this.processPartition(),
      Databag.swap<Message>('message'),
      Databag.inside(this.commit()),
      this.backpressureHandler.decrement(),
      Databag.unwrap()
    ).subscribe(
      message => this.emit('next', message),
      error => this.emit('error', error)
    );
  }

  private processPartition(): OperatorFunction<Databag<Message>, Databag<unknown>> {
    return (obs: Observable<Databag<Message>>) => obs.pipe(
      groupBy(bag => topicPartition(bag.data)),
      map(partition => this.partitionHandler.handle(partition)),
      flatMap(partition => partition)
    );
  }

  private createStream(): ConsumerGroupStream {
    const topics = this.config.consumerTopics;
    const stream = new ConsumerGroupStream(this.config.consumerOptions, topics);
    /* istanbul ignore next */
    stream.on('ready', () => {
      defaultLogger.info(`Consumer ready. Topics: ${topics.join(', ')}`);
    });
    stream.on('error', error => this.emit('error', error));
    return stream;
  }

  private commit() {
    return tap((message: Message) => {
      defaultLogger.debug(`Committing ${JSON.stringify(message)}`);
      return this.consumerStream.commit(message, true);
    });
  }
}
