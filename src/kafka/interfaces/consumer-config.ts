import { GlobalConfig } from './global-config';
import { BackpressureConfig } from './backpressure-config';
export interface ConsumerConfig extends Partial<GlobalConfig> {
  groupId: string;
  topics: string[];
  backpressure?: BackpressureConfig;
}
