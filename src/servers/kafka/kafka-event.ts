import { BaseEvent } from '../../event/index';

export abstract class KafkaEvent extends BaseEvent {
  key?: string;
  topic?: string;
}
