import { RawEvent } from '../../events';
import { Message } from 'kafka-node';

export interface EventMessage {
  message: Message;
  event: RawEvent;
}
