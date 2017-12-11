import { BaseServer, RawEvent } from './base-server';
import { BaseEvent } from './event';
import { Handler, ActionCtor } from './handler';
import { Scheduler, Observable } from 'rxjs';

export interface Event<T extends BaseEvent> {
  code: string;
  new(receivedEvent: {}): T;
}

export class Router {
  private handlers = new Map<string, Handler>();

  constructor(server: BaseServer) {
    server.bind((obs: Observable<RawEvent>) => {
      const filtered = obs.filter(event => this.willHandle(event));
      return this.processEvents(filtered);
    });
  }

  add<T extends BaseEvent>(event: Event<T>, action: ActionCtor): void {
    const handler = this.handlers.get(event.name) || new Handler(event);
    handler.add(action);
    this.handlers.set(event.name, handler);
  }

  willHandle({ code }: { code: string }): boolean {
    return this.handlers.has(code);
  }

  protected processEvents(filtered: Observable<RawEvent>): Observable<BaseEvent> {
    return filtered.flatMap(event => this.handleEvent(event));
  }

  protected handleEvent(rawEvent: RawEvent) {
    const handler = <Handler>this.handlers.get(rawEvent.code);
    return handler.handle(rawEvent);
  }
}

export class SequentialRouter extends Router {
  protected processEvents(filtered: Observable<RawEvent>): Observable<BaseEvent> {
    return filtered.concatMap(event => this.handleEvent(event));
  }
}
