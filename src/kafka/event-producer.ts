import { ProducerStream, ProducerStreamOptions } from 'kafka-node';
import { EventEmitter } from 'events';
import { KafkaOutputEvent } from './kafka-events';

export class EventProducer extends EventEmitter {
  private producerStream: ProducerStream;

  constructor(
    private config: ProducerStreamOptions,
    private defaultTopic: string
  ) { super(); }

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
        topic: event.topic || this.defaultTopic,
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
      console.debug('Closing producer');
      this.producerStream.end((error: Error) => error ? reject(error) : resolve());
    });
  }

  private createStream(): ProducerStream {
    const stream = new ProducerStream(this.config);
    stream.once('ready', () => {
      console.info('Producer ready');
    });
    return stream;
  }
}
