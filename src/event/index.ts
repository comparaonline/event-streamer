export abstract class BaseEvent {
  static get code() {
    return this.name;
  }

  code = (<typeof BaseEvent>this.constructor).code;
  args: Object;

  constructor(receivedEvent: Object) {
    this.build(receivedEvent);
  }

  abstract build(receivedEvent: Object): void;

  toString() {
    return JSON.stringify({
      code: this.code
    });
  }
}

export interface RawEvent {
  code: string;
}

export abstract class InputEvent {
  code: string;

  constructor(rawEvent: RawEvent) {
    this.code = rawEvent.code;
    this.build(rawEvent);
  }

  abstract build(rawEvent: RawEvent): void;
}

export abstract class OutputEvent {
  code = (<typeof OutputEvent> this.constructor).name;

  toString() {
    const json = { ...this.encode(), code: this.code };
    return JSON.stringify(json);
  }

  protected abstract encode(): Object;
}
