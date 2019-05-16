import { Server } from './server';
import { RawEvent, OutputEvent, InputEvent } from './events';
import { Router } from './router';
import { Subject } from 'rxjs';

export class TestServer extends Server {
  private outputEvents: OutputEvent[] = [];
  private subject = new Subject();

  constructor(
    router: Router
  ) {
    super(router);
    this.subject.pipe(router.route(v => v));
  }

  input(rawEvent: RawEvent) {
    this.subject.next(rawEvent);
  }

  output(event: OutputEvent): void {
    this.outputEvents.push(event);
  }

  async emitted(): Promise<OutputEvent[]> {
    await this.subject.toPromise();
    return this.outputEvents;
  }

  reset() {
    this.outputEvents.length = 0;
  }
}

export class TestInputEvent extends InputEvent {
  build() { }
}

export class TestOutputEvent extends OutputEvent {
  encode() { return {}; }
}
