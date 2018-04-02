import { createWriteStream, ProducerStream } from 'node-rdkafka';
import { EventEmitter } from 'events';

export interface KafkaEventProducerConfig {
  kafkaBrokers: string;
}

export class KafkaEventProducer extends EventEmitter {
  private globalConfig = {
    'group.id': 'test_producer',
    'metadata.broker.list': ''
  };
  private topicConfig = {};
  private streamOptions = {
    objectMode: true,
    connectOptions: { timeout: 1000 }
  };

  private producerStream: ProducerStream;

  constructor(broker: string) {
    super();
    this.globalConfig['metadata.broker.list'] = broker;
  }

  start() {
    this.producerStream = this.createStream();
    this.producerStream.on('error', (error) => {
      this.emit('error', error);
    });
  }

  stop() {
    return new Promise((resolve) => {
      this.producerStream.close(() => {
        resolve('Producer disconnected');
      });
    });
  }

  produce(topic, partIdx, idx) {
    const message = `${partIdx}-${idx}`;
    console.log(message);
    try {
      return this.producerStream.write({
        topic,
        partition: partIdx,
        value: new Buffer(message),
        key: `${partIdx}`,
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
      console.log('Flushing producer');
      producer.flush(2000, (error) => {
        if (error) {
          return reject(error);
        }
        resolve();
      });
    });
  }

  private createStream(): ProducerStream {
    const stream = createWriteStream(
      this.globalConfig,
      this.topicConfig,
      this.streamOptions
    );
    stream.producer.once('ready', () => {
      console.log(`Producer ready`);
    });
    return stream;
  }

  private closeStream() {
    return new Promise((resolve) => {
      this.producerStream.close(() => {
        resolve('Producer disconnected');
      });
    });
  }
}
