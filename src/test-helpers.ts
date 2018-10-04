import { Server } from './server';
import { RawEvent, OutputEvent, InputEvent } from './events';

export class TestServer extends Server {
  private outputEvents: OutputEvent[] = [];

  input(rawEvent: RawEvent) {
    return this.router.route(rawEvent);
  }

  output(event: OutputEvent): void {
    this.outputEvents.push(event);
  }

  emitted(): OutputEvent[] {
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
