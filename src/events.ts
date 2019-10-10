import * as opentracing from 'opentracing';
import { RawEvent } from './raw-event';

export interface InputEventCtor extends RawEvent {
  new(data: Object): InputEvent;
}

export class InputEvent {
  static get code() {
    return this.name;
  }

  constructor(data: Object) {
    this.build(data);
  }

  build(data: Object): void {
    Object.assign(this, data);
  }
}

const tracer = opentracing.globalTracer();
export abstract class OutputEvent {
  code = (<typeof OutputEvent>this.constructor).name;
  // tslint:disable-next-line: variable-name
  public _span?: opentracing.Span;

  toString() {
    return JSON.stringify(this.toJSON());
  }

  toJSON() {
    const encoded = { ...this.encode(), code: this.code, _span: undefined };
    /* istanbul ignore next */
    if (this._span) {
      tracer.inject(this._span, opentracing.FORMAT_TEXT_MAP, encoded._span);
    }
    return encoded;
  }

  abstract encode(): Object;
}
