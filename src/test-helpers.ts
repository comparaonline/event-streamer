import { Server } from './server';
import { OutputEvent, InputEvent } from './events';
import { RawEvent } from './raw-event';
import { Router } from './router';
import { Subject } from 'rxjs';
import { EventMessage } from './kafka/interfaces/event-message';
import { Message } from 'kafka-node';
import { EventEmitter } from 'events';

const rawToEventMessage = (() => {
  let offset = 0;
  return (event: RawEvent): EventMessage => ({
    event,
    message: { offset: offset += 1, topic: 'test', value: JSON.stringify(event) }
  });
})();

export class TestServer extends Server {
  private outputEvents: OutputEvent[] = [];
  private subject: Subject<EventMessage> = new Subject();
  private emitter = new EventEmitter();

  constructor(
    private router: Router
  ) {
    super(router);
    this.subject.pipe(
      this.router.route(v => v)
    ).subscribe(
      next => this.emitter.emit('next', next)
    );
  }

  input<T extends RawEvent>(event: T): Promise<Message> {
    const eventMessage = rawToEventMessage(event);
    return new Promise((resolve) => {
      this.emitter.on('next', ({ message }: { message: Message }) => {
        if (message.offset === eventMessage.message.offset) resolve(message);
      });
      this.subject.next(eventMessage);
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
