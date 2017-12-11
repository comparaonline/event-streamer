import { Subject, Observable } from 'rxjs';
import { ReplaySubject } from 'rxjs/ReplaySubject';
import { BaseEvent } from './event/index';
import { BaseServer, RawEvent, BindingCallback } from './base-server';
import { Router } from './router';

export class TestServer extends BaseServer {
  private output: Observable<BaseEvent>;
  private input: ReplaySubject<RawEvent>;

  bind(callback: BindingCallback) {
    this.input = new ReplaySubject<RawEvent>();
    this.output = callback(this.input);
  }

  inputEvent(event: RawEvent) {
    this.input.next(event);
  }

  async publishedEvents(): Promise<BaseEvent[]> {
    this.input.complete();
    return this.output.toArray().toPromise();
  }
}

export class TestEvent extends BaseEvent {
  className = this.constructor.name;
  constructor(params = {}) {
    super(params);
  }
  build() { }
}
