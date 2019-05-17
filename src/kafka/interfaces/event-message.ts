import { ConsumerStreamMessage } from 'node-rdkafka';
import { RawEvent } from '../../events';

export interface EventMessage {
  message: ConsumerStreamMessage;
  event: RawEvent;
}
