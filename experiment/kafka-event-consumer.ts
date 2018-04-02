import {
  createReadStream, ConsumerStream, ConsumerStreamMessage
} from 'node-rdkafka';
import { Subject, Subscription } from 'rxjs';
import { EventEmitter } from 'events';

interface Partition {
  observer: Subject<ConsumerStreamMessage>;
  subscription: Subscription;
}

export interface KafkaEventConsumerConfig {
  kafkaBrokers: string;
  topics: string[];
}

export class KafkaEventConsumer extends EventEmitter {
  private globalConfig = {
    'group.id': 'test_consumer',
    'metadata.broker.list': '',
    'enable.auto.offset.store': false
  };
  private topicConfig = {
    'auto.offset.reset': 'beginning'
  };
  private streamOptions = {
    topics: [''],
    objectMode: true,
    connectOptions: { timeout: 1000 }
  };

  private consumerStream: ConsumerStream;
  private partitions = new Map<number, Partition>();

  constructor(broker: string, topics: string[]) {
    super();
    this.globalConfig['metadata.broker.list'] = broker;
    this.streamOptions.topics = topics;
  }

  start() {
    this.consumerStream = this.createStream();
    this.consumerStream.on('error', (error) => {
      this.emit('error', error);
    });
    this.consumerStream.on('data', (message: ConsumerStreamMessage) => {
      this.dispatch(message);
    });
  }

  stop() {
    this.partitions.forEach(p => p.subscription.unsubscribe());
    return this.closeStream();
  }

  dispatch(message: ConsumerStreamMessage) {
    const partition = this.getPartition(message.partition);
    partition.observer.next(message);
  }

  private createStream(): ConsumerStream {
    const stream = createReadStream(
      this.globalConfig,
      this.topicConfig,
      this.streamOptions
    );
    stream.consumer.once('ready', () => {
      console.log(`Consumer ready. Consuming ${this.streamOptions.topics.join(', ')}`);
    });
    return stream;
  }

  private closeStream() {
    return new Promise((resolve) => {
      this.consumerStream.close(() => {
        resolve('Consumer disconnected');
      });
    });
  }

  private getPartition(partitionIdx): Partition {
    let partition = this.partitions.get(partitionIdx);
    if (!partition) {
      partition = this.initPartition(partitionIdx);
      this.partitions.set(partitionIdx, partition);
    }
    return partition;
  }

  private initPartition(partitionIdx): Partition {
    const observer = new Subject<ConsumerStreamMessage>();
    const subscription = observer
      .concatMap(message => processMessage(message))
      .subscribe(
        message => this.commit(message),
        error => this.emit('error', error)
      );
    return { observer, subscription };
  }

  private commit(message: ConsumerStreamMessage) {
    console.log(`Committing ${message.value}`);
    const consumer = this.consumerStream.consumer;
    if (consumer.isConnected()) {
      consumer.commitMessage(message);
    }
  }
}

function processMessage(message: ConsumerStreamMessage): Promise<ConsumerStreamMessage> {
  // const value = message.value.toString();
  const timeout = Math.floor(Math.random() * Math.floor(10)) * 1000;
  console.log(`Start processing ${message.value}, timeout ${timeout / 1000}`);
  return new Promise((resolve, reject) => {
    const wait = setTimeout(
      () => {
        clearTimeout(wait);
        if (message.value.toString() === '0-2') {
          return reject(`Error with ${message.value}`);
        }
        console.log(`Processed ${message.value}`);
        resolve(message);
      },
      timeout
    );
  });
}
