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
    const json = { ...this.encode(), code: this.code };
    return JSON.stringify(json);
  }

  protected abstract encode(): Object;
}
