import { Subject } from 'rxjs';
import { BaseEvent } from '../event';
import 'reflect-metadata';
import { Action } from '../action';

const emitters = Symbol.for('emits');
const addEmitter = <T extends typeof BaseEvent>(klass: Function, event: T) => {
  const metadata: Set<T> = Reflect.getMetadata(emitters, klass) || new Set();
  Reflect.defineMetadata(emitters, metadata.add(event), klass);
};

export type Emitter<T> = (event: T) => void;
export interface Event<T> {
  new(receivedEvent: Object): T;
  code: string;
}
export const emitter = <T extends BaseEvent>(
      action: Action,
      event: Event<T>,
      subject: Subject<BaseEvent>
): Emitter<T> => {
  addEmitter(action.constructor, event);
  return (event: T) => {
    subject.next(event);
  };
};
