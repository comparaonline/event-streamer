import { BaseEvent } from '../event';
import { Observable, ReplaySubject } from 'rxjs';
import { emitter, Event } from './emitter';
import { Scheduler } from 'rxjs/Scheduler';

export abstract class BaseAction {
  protected result = new ReplaySubject<BaseEvent>();

  abstract perform(event: BaseEvent): Promise<void>;

  abstract handleEvent(event: BaseEvent): Observable<BaseEvent>;

  protected emitter<T extends BaseEvent>(event: Event<T>) {
    return emitter<T>(this, event, this.result);
  }
}
