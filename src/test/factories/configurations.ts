import { ConsumerGroupStreamOptions, KafkaClientOptions, ProducerOptions } from 'kafka-node';

type ConsumerConfig = [
  ConsumerGroupStreamOptions,
  string[]
];
type ProducerConfig = [
  KafkaClientOptions,
  ProducerOptions,
  string
];
type ServerConfig = [
  ConsumerGroupStreamOptions,
  KafkaClientOptions,
  ProducerOptions,
  string[],
  string
];

export const consumerConfig: ConsumerConfig = [
  {
    groupId: 'testGroupId',
    kafkaHost: 'test-host:9092'
  },
  ['test-consumer-topic1', 'test-consumer-topic2']
];

export const producerConfig: ProducerConfig = [
  {
    kafkaHost: 'test-host:9092'
  },
  {},
  'test-producer-topic'
];

export const kafkaServerConfig: ServerConfig = [
  consumerConfig[0],
  producerConfig[0],
  producerConfig[1],
  consumerConfig[1],
  producerConfig[2]
];

