import { Observable, Subject } from 'rxjs';
import { filter, map, share } from 'rxjs/operators';
import { RawEvent } from '../raw-event';
import { TracerContext } from './tracer-context';

interface ContextStream {
  eventName: string;
  context: TracerContext;
}

export class Tracer {
  private static readonly tracerInstance = new Tracer();
  private context = new Subject<ContextStream>();

  static instance(): Tracer {
    return this.tracerInstance;
  }

  startTracing(event: RawEvent): TracerContext {
    return new TracerContext(event);
  }

  listen(eventName: string): Observable<TracerContext> {
    return this.context.pipe(
      filter(s => s.eventName === eventName),
      map(s => s.context),
      share()
    );
  }

  emit(eventName: string, context: TracerContext): void {
    this.context.next({ eventName, context });
  }
}
