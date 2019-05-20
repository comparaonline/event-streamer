import { Server } from '../server';
import { Router } from '../router';
import { OutputEvent } from '../events';
import { EventConsumer } from './event-consumer';
import { EventProducer } from './event-producer';
import { Configuration } from './interfaces/configuration';
import { ConfigurationManager } from './configuration-manager';
import { defaultLogger, setLogger } from '../lib/default-logger';

export class KafkaServer extends Server {
  private consumer: EventConsumer;
  private producer: EventProducer;
  constructor(
    router: Router,
    settings: Configuration,
    logger = defaultLogger
  ) {
    super(router);
    setLogger(logger);
    const config = new ConfigurationManager(settings);
    this.consumer = new EventConsumer(router, config);
    this.producer = new EventProducer(config);
  }

  start() {
    this.consumer.start();
    this.consumer.on('error', error => this.emit('error', error));
    this.producer.start();
  }

  stop(): Promise<string[]> {
    return Promise.all([this.consumer.stop(), this.producer.stop()]);
  }

  output(event: OutputEvent) {
    return this.producer.produce(event);
  }
}
