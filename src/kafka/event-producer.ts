import * as opentracing from 'opentracing';
import {
  KafkaClient, HighLevelProducer
} from 'kafka-node';
import { EventEmitter } from 'events';
import { KafkaOutputEvent } from './kafka-events';
import { clientOptions } from './client-options';
import { promisify } from 'util';
import { ConfigurationManager } from './configuration-manager';
import { defaultLogger } from '../lib/default-logger';
import { of } from 'rxjs';
import { backoff } from '@comparaonline/backoff';
import { tap, flatMap } from 'rxjs/operators';

interface Message {
  topic: string;
  messages: string;
  key: string | undefined;
}
type ProducerFn = (_: Message[]) => Promise<void>;

const tracer = opentracing.globalTracer();
export class EventProducer extends EventEmitter {
  private producer: HighLevelProducer;

  constructor(
    private config: ConfigurationManager
  ) { super(); }

  start(): void {
    const client = new KafkaClient(clientOptions(this.config.kafkaClientOptions));
    this.producer = new HighLevelProducer(client, this.config.producerOptions);
  /* istanbul ignore next */
    this.producer.on('ready', () => {
      defaultLogger.info(`Producer ready. Default topic: ${this.config.producerTopic}`);
    });
  }

  stop(): Promise<any> {
    return new Promise((resolve) => {
      this.producer.close(() => {
        resolve('Producer disconnected');
      });
    });
  }

  produce(event: KafkaOutputEvent, span?: opentracing.Span): Promise<void> {
    const produceSpan = this.createSpan(event, span);
    event._span = span;
    const { retries, delay } = this.config.retryOptions;
    const produce = promisify<ProducerFn>(this.producer.send.bind(this.producer));
    return of(this.message(event)).pipe(
      flatMap(msg => produce(msg)),
      backoff(retries, delay),
      tap(undefined, /* istanbul ignore next */ (error) => {
        produceSpan.setTag(opentracing.Tags.ERROR, true);
        produceSpan.log({
          event: 'error',
          'error.object': error,
          message: error.message,
          stack: error.stack
        });
      }),
      tap(() => produceSpan.finish())
    ).toPromise();
  }

  private createSpan(event: KafkaOutputEvent, childOf?: opentracing.Span) {
    return tracer.startSpan('event-streamer.event-producer.produce', {
      childOf,
      tags: {
        topic: event.topic || this.config.producerTopic,
        'resource.name': event.code,
        'kafka.event': event,
        'span.type': 'Custom',
        [opentracing.Tags.SPAN_KIND]: opentracing.Tags.SPAN_KIND_MESSAGING_PRODUCER
      }
    });
  }

  private message(event: KafkaOutputEvent): Message[] {
    return [{
      topic: event.topic || this.config.producerTopic,
      messages: event.toString(),
      key: event.key
    }];
  }
}
