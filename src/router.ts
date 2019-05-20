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
type RouteResult = OperatorFunction <EventMessage, EventMessage>;

export class Router {
  public strategy = RouteStrategy.PARALLEL_ROUTE_PARALLEL_DISPATCH;
  private server: Server;
  private routes = new Map<string, Route>();
  private routeStrategies = {
    [RouteStrategy.PARALLEL_ROUTE_PARALLEL_DISPATCH]: this.parRoute.bind(this),
    [RouteStrategy.PARALLEL_ROUTE_SEQUENTIAL_DISPATCH]: this.parRouteSeqDispatch.bind(this),
    [RouteStrategy.SEQUENTIAL_ROUTE]: this.seqRoute.bind(this)
  };

  setEmitter(server: Server) {
    this.server = server;
  }

  add(event: InputEventCtor, action: ActionCtor): void {
    const route = this.routes.get(event.code) || new Route(event);
    route.add(action);
    this.routes.set(event.code, route);
  }

  canRoute(eventName: string) {
    return this.routes.has(eventName);
  }

  route(tracer: PromiseTracer): RouteResult {
    return this.routeStrategies[this.strategy](tracer);
  }

  parRoute(tracer: PromiseTracer): RouteResult {
    return (obs: Observable<EventMessage>) => obs.pipe(
      map(data => ({ ...data, result: this.routeEvent(data.event) })),
      map(tracer) ,
      this.finishProcessing()
    );
  }

  parRouteSeqDispatch(tracer: PromiseTracer): RouteResult {
    return (obs: Observable<EventMessage>) => obs.pipe(
        groupBy(({ event }) => event.code),
        flatMap(obs => obs.pipe(this.seqRoute(tracer)))
      );
  }

  seqRoute(tracer: PromiseTracer): RouteResult {
    return (obs: Observable<EventMessage>) => obs.pipe(
      concatMap(data => this.awaitResult(tracer({
        ...data,
        result: this.routeEvent(data.event)
      })))
    );
  }

  private routeEvent(rawEvent: RawEvent): Promise <any> {
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
