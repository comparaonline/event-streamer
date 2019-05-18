import { KafkaOutputEvent } from '../../kafka/kafka-events';

export class TestOutputEvent extends KafkaOutputEvent {
  encode = jest.fn(() => ({ test: 'Test Value' }));
}
