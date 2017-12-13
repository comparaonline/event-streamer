export abstract class BaseEvent {
  static get code() {
    return this.name;
  }

  code = (<typeof BaseEvent>this.constructor).code;
  args: Object;

  constructor(receivedEvent: Object) {
    this.build(receivedEvent);
  }

  abstract build(receivedEvent: Object) : void;

  toString() {
    return JSON.stringify({
      code: this.code
    });
  }
}
