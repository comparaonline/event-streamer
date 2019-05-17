import { KafkaOutputEvent } from '../../kafka-events';

export class TestOutputEvent extends KafkaOutputEvent {
  encode = jest.fn(() => ({ test: 'Test Value' }));
}
