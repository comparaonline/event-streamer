import { BaseEvent } from '../../event/index';

export abstract class KafkaEvent extends BaseEvent {
  readonly key?: string;
  readonly topic?: string;
}
