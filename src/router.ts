import * as opentracing from 'opentracing';
import { Server } from './server';
import { InputEvent, InputEventCtor } from './events';
import { RawEvent } from './raw-event';
import { ActionCtor } from './action';
import { Observable, OperatorFunction } from 'rxjs';
import { map, concatMap, groupBy, flatMap, tap } from 'rxjs/operators';

const tracer = opentracing.globalTracer();

export const enum RouteStrategy {
  PARALLEL_ROUTE_PARALLEL_DISPATCH = 'parallel route, parallel dispatch',
  PARALLEL_ROUTE_SEQUENTIAL_DISPATCH = 'parallel route, sequential dispatch',
  SEQUENTIAL_ROUTE = 'sequential route'
}
type StrategyList = {
  [k in RouteStrategy]: () => RouteResult
};
type RouteResult<T = unknown> = OperatorFunction<RawEvent, T>;
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

  route(childOf?: opentracing.Span): RouteResult {
    const span = tracer.startSpan('event-streamer.router.route', { childOf });
    span.setTag('route.strategy', this.strategy);
    return (obs: Observable<RawEvent>) => obs.pipe(
      this.routeStrategies[this.strategy](),
      tap(() => span.finish(), (error) => {
        span.setTag(opentracing.Tags.ERROR, true);
        span.log({
          event: 'error',
          'error.object': error,
          message: error.message,
          stack: error.stack
        });
        span.finish();
      })
    );
  }

  parRoute(): RouteResult {
    return (obs: Observable<RawEvent>) => obs.pipe(
      map(data => this.dispatch(data)),
      concatMap(data => data)
    );
  }

  parRouteSeqDispatch(): RouteResult {
    return (obs: Observable<RawEvent>) => obs.pipe(
        groupBy(event => event.code),
        flatMap(obs => obs.pipe(this.seqRoute()))
      );
  }

  seqRoute(): RouteResult {
    return (obs: Observable<RawEvent>) => obs.pipe(
      concatMap(data => this.dispatch(data))
    );
  }

  private dispatch(event: RawEvent) {
    const route = this.getRoute(event);
    return !route ? resolved : route.handle(event, this.server);
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
