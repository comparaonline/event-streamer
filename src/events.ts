import { RawEvent } from './raw-event';

export interface InputEventCtor extends RawEvent {
  new(data: Object): InputEvent;
}

export abstract class InputEvent {
  static get code() {
    return this.name;
  }

  constructor(data: Object) {
    this.build(data);
  }

  abstract build(data: Object): void;
}

export abstract class OutputEvent {
  code = (<typeof OutputEvent> this.constructor).name;

  toString() {
    return JSON.stringify(this.toJSON());
  }

  toJSON() {
    return { ...this.encode(), code: this.code };
  }

  abstract encode(): Object;
}
