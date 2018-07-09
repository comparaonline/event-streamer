import { InputEventCtor, InputEvent, RawEvent } from './events';
import { ActionCtor } from './action';

export class Router {
  private routes = new Map<string, Route>();

  add(eventClass: InputEventCtor, actionClass: ActionCtor): void {
    const route = this.routes.get(eventClass.code) || new Route(eventClass);
    route.add(actionClass);
    this.routes.set(eventClass.code, route);
  }

  route<T extends RawEvent>(rawEvent: T): Promise<any> {
    const route = this.routes.get(rawEvent.code);
    if (!route) {
      return Promise.resolve();
    }
    return route.handle(rawEvent);
  }
}

export class Route {
  private eventClass: InputEventCtor;
  private actionCtors: ActionCtor[] = [];

  constructor(eventClass: InputEventCtor) {
    this.eventClass = eventClass;
  }

  add(actionClass: ActionCtor) {
    this.actionCtors.push(actionClass);
  }

  handle<T extends RawEvent>(rawEvent: T): Promise<any> {
    const event = new this.eventClass(rawEvent);
    return Promise.all(this.performances(event));
  }

  private performances(event: InputEvent): Promise<any>[] {
    return this.actionCtors
      .map(actionCtor => new actionCtor())
      .map(action => action.perform(event));
  }
}
