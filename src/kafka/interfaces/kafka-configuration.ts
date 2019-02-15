import { InitialOffset } from './initial-offset';
import { RDKafkaConfiguration } from './rdkafka-configuration';
import { Logger } from './logger';

export interface KafkaConfiguration {
  logger: Logger;
  groupId: string;
  broker: string;
  consumerTopics: string[];
  producerTopic: string;
  initialOffset: InitialOffset;
  connectionTimeout: number;
  flushTimeout: number;
  rdConfig: RDKafkaConfiguration;
}
