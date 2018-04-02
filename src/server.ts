import { RawEvent, OutputEvent } from './events';
import { Router } from './router';
import { EventEmitter } from 'events';

export abstract class Server extends EventEmitter {
  constructor(protected router: Router) {
    super();
  }

  abstract output(event: OutputEvent): void;
}
