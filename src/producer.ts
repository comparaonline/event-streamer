import { createWriteStream, ProducerStream } from 'node-rdkafka';
import { EventEmitter } from 'events';

import { OutputEvent } from './events';

const FLUSH_TIMEOUT = 2000;
const CONNECT_TIMEOUT = 1000;

export interface ProducerConfig {
  groupId: string;
  broker: string;
  defaultTopic?: string;
}

export class Producer extends EventEmitter {
  private config: ProducerConfig;
  private stream: ProducerStream;

  constructor(config: ProducerConfig) {
    super();
    this.config = config;
  }

  start(): Promise<string> {
    this.stream = this.createStream();
    this.stream.on('error', error => this.emit('error', error));
    return new Promise((resolve) => {
      this.stream.producer.once('ready', () => {
        resolve('Producer ready');
      });
    });
  }

  stop(): Promise<string> {
    return new Promise((resolve) => {
      this.stream.close(() => {
        resolve('Producer disconnected');
      });
    });
  }

  produce<T extends OutputEvent>(event: T): boolean {
    try {
      return this.stream.write({
        topic: event.topic || this.config.defaultTopic,
        partition: null,
        value: new Buffer(event.toString()),
        key: event.key,
        timestamp: Date.now()
      });
    } catch (error) {
      this.emit(error);
      return false;
    }
  }

  flush(): Promise<any> {
    return new Promise((resolve, reject) => {
      const producer = this.stream.producer;
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
    return createWriteStream(
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
  }
}
