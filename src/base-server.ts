import { Observable } from 'rxjs';
import { BaseEvent } from './event';
import { Router } from './router';

export interface RawEvent {
  code: string;
}
export type BindingCallback = (obs: Observable<RawEvent>) => Observable<BaseEvent>;

export abstract class BaseServer {
  constructor(router: Router) {
    router.setupServer(this);
  }
  abstract bind(callback: BindingCallback);
}
