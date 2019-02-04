export interface EventProducerConfig {
  groupId: string;
  broker: string;
  defaultTopic?: string;
  connectionTimeout: number;
  flushTimeout: number;
}
