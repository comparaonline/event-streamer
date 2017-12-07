import { BaseEvent } from './event';
import { BaseAction } from './action/base-action';
import { Observable } from 'rxjs';
import { Scheduler } from 'rxjs/Scheduler';

export type ActionCtor = { new(): BaseAction };

export class Handler {
  private actions: ActionCtor[] = [];
  constructor(private event: { new(receivedEvent: {}): BaseEvent }) { }

  add(action: ActionCtor) {
    this.actions.push(action);
  }

  handle(receivedEvent: Object): Observable<BaseEvent> {
    const event = new this.event(receivedEvent);
    return Observable.from(this.actions)
      .map(action => new action())
      .flatMap(action => action.handleEvent(event));
  }
}
