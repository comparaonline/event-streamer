import { KafkaInputEvent } from '../../kafka/kafka-events';

export class TestInputEvent extends KafkaInputEvent {
  value: string;
}
