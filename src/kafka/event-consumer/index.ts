import * as opentracing from 'opentracing';
import { fromEvent, Observable, MonoTypeOperatorFunction } from 'rxjs';
import { map, groupBy, tap, flatMap } from 'rxjs/operators';
import { ConsumerGroupStream, Message } from 'kafka-node';
import { Router } from '../../router';
import { EventEmitter } from 'events';
import { ConfigurationManager } from '../configuration-manager';
import { defaultLogger } from '../../lib/default-logger';
import { Databag } from '../../lib/databag';
import { BackpressureHandler } from './backpressure-handler';
import { PartitionHandler } from './partition-handler';
import { tryParse } from '../../lib/try-parse';

const topicPartition = ({ topic, partition }: Message) => `${topic}:${partition}`;
const tracer = opentracing.globalTracer();
export class EventConsumer extends EventEmitter {
  private consumerStream: ConsumerGroupStream;
  private backpressureHandler: BackpressureHandler;
  private partitionHandler: PartitionHandler;

  constructor(
    private router: Router,
    private config: ConfigurationManager
  ) { super(); }

  start(): void {
    const { pause, resume, topMB } = this.config.backpressureOptions;
    const { groupId } = this.config.consumerOptions;

    /* istanbul ignore next */
    if (!this.config.consumerEnabled) return;

    this.consumerStream = this.createStream();
    this.backpressureHandler = new BackpressureHandler(
      this.consumerStream, pause, resume, topMB
    );
    // this.backpressureHandler.handle();
    this.partitionHandler = new PartitionHandler(groupId, this.router);
    this.processMessages();
    this.consumerStream.resume();
  }

  stop(): Promise<any> {
    return new Promise((resolve) => {
      /* istanbul ignore next */
      if (!this.config.consumerEnabled) {
        return resolve('Consumer disabled');
      }
      this.consumerStream.close(() => {
        resolve('Consumer disconnected');
      });
    });
  }

  private processMessages() {
    fromEvent<Message>(this.consumerStream, 'data').pipe(
      this.backpressureHandler.increment(),
      Databag.wrap(),
      this.startTracing(),
      this.processPartition(),
      Databag.inside(this.commit()),
      this.backpressureHandler.decrement(),
      this.finishTracing(),
      this.emitErrors(),
      Databag.unwrap()
    ).subscribe(
        (message: any) => this.emit('next', message)
    );
  }

  private emitErrors() {
    return tap(undefined, (databag: Databag<Error>) => {
      const error = databag.data;
      const event = databag.get('event');
      this.emit('error', error, event);
    });
  }
  private startTracing(): MonoTypeOperatorFunction<Databag<Message>> {
    return tap((databag) => {
      const message = databag.data;
      const event = tryParse(message.value.toString(), { code: 'unknown' });
      const span = tracer.startSpan('event-streamer.event-consumer.consume', {
        references: [this.getParentSpan(message)]
          .filter((span): span is opentracing.SpanContext => span !== undefined)
          .map(span => opentracing.followsFrom(span)),
        tags: {
          topic: message.topic,
          'service.name': this.config.consumerOptions.groupId,
          'resource.name': event.code,
          'kafka.event': event,
          'span.type': 'Custom',
          [opentracing.Tags.SPAN_KIND]: opentracing.Tags.SPAN_KIND_MESSAGING_CONSUMER
        }
      });
      databag.set('span', span);
    });
  }

  private getParentSpan(message: Message) {
    const parsed = tryParse(message.value.toString(), { _span: undefined });
    /* istanbul ignore next */
    return tracer.extract(opentracing.FORMAT_TEXT_MAP, parsed._span || '') || undefined;
  }

  private finishTracing(): MonoTypeOperatorFunction<Databag<Message>> {
    return (obs: Observable<Databag<Message>>) => obs.pipe(
      tap(undefined, (databag: Databag<Error>) => {
        const error = databag.data;
        const span: opentracing.Span = databag.get('span');
        span.setTag(opentracing.Tags.ERROR, true);
        span.log({
          event: 'error',
          'error.object': error,
          message: error.message,
          stack: error.stack
        });
      }),
      tap(
        (databag: Databag<any>) => databag.get<opentracing.Span>('span').finish(),
        (databag: Databag<any>) => databag.get<opentracing.Span>('span').finish()
      )
    );
  }

  private processPartition(): MonoTypeOperatorFunction<Databag<Message>> {
    return (obs: Observable<Databag<Message>>) => obs.pipe(
      Databag.store('message'),
      groupBy(bag => topicPartition(bag.data)),
      map(partition => this.partitionHandler.handle(partition)),
      flatMap(partition => partition),
      Databag.swap<Message>('message')
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
