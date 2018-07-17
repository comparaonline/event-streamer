import { InputEventCtor, InputEvent, RawEvent } from './events';
import { ActionCtor } from './action';

export class Router {
  private routes = new Map<string, Route>();

  add(eventClass: InputEventCtor, actionClass: ActionCtor): void {
    const route = this.routes.get(eventClass.code) || new Route(eventClass);
    route.addAction(actionClass);
    this.routes.set(eventClass.code, route);
  }

  handle<T extends RawEvent>(rawEvent: T): Promise<any> {
    const route = this.routes.get(rawEvent.code);
    if (!route) {
      return Promise.resolve();
    }
    return route.handleEvent(rawEvent);
  }
}

class Route {
  private eventClass: InputEventCtor;
  private actionsClasses = new Set<ActionCtor>();

  constructor(eventClass: InputEventCtor) {
    this.eventClass = eventClass;
  }

  addAction(actionClass: ActionCtor) {
    this.actionsClasses.add(actionClass);
  }

  handleEvent<T extends RawEvent>(rawEvent: T): Promise<any> {
    const event = new this.eventClass(rawEvent);
    const results = [...this.actionsClasses]
    .map((ac) => {
      // console.debug(`Routing ${this.eventClass.name} to ${ac.name}`);
      return this.performAction(ac, event, ac.retries, ac.retryDelay);
    });
    return Promise.all(results);
  }

  private async performAction(
    actionClass: ActionCtor, event: InputEvent, retries: number, delay: number
  ): Promise<any> {
    // console.debug(`Performing ${actionClass.name}`);
    const action = new actionClass();
    return action.perform(event).catch(async (error) => {
      if (retries <= 0) {
        // console.debug(`No retries left for ${actionClass.name}`);
        return Promise.reject(error);
      }
      // console.debug(`Retry ${actionClass.name} in ${delay} ms. Retries left: ${retries - 1}`);
      await this.timeout(delay);
      return this.performAction(actionClass, event, retries - 1, delay * 2);
    });
  }

  private timeout(duration: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, duration));
  }
}
