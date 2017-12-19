import { Observable } from 'rxjs';
import { BaseEvent } from '../event';
import { Router } from '../router';

export interface RawEvent {
  code: string;
}
export type BindingCallback = (obs: Observable<RawEvent>) => Observable<BaseEvent>;

export abstract class BaseServer {
  constructor(private router: Router) { }
  start() {
    this.router.setupServer(this);
  }
  abstract link(callback: BindingCallback);
}
