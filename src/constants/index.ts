import { ProducerPartitionerType } from '../interfaces';

export const DEFAULT = {
  autoCommit: false,
  fetchSizeInMB: 3,
  onlyTesting: false,
  connectionTTL: 5000,
  partitionerType: ProducerPartitionerType.CYCLIC
};
