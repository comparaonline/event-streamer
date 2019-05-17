import { ConsumerGroupStreamOptions, KafkaClientOptions, ProducerOptions } from 'kafka-node';

type TestConfig = [
  ConsumerGroupStreamOptions,
  KafkaClientOptions,
  ProducerOptions,
  string[],
  string
];

export const testConfig: TestConfig = [
  {
    groupId: 'testGroupId',
    kafkaHost: 'test-host:9092'
  },
  {
    kafkaHost: 'test-host:9092'
  },
  {},
  ['test-consumer-topic1', 'test-consumer-topic2'],
  'test-producer-topic'
];
