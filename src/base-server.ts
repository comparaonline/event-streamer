import { Observable } from 'rxjs';
import { BaseEvent } from './event';

export interface RawEvent {
  code: string;
}
export type BindingCallback = (obs: Observable<RawEvent>) => Observable<BaseEvent>;

export abstract class BaseServer {
  abstract bind(callback: BindingCallback);
}
