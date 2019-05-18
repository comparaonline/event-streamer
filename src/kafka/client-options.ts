import { KafkaClientOptions } from 'kafka-node';
export const clientOptions = (options: KafkaClientOptions) => ({
  connectTimeout: 10000,
  requestTimeout: 30000,
  idleConnection: 300000,
  reconnectOnIdle: true,
  autoConnect: true,
  versions: {
    disabled: false,
    requestTimeout: 500
  },
  connectRetryOptions: {
    retries: 5,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 60000,
    randomize: true
  },
  maxAsyncRequests: 10,
  noAckBatchOptions: null,
  ...options
}) as KafkaClientOptions;
