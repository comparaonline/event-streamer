import { ProducerConfig } from './producer-config';
import { ConsumerConfig } from './consumer-config';
import { GlobalConfig } from './global-config';
export interface Configuration {
  global: GlobalConfig;
  consumer: ConsumerConfig;
  producer: ProducerConfig;
}
