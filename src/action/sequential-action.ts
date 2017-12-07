import { BaseEvent } from '../event';
import { Observable, ReplaySubject } from 'rxjs';
import { emitter, Event } from './emitter';
import { Scheduler } from 'rxjs/Scheduler';
import { BaseAction } from './base-action';

export abstract class SequentialAction extends BaseAction {
  handleEvent(event: BaseEvent): Observable<BaseEvent> {
    this.perform(event);
    return Observable.of(null)
      .do(() => this.result.complete())
      .flatMap(() => this.result);
  }
}
