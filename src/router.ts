import { BaseServer } from './base-server';
import { Action } from './action';
import { BaseEvent } from './event';
import { Handler, ActionCtor } from './handler';
import { Scheduler } from 'rxjs/Scheduler';

export interface Event<T extends BaseEvent> {
  code: string;
  new(receivedEvent: {}): T;
}

export class Router {
  private handlers = new Map<string, Handler>();

  constructor(server: BaseServer) {
    server.bind(obs => obs
      .filter(event => this.willHandle(event))
      .concatMap((receivedEvent) => {
        const handler = <Handler>this.handlers.get(receivedEvent.code);
        return handler.handle(receivedEvent);
      })
    );
  }

  add<T extends BaseEvent>(event: Event<T>, action: ActionCtor) {
    const handler = this.handlers.get(event.name) || new Handler(event);
    handler.add(action);
    this.handlers.set(event.name, handler);
  }

  willHandle({ code }: { code: string }): boolean {
    return this.handlers.has(code);
  }
}
