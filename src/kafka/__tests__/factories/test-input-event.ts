import { KafkaInputEvent } from '../../kafka-events';

export class TestInputEvent extends KafkaInputEvent {
  build = jest.fn(function (obj: Object) { Object.assign(this, obj); });
}
