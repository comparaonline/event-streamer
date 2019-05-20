import { Server } from './server';
import { InputEvent, InputEventCtor } from './events';
import { RawEvent } from './raw-event';
import { ActionCtor } from './action';
import { PromiseTracer } from './lib/message-tracer';
import { Observable, OperatorFunction } from 'rxjs';
import { EventMessage } from './kafka/interfaces/event-message';
import { map, concatMap, groupBy, flatMap } from 'rxjs/operators';
import { FutureResult } from './kafka/interfaces/future-result';
import { Message } from 'kafka-node';

export const enum RouteStrategy {
  PARALLEL_ROUTE_PARALLEL_DISPATCH,
  PARALLEL_ROUTE_SEQUENTIAL_DISPATCH,
  SEQUENTIAL_ROUTE
}
type StrategyList = {
  [k in RouteStrategy]: (tracer: PromiseTracer) => RouteResult
};
type RouteResult = OperatorFunction<EventMessage, { message: Message }>;
const resolved = Promise.resolve();

export class Router {
  public strategy = RouteStrategy.PARALLEL_ROUTE_PARALLEL_DISPATCH;
  private server: Server;
  private routes = new Map<string, Route>();
  private routeStrategies: StrategyList = {
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

  getRoute(event?: RawEvent) {
    return RawEvent.isValid(event)
      && this.routes.has(event.code)
      && this.routes.get(event.code);
  }

  route(tracer: PromiseTracer): RouteResult {
    return this.routeStrategies[this.strategy](tracer);
  }

  parRoute(tracer: PromiseTracer): RouteResult {
    return (obs: Observable<EventMessage>) => obs.pipe(
      map(data => this.dispatch(data, tracer)),
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
      concatMap(data => this.awaitResult(this.dispatch(data, tracer)))
    );
  }

  private dispatch(data: EventMessage, tracer: PromiseTracer) {
    const { event } = data;
    const route = this.getRoute(event);
    const result = this.routeResult(data);
    return !route ? result() : tracer(result(route.handle(event, this.server)));
  }

  private routeResult(data: EventMessage) {
    return (result: Promise<any> = resolved) => ({ ...data, result });
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
