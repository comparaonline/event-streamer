export interface RawEvent {
  code: string;
}

export interface InputEventCtor {
  code: string;
  new(rawEvent: RawEvent): InputEvent;
}

export abstract class InputEvent {
  code = (<typeof InputEvent>this.constructor).name;

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
