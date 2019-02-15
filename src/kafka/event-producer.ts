import { createWriteStream, ProducerStream } from 'node-rdkafka';
import { EventEmitter } from 'events';
import { KafkaOutputEvent } from './kafka-events';
import { RDKafkaConfiguration } from './interfaces/rdkafka-configuration';
import { EventProducerConfig } from './interfaces/event-producer-configuration';

export class EventProducer extends EventEmitter {
  private producerStream: ProducerStream;

  constructor(
    private config: EventProducerConfig,
    private rdConfig: RDKafkaConfiguration = {},
    private logger = config.logger
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
      this.logger.debug('Flushing producer');
      producer.flush(this.config.flushTimeout, (error) => {
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
        'metadata.broker.list': this.config.broker,
        ...this.rdConfig
      },
      {},
      {
        objectMode: true,
        connectOptions: { timeout: this.config.connectionTimeout }
      }
    );
    stream.producer.once('ready', () => {
      this.logger.info('Producer ready');
    });
    return stream;
  }
}
