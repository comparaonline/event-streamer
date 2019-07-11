import { GlobalConfig } from './global-config';
import { ProducerRetryOptions } from './producer-retry-options';

export interface ProducerConfig extends Partial<GlobalConfig> {
  defaultTopic: string;
  partitioner?: 0 | 1 | 2 | 3;
  retry?: ProducerRetryOptions;
}
