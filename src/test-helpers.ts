import { Server } from './server';
import { Router } from './router';
import { RawEvent, OutputEvent } from './events';

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

// export class TestEvent extends BaseEvent {
//   className = this.constructor.name;
//   constructor(params = {}) {
//     super(params);
//   }
//   build() { }
// }
