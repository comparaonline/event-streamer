import { CompressionTypes, logLevel, RetryOptions, DefaultPartitioner, LegacyPartitioner } from 'kafkajs';

export enum Debug {
  NONE = 6,
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5
}

export type Unlimited = 'unlimited';
export type Strategy = 'topic' | 'one-by-one';

export interface Config {
  host: string;
  appName?: string;
  /** Only set this if you need change producer configuration */
  producer?: {
    /** Opt-in: use Schema Registry-based producer. Default false */
    useSchemaRegistry?: boolean;
    /** Connection keep alive after send messages to reuse it. Default 5000 ms */
    connectionTTL?: number;
    additionalHosts?: string[];
    retryOptions?: RetryOptions;
    /** Default will be none, GZIP doesn't need further config  */
    compressionType?: CompressionTypes;
    /** EXPERIMENTAL: default false */
    idempotent?: boolean;
    partitioners?: DefaultPartitioner | LegacyPartitioner;
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
  debug?: false | Debug;
  kafkaJSLogs?: logLevel;
  /** set to true if you want to avoid connecting to kafka and make some functionalities available */
  onlyTesting?: boolean;
  /** Enable runtime deprecation warnings for legacy APIs. Default: false */
  showDeprecationWarnings?: boolean;
  /** Schema Registry configuration (required when using SR producer/consumer) */
  schemaRegistry?: {
    url: string;
    auth?: {
      username: string;
      password: string;
    };
  };
}

interface OutputData {
  createdAt?: string;
  [keys: string]: any;
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

export type Callback<T extends Input> = (input: T, emit: (message: Output) => Promise<any>) => Promise<void> | void;

export interface Route {
  topic: string;
  eventName?: string;
  callback: Callback<any>;
}
