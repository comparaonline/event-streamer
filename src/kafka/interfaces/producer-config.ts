import { GlobalConfig } from './global-config';

export interface ProducerConfig extends Partial<GlobalConfig> {
  defaultTopic: string;
  partitioner?: 0 | 1 | 2 | 3;
}
