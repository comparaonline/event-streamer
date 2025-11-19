import { CompressionTypes, logLevel, RetryOptions, DefaultPartitioner, LegacyPartitioner } from 'kafkajs';

export type Unlimited = 'unlimited';
export type Strategy = 'topic' | 'one-by-one';

export interface Config {
  host: string;
  appName?: string;
  /** Only set this if you need change producer configuration */
  producer?: {
    /** Connection keep alive after send messages to reuse it. Default 5000 ms */
    connectionTTL?: number;
    additionalHosts?: string[];
    retryOptions?: RetryOptions;
    /** Default will be none, GZIP doesn't need further config  */
    compressionType?: CompressionTypes;
    /** EXPERIMENTAL: default false */
    idempotent?: boolean;
    partitioners?: DefaultPartitioner | LegacyPartitioner;
    /** Enable Schema Registry for new events. Default: false */
    useSchemaRegistry?: boolean;
  };
  /** This is required if you want to create a consumer */
  consumer?: {
    groupId: string;
    /** Chose if you want to create topic queues or process all the messages in a single queue 1 by 1. Default topic  */
    strategy?: Strategy;
    /** How many messages will be processed at the same time in a single topic. Default 20 */
    maxMessagesPerTopic?: number | Unlimited;
    /** Object with topic-name as key and number of messages to be processed as value */
    maxMessagesPerSpecificTopic?: Record<string, number | Unlimited>;
  };
  /** Schema Registry configuration - services provide credentials */
  schemaRegistry?: {
    url: string;
    auth?: {
      username: string;
      password: string;
    };
  };
  kafkaJSLogs?: logLevel;
  /** set to true if you want to avoid connecting to kafka and make some functionalities available */
  onlyTesting?: boolean;
  /** Enable runtime deprecation warnings for legacy APIs. Default: false */
  showDeprecationWarnings?: boolean;
}



interface OutputData {
  createdAt?: string;
  [keys: string]: unknown;
}

export interface Output {
  topic: string;
  /** This should be UpperCamelCase, but if it is kebab case it will be converted */
  eventName?: string;
  data: OutputData | OutputData[];
}

export interface Input {
  code?: string;
}

export type Callback<T extends Input> = (input: T, emit: (message: Output) => Promise<unknown>) => Promise<void> | void;

export interface Route {
  topic: string;
  eventName?: string;
  callback: Callback<Input>;
}
