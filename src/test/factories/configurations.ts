import { Configuration } from '../../kafka/interfaces/configuration';
import { ConfigurationManager } from '../../kafka/configuration-manager';

export const configuration: Configuration = {
  global: {
    kafkaHost: 'test-host:9092'
  },
  consumer: {
    groupId: 'testGroupId',
    topics: ['test-consumer-topic1', 'test-consumer-topic2'],
    backpressure: {
      pause: 3,
      resume: 2
    }
  },
  producer: {
    defaultTopic: 'test-producer-topic'
  }
};

export const configurationManager = new ConfigurationManager(configuration);
