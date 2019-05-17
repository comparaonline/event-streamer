import { Server } from './server';
import { InputEvent, InputEventCtor, RawEvent } from './events';
import { ActionCtor } from './action';
import { PromiseTracer } from './lib/message-tracer';
import { Observable, OperatorFunction } from 'rxjs';
import { EventMessage } from './kafka/interfaces/event-message';
import { map, concatMap, groupBy, flatMap } from 'rxjs/operators';
import { FutureResult } from './kafka/interfaces/future-result';

export const enum RouteStrategy {
  PARALLEL_ROUTE_PARALLEL_DISPATCH,
  PARALLEL_ROUTE_SEQUENTIAL_DISPATCH,
  SEQUENTIAL_ROUTE
}

export class Router {
  public strategy = RouteStrategy.PARALLEL_ROUTE_PARALLEL_DISPATCH;
  private server: Server;
  private routes = new Map<string, Route>();

  setEmitter(server: Server) {
    this.server = server;
  }

  add(event: InputEventCtor, action: ActionCtor): void {
    const route = this.routes.get(event.code) || new Route(event);
    route.add(action);
    this.routes.set(event.code, route);
  }

  canHandle(eventName: string) {
    return this.routes.has(eventName);
  }

  route(tracer: PromiseTracer): OperatorFunction<EventMessage, EventMessage> {
    switch (this.strategy) {
      case RouteStrategy.PARALLEL_ROUTE_PARALLEL_DISPATCH:
        return this.parRoute(tracer);
      case RouteStrategy.PARALLEL_ROUTE_SEQUENTIAL_DISPATCH:
        return this.parRouteSeqDispatch(tracer);
      case RouteStrategy.SEQUENTIAL_ROUTE:
        return this.seqRoute(tracer);
    }
  }

  parRoute(tracer: PromiseTracer): OperatorFunction<EventMessage, EventMessage> {
    return (obs: Observable<EventMessage>) => obs.pipe(
      map(data => ({ ...data, result: this.routeEvent(data.event) })),
      map(tracer),
      this.finishProcessing()
    );
  }

  parRouteSeqDispatch(tracer: PromiseTracer): OperatorFunction<EventMessage, EventMessage> {
    return (obs: Observable<EventMessage>) => obs.pipe(
      groupBy(({ event }) => event.code),
      flatMap(obs => obs.pipe(this.seqRoute(tracer)))
    );
  }

  seqRoute(tracer: PromiseTracer): OperatorFunction<EventMessage, EventMessage> {
    return (obs: Observable<EventMessage>) => obs.pipe(
      concatMap(data => this.awaitResult(tracer({
        ...data,
        result: this.routeEvent(data.event)
      })))
    );
  }

  private routeEvent(rawEvent: RawEvent): Promise<any> {
    const route = this.routes.get(rawEvent.code);
    if (!route) {
      return Promise.resolve();
    }
    return route.handle(rawEvent, this.server);
  }

  private finishProcessing() {
    return concatMap(async (data: EventMessage & FutureResult) =>
      this.awaitResult(data));
  }

  private async awaitResult(data: EventMessage & FutureResult) {
    return { ...data, result: await data.result };
  }
}

export class Route {
  private actionCtors: ActionCtor[] = [];

  constructor(private event: InputEventCtor) { }

  add(action: ActionCtor) {
    this.actionCtors.push(action);
  }

  handle(rawEvent: RawEvent, server: Server): Promise<any> {
    const event = new this.event(rawEvent);
    return Promise.all(this.performances(event, server));
  }

  private performances(event: InputEvent, server: Server): Promise<any>[] {
    return this.actionCtors
      .map(actionCtor => new actionCtor(server))
      .map(action => action.perform(event));
  }
}
