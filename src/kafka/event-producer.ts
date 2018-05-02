import { createWriteStream, ProducerStream } from 'node-rdkafka';
import { EventEmitter } from 'events';
import { KafkaOutputEvent } from './kafka-events';

const FLUSH_TIMEOUT = 2000;
const CONNECT_TIMEOUT = 1000;

export interface EventProducerConfig {
  groupId: string;
  broker: string;
  defaultTopic?: string;
}

export class EventProducer extends EventEmitter {
  private config: EventProducerConfig;
  private producerStream: ProducerStream;

  constructor(config: EventProducerConfig) {
    super();
    this.config = config;
  }

  start(): void {
    this.producerStream = this.createStream();
    this.producerStream.on('error', error => this.emit('error', error));
  }

  stop(): Promise<any> {
    return new Promise((resolve) => {
      this.producerStream.close(() => {
        resolve('Producer disconnected');
      });
    });
  }

  produce(event: KafkaOutputEvent) {
    try {
      return this.producerStream.write({
        topic: event.topic || this.config.defaultTopic,
        partition: null,
        value: new Buffer(event.toString()),
        key: event.key,
        timestamp: Date.now()
      });
    } catch (error) {
      this.emit(error);
    }
  }

  flush() {
    return new Promise((resolve, reject) => {
      const producer = this.producerStream.producer;
      if (!producer.isConnected()) {
        return reject('Producer not connected');
      }
      console.debug('Flushing producer');
      producer.flush(FLUSH_TIMEOUT, (error) => {
        if (error) {
          return reject(error);
        }
        resolve();
      });
    });
  }

  private createStream(): ProducerStream {
    const stream = createWriteStream(
      {
        'group.id': this.config.groupId,
        'metadata.broker.list': this.config.broker
      },
      {},
      {
        objectMode: true,
        connectOptions: { timeout: CONNECT_TIMEOUT }
      }
    );
    stream.producer.once('ready', () => {
      console.info('Producer ready');
    });
    return stream;
  }
}
