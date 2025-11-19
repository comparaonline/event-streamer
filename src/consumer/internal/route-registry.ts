import { z } from 'zod';
import { BaseEvent, EventHandler } from '../../schemas';
import { stringToUpperCamelCase } from '../../helpers';

export interface Route<T extends BaseEvent = BaseEvent> {
  topic: string;
  eventCode?: string; // UpperCamelCase
  schema?: z.ZodSchema<T>;
  handler: EventHandler<T>;
  validateWithRegistry?: boolean;
}

export class RouteRegistry {
  private readonly routesByTopic = new Map<string, Route<any>[]>();
  private readonly fallbackByTopic = new Map<string, EventHandler<any>>();

  add<T extends BaseEvent>(route: {
    topic: string | string[];
    eventCode?: string | string[];
    schema?: z.ZodSchema<T>;
    handler: EventHandler<T>;
    validateWithRegistry?: boolean;
  }): void {
    const topics = Array.isArray(route.topic) ? route.topic : [route.topic];
    const eventCodes = route.eventCode
      ? (Array.isArray(route.eventCode) ? route.eventCode : [route.eventCode]).map((n) => stringToUpperCamelCase(n))
      : [undefined];

    for (const topic of topics) {
      const existing = this.routesByTopic.get(topic) || [];
      for (const eventCode of eventCodes) {
        existing.push({
          topic,
          eventCode,
          schema: route.schema,
          handler: route.handler,
          validateWithRegistry: route.validateWithRegistry ?? true
        } as Route);
      }
      this.routesByTopic.set(topic, existing);
    }
  }

  addFallback<T = unknown>(topic: string, handler: EventHandler<T>): void {
    this.fallbackByTopic.set(topic, handler as EventHandler<unknown>);
  }

  getRoutes(topic: string, eventCode?: string): Route[] {
    const routes = this.routesByTopic.get(topic) || [];
    return routes.filter((r) => r.eventCode == null || r.eventCode === eventCode);
  }

  getFallback(topic: string): EventHandler<any> | undefined {
    return this.fallbackByTopic.get(topic);
  }

  listTopics(): string[] {
    const allTopics = new Set([...this.routesByTopic.keys(), ...this.fallbackByTopic.keys()]);
    return Array.from(allTopics);
  }
}
