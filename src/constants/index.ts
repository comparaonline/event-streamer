import { logLevel } from 'kafkajs';
import { Strategy } from '../interfaces';

interface Default {
  maxMessagesPerTopic: number;
  onlyTesting: boolean;
  connectionTTL: number;
  strategy: Strategy;
  kafkaJSLogs: logLevel;
}

export const DEFAULT_CONFIG: Default = {
  maxMessagesPerTopic: 20,
  onlyTesting: false,
  connectionTTL: 5000,
  strategy: 'topic',
  kafkaJSLogs: logLevel.NOTHING
};
