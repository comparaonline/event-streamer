import { RetryOptions } from 'kafka-node';

export enum ProducerPartitionerType {
  DEFAULT = 0,
  RANDOM = 1,
  CYCLIC = 2,
  KEYED = 3,
  CUSTOM = 4
}

export enum Debug {
  NONE = 6,
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5
}

export interface Config {
  host: string;
  /** Only set this if you need change producer configuration */
  producer?: {
    /** Default is CYCLIC (2) */
    partitionerType?: ProducerPartitionerType;
    /** Connection keep alive after send messages to reuse it. Default 5000 ms */
    connectionTTL?: number;
    additionalHosts?: string[];
    retryOptions?: RetryOptions;
  };
  /** This is required if you want to create a consumer */
  consumer?: {
    groupId: string;
    /** By default this library will handle it with autoCommit on false */
    autoCommit?: boolean;
    /** Default will be 3MB */
    fetchSizeInMB?: number;
  };
  debug?: false | Debug;
  /** set to true if you want to avoid connecting to kafka and make some functionalities available */
  onlyTesting?: boolean;
}

export interface Output {
  topic: string;
  /** This should be UpperCamelCase, but if it is kebab case it will be converted */
  eventName?: string;
  data: Object | Object[];
}

export interface Input {
  code?: string;
}

export type Callback<T extends Input> = (input: T, emit: (message: Output) => Promise<any>) => void;

export interface Route {
  topic: string;
  eventName?: string;
  callback: Callback<any>;
}
