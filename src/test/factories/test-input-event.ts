import { KafkaInputEvent } from '../../kafka/kafka-events';

export class TestInputEvent extends KafkaInputEvent {
  value: string;

  build(obj: Object) {
    Object.assign(this, obj);
  }
}
