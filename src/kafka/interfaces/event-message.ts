import { RawEvent } from '../../raw-event';
import { Message } from 'kafka-node';

export interface EventMessage {
  message: Message;
  event: RawEvent;
}
