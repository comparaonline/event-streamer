import { Server } from './server';
import { OutputEvent, InputEvent } from './events';
import { RawEvent } from './raw-event';
import { Router } from './router';
import { from } from 'rxjs';
import { EventMessage } from './kafka/interfaces/event-message';
import { map } from 'rxjs/operators';

const rawToEventMessage = (event: RawEvent): EventMessage => ({
  event,
  message: { topic: 'test', value: JSON.stringify(event) }
});

export class TestServer extends Server {
  private outputEvents: OutputEvent[] = [];
  private rawEvents: RawEvent[] = [];

  constructor(
    private router: Router
  ) {
    super(router);
  }

  input<T extends RawEvent>(event: T) {
    this.rawEvents.push(event);
  }

  async output(event: OutputEvent): Promise<void> {
    this.outputEvents.push(event);
  }

  async emitted(): Promise<OutputEvent[]> {
    await from(this.rawEvents).pipe(
      map(rawToEventMessage),
      this.router.route(v => v)
    ).toPromise();

    return this.outputEvents;
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
