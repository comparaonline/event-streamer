import {
  createReadStream, ConsumerStream, ConsumerStreamMessage
} from 'node-rdkafka';
import { Subject } from 'rxjs';
import { concatMap, map } from 'rxjs/operators';
import { Router } from '../router';
import { EventEmitter } from 'events';
import { RawEvent } from '../events';
import { EventConsumerConfiguration } from './interfaces/event-consumer-configuration';
import { Partition } from './interfaces/partition';
import { InitialOffset } from './interfaces/initial-offset';
import { RDKafkaConfiguration } from './interfaces/rdkafka-configuration';
import * as opentracing from 'opentracing';

const APM_TYPE = 'KafkaEventConsume';
const key = ({ topic, partition }: ConsumerStreamMessage) => `${topic}:${partition}`;

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
    const partition = this.getPartition(key(message));
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
        connectOptions: { timeout: this.config.connectionTimeout }
      }
    );
    stream.consumer.once('ready', () => {
      this.logger.info(`Consumer ready. Topics: ${this.config.topics.join(', ')}`);
    });
    return stream;
  }

  private getPartition(key: string): Partition {
    let partition = this.partitions.get(key);
    if (!partition) {
      partition = this.initPartition();
      this.partitions.set(key, partition);
    }
    return partition;
  }

  private initPartition(): Partition {
    const observer = new Subject<ConsumerStreamMessage>();
    const subscription = observer.pipe(
      map(message => this.consume(message)),
      concatMap(result => result)
    ).subscribe(
        message => this.commit(message),
        error => this.emit('error', error)
      );
    return { observer, subscription };
  }

  private consume(message: ConsumerStreamMessage): Promise<ConsumerStreamMessage> {
    const event = this.parseEvent(message);
    const span = this.startSpan(event, message.topic);
    this.logger.debug(`Consuming ${JSON.stringify(event)}`);
    return this.router.route(event)
      .then(() => {
        span.finish();
        return message;
      })
      .catch((error) => {
        span.setTag(opentracing.Tags.ERROR, true);
        span.log({
          event: 'error',
          'error.object': error,
          message: error.message,
          stack: error.stack
        });
        span.finish();
        throw error;
      });
  }

  private parseEvent(message: ConsumerStreamMessage): RawEvent {
    try {
      return JSON.parse(message.value.toString());
    } catch (error) {
      this.logger.error(`Omitted message. Unable to parse: ${JSON.stringify(message)}. ${error}`);
      return { code: '' };
    }
  }

  private commit(message: ConsumerStreamMessage) {
    this.logger.debug(`Committing ${message.value}`);
    const consumer = this.consumerStream.consumer;
    if (consumer.isConnected()) {
      consumer.commitMessage(message);
    }
  }

  private startSpan(event: RawEvent, topic: string) : opentracing.Span {
    const tracer = opentracing.globalTracer();
    return tracer.startSpan(
      event.code,
      {
        tags: {
          topic,
          type: APM_TYPE,
          'service.name': `${this.config.projectName}-events`
        }
      }
    );
  }
}
