import { InputEvent } from './events';

export interface ActionCtor {
  new(): Action;
}

export abstract class Action {
  abstract perform(event: InputEvent): Promise<any>;
}
