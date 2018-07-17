import { InputEvent } from './events';

export interface ActionCtor {
  retries: number;
  retryDelay: number;
  new(): Action;
}

export abstract class Action {
  static retries = 0;
  static retryDelay = 500;

  abstract perform(event: InputEvent): Promise<any>;
}
