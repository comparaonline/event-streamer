import { GlobalConfig } from './global-config';
export interface ConsumerConfig extends Partial<GlobalConfig> {
  groupId: string;
  topics: string[];
}
