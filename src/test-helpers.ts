import { Server } from './server';
import { OutputEvent, InputEvent } from './events';
import { RawEvent } from './raw-event';
import { Router } from './router';
import { Subject } from 'rxjs';
import { share } from 'rxjs/operators';

export class TestServer extends Server {
  private outputEvents: OutputEvent[] = [];
  private subject: Subject<RawEvent> = new Subject();
  private processed = this.subject.pipe(
    this.router.route(),
    share()
  );

  constructor(
    private router: Router
  ) {
    super(router);
  }

  input<E extends RawEvent, T>(event: E): Promise<T> {
    return new Promise((resolve) => {
      this.processed.subscribe((event: T) => resolve(event));
      this.subject.next(event);
    });
  }

  async output(event: OutputEvent): Promise<void> {
    this.outputEvents = this.outputEvents.concat(event);
  }

  emitted(): OutputEvent[] {
    return this.outputEvents;
  }

  cleanEmitted(): void {
    this.outputEvents = [];
  }
}

export class TestInputEvent extends InputEvent {
  /* istanbul ignore next */
  build() { }
}

export class TestOutputEvent extends OutputEvent {
  /* istanbul ignore next */
  encode() { return {}; }
}
