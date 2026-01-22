import type { EventHandler } from '../../schemas';
import { getSubjectName } from '../../helpers';

type RouteKey = string;

export class RouteRegistry<Topic extends string = string> {
  private readonly handlers = new Map<RouteKey, EventHandler>();

  register(topic: Topic, schemaName: string, handler: EventHandler): void {
    const key = this.key(topic, schemaName);
    this.handlers.set(key, handler);
  }

  get(topic: Topic, schemaName: string): EventHandler | undefined {
    const key = this.key(topic, schemaName);
    return this.handlers.get(key);
  }

  private key(topic: string, schemaName: string): RouteKey {
    return getSubjectName(topic, schemaName);
  }
}
