import { InitialOffset } from './initial-offset';
import { Logger } from './logger';

export interface EventConsumerConfiguration {
  logger: Logger;
  groupId: string;
  broker: string;
  topics: string[];
  initialOffset: InitialOffset;
  connectionTimeout: number;
}
