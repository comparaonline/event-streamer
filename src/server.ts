import { RawEvent, OutputEvent } from './events';
import { Router } from './router';
import { EventEmitter } from 'events';

export abstract class Server extends EventEmitter {
  constructor(protected router: Router) {
    super();
    this.router.setEmitter(this);
  }

  abstract output(event: OutputEvent): void;
}
