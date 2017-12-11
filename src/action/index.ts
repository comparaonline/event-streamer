import { BaseEvent } from '../event';
import { Observable, ReplaySubject } from 'rxjs';
import { emitter, Event } from './emitter';
import { Scheduler } from 'rxjs/Scheduler';
import { BaseAction } from './base-action';

export abstract class Action extends BaseAction {
  handleEvent(event: BaseEvent): Observable<BaseEvent> {
    return Observable.fromPromise(this.perform(event))
      .do(() => this.result.complete())
      .flatMap(() => this.result);
  }
}
