import { KafkaInputEvent } from '../../kafka/kafka-events';

export class TestSlowInputEvent extends KafkaInputEvent {
  delay: number;

  build(obj: Object) {
    Object.assign(this, obj);
  }
}
