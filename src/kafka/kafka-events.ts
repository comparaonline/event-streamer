import { InputEvent, OutputEvent } from '../events';

export abstract class KafkaInputEvent extends InputEvent {
  key?: string;
  topic: string;
}

export abstract class KafkaOutputEvent extends OutputEvent {
  key?: string;
  topic?: string;
}
