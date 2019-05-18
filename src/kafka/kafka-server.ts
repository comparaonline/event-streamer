import { Server } from '../server';
import { Router } from '../router';
import { OutputEvent } from '../events';
import { EventConsumer } from './event-consumer';
import { EventProducer } from './event-producer';
import { Configuration } from './interfaces/configuration';
import { ConfigurationManager } from './configuration-manager';

export class KafkaServer extends Server {
  constructor(
    router: Router,
    settings: Configuration,
    config = new ConfigurationManager(settings),
    private consumer = new EventConsumer(router, config),
    private producer = new EventProducer(config)
  ) { super(router); }

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
