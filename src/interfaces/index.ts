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
export type Strategy = 'topic' | 'one-by-one' | 'at-least-once';

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
  };
  /** This is required if you want to create a consumer */
  consumer?: {
    groupId: string;
    /**
     * How messages are dispatched, and -- the part that matters on a restart -- when their offset is
     * allowed to advance.
     *
     * 'topic': concurrent per topic, but the offset advances as soon as a message is queued. A handler
     * killed mid-write takes its message with it, because Kafka already considers it delivered.
     *
     * 'one-by-one': one message at a time, offset advances after the handler returns. Safe, and as slow
     * as the handler.
     *
     * 'at-least-once': concurrent like 'topic', with the offset advancing only over messages whose
     * handler actually finished. Anything still running when the process dies is redelivered instead of
     * lost, so handlers must tolerate seeing a message twice.
     *
     * Default topic
     */
    strategy?: Strategy;
    /** How many messages will be processed at the same time in a single topic. Default 20 */
    maxMessagesPerTopic?: number | Unlimited;
    /** Object with topic-name as key and number of messages to be processed as value */
    maxMessagesPerSpecificTopic?: Record<string, number | Unlimited>;
    /**
     * How long stop() waits for the messages already in flight to finish before disconnecting
     * anyway. Keep it below the pod's remaining terminationGracePeriodSeconds, otherwise the
     * SIGKILL arrives first and the wait buys nothing. Default 10000 ms
     */
    shutdownTimeoutMs?: number;
  };
  debug?: false | Debug;
  kafkaJSLogs?: logLevel;
  /** set to true if you want to avoid connecting to kafka and make some functionalities available */
  onlyTesting?: boolean;
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
