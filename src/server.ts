import { OutputEvent } from './events';
import { Router } from './router';
import { EventEmitter } from 'events';

export abstract class Server extends EventEmitter {
  constructor(router: Router) {
    super();
    router.setEmitter(this);
  }

  abstract output(event: OutputEvent): Promise<void>;
}
