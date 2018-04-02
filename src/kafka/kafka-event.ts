import { RawEvent } from '../events';

export interface KafkaEvent extends RawEvent {
  key?: string;
  topic?: string;
}
