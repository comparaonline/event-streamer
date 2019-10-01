import { RawEvent } from '../raw-event';
export class TracerContext {
  private context: {
    [key: string]: any;
  } = {};
  constructor(public event: RawEvent) { }
  set(name: string, value: any) {
    this.context[name] = value;
    return this;
  }
  get<A>(name: string): A {
    return this.context[name];
  }
}
