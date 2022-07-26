import { CompressionTypes, LegacyPartitioner, logLevel, DefaultPartitioner, Partitioners } from 'kafkajs';
import { Strategy } from '../interfaces';

interface Default {
  maxMessagesPerTopic: number;
  onlyTesting: boolean;
  connectionTTL: number;
  strategy: Strategy;
  kafkaJSLogs: logLevel;
  compressionType: CompressionTypes;
  producerIdempotent: boolean;
  partitioners: DefaultPartitioner | LegacyPartitioner;
}

export const DEFAULT_CONFIG: Default = {
  maxMessagesPerTopic: 20,
  onlyTesting: false,
  connectionTTL: 5000,
  strategy: 'topic',
  kafkaJSLogs: logLevel.NOTHING,
  compressionType: CompressionTypes.None,
  producerIdempotent: false,
  partitioners: Partitioners.LegacyPartitioner
};
