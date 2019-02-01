import { InitialOffset } from './initial-offset';

export interface EventConsumerConfiguration {
  groupId: string;
  broker: string;
  topics: string[];
  initialOffset: InitialOffset;
}
