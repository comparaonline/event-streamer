import { InitialOffset } from './initial-offset';

export interface KafkaConfiguration {
  groupId: string;
  broker: string;
  consumerTopics: string[];
  producerTopic?: string;
  initialOffset?: InitialOffset;
  connectionTimeout?: number;
  flushTimeout?: number;
}
