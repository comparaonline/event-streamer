import { Logger } from './logger';

export interface EventProducerConfig {
  logger: Logger;
  groupId: string;
  broker: string;
  defaultTopic?: string;
  connectionTimeout: number;
  flushTimeout: number;
}
