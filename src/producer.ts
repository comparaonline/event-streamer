import { createWriteStream, ProducerStream } from 'node-rdkafka';

import { OutputEvent } from './events';

const FLUSH_TIMEOUT = 2000;
const CONNECT_TIMEOUT = 1000;

export interface ProducerConfig {
  groupId: string;
  broker: string;
  defaultTopic: string;
  onError: (error: Error) => any;
}

export class Producer {
  private config: ProducerConfig;
  private stream: ProducerStream;

  constructor(config: ProducerConfig) {
    this.config = config;
  }

  start(): Promise<string> {
    return new Promise((resolve) => {
      this.stream = this.createStream();
      this.stream.on('error', error => this.config.onError(error));
      this.stream.producer.once('ready', () => {
        resolve('Producer ready');
      });
    });
  }

  stop(): Promise<string> {
    return new Promise((resolve) => {
      if (!this.isConnected()) {
        return resolve('Producer disconnected');
      }
      this.stream.close(() => resolve('Producer disconnected'));
    });
  }

  produce<T extends OutputEvent>(event: T): boolean {
    return this.stream.write({
      topic: event.topic || this.config.defaultTopic,
      partition: null,
      value: new Buffer(event.toString()),
      key: event.key,
      timestamp: Date.now()
    });
  }

  flush(): Promise<any> {
    return new Promise((resolve, reject) => {
      const producer = this.stream.producer;
      if (!this.isConnected()) {
        return reject('Producer not connected');
      }
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

  private isConnected(): boolean {
    return this.stream &&
      this.stream.producer &&
      this.stream.producer.connectedTime() > 0;
  }
}
