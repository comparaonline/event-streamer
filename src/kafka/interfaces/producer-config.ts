import { GlobalConfig } from './global-config';

export interface ProducerConfig extends Partial<GlobalConfig> {
  defaultTopic: string;
}
