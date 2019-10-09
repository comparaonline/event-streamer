import { Observable, Subject } from 'rxjs';
import { filter, map, share } from 'rxjs/operators';
import { RawEvent } from '../raw-event';
import { TracerContext } from './tracer-context';
import { TracerEvent } from './tracer-event';

interface ContextStream {
  eventName: TracerEvent;
  context: TracerContext;
}
export { TracerContext, TracerEvent };
export class Tracer {
  private static readonly tracerInstance = new Tracer();
  private context = new Subject<ContextStream>();

  static instance(): Tracer {
    return this.tracerInstance;
  }

  startTracing(event: RawEvent): TracerContext {
    return new TracerContext(event);
  }

  listen(eventName: TracerEvent): Observable<TracerContext> {
    return this.context.pipe(
      filter(s => s.eventName === eventName),
      map(s => s.context),
      share()
    );
  }

  emit(eventName: TracerEvent, context: TracerContext): void {
    this.context.next({ eventName, context });
  }
}
