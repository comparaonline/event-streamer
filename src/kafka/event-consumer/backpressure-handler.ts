import { Subject, of, EMPTY, MonoTypeOperatorFunction } from 'rxjs';
import { scan, share, tap, distinctUntilChanged, skip, flatMap } from 'rxjs/operators';
import { EventsEnum } from '../notifier/events-enum';
import { Notifier } from '../notifier';

interface PausableStream {
  pause(): unknown;
  resume(): unknown;
}

export interface MemoryMetrics {
  action: MemoryAction;
  heapUsed: number;
}

const enum Action {
  initial = 'initial',
  pause = 'pause',
  resume = 'resume'
}

export const enum MemoryAction {
  initial = 'initial',
  paused = 'paused',
  resumed = 'resumed',
  heapUsed = 'heapUsed',
  heapTotal = 'heapTotal',
  rss = 'rss'
}

const actions = (stream: PausableStream) => ({
  [Action.initial]: EMPTY,
  [Action.pause]: of(() => stream.pause()),
  [Action.resume]: of(() => stream.resume())
});
const MB = 1000000;

export class BackpressureHandler {
  current = 0;
  minMemUsage = 0;
  hasResumed = false;
  private actions = actions(this.pausableStream);
  private readonly backpressureSubject = new Subject<number>();
  private notifier = Notifier.getInstance();

  public readonly backpressure = this.backpressureSubject.pipe(
    scan((acc, value) => acc + value, 0),
    share()
  );

  constructor(
      private pausableStream: PausableStream,
      /* istanbul ignore next */
      private pause: number = Infinity,
      /* istanbul ignore next */
      private resume: number = Infinity,
      /* istanbul ignore next */
      private topMB: number = 400
   ) {
    this.minMemUsage = process.memoryUsage().heapUsed;
    this.emitMemoryUsage(MemoryAction.heapTotal, process.memoryUsage().heapTotal);
    this.emitMemoryUsage(MemoryAction.initial, this.minMemUsage);
  }

  private emitMemoryUsage (action: MemoryAction, heapUsed: number) {
    this.notifier.emit(
      EventsEnum.ON_MEMORY_USED,
      <MemoryMetrics>{ action, heapUsed });
  }

  private decrementCurrent() {
    this.current = this.current - 1;
  }

  private incrementCurrent() {
    this.current = this.current + 1;
  }

  public increment<T>() {
    return tap<T>(() => {
      this.incrementCurrent();
      return this.backpressureSubject.next(1);
    });
  }

  public decrement<T>(): MonoTypeOperatorFunction<T> {
    return tap<T>(() => {
      this.decrementCurrent();
      return this.backpressureSubject.next(-1);
    });
  }

  public handle() {
    return this.backpressure.pipe(
      scan((acc, current) => this.chooseAction(acc, current), Action.initial),
      distinctUntilChanged(),
      skip(1),
      flatMap(action => this.actions[action])
    ).subscribe(action => action());
  }

  private chooseAction(prev: Action, current: number) {
    const heap = process.memoryUsage().heapUsed;
    const rss = process.memoryUsage().rss;
    const heapTotal = process.memoryUsage().heapTotal;
    this.emitMemoryUsage(MemoryAction.heapUsed, heap);
    this.emitMemoryUsage(MemoryAction.rss, rss);
    this.emitMemoryUsage(MemoryAction.heapTotal, heapTotal);

    const shouldPause = this.shouldPauseConsumer(current, rss);
    const shouldResume = this.shouldResumeConsumer(prev, current, rss);

    return shouldPause ? Action.pause : (
      shouldResume ? Action.resume : prev
    );
  }

  private shouldPauseConsumer(current: number, rss: number): boolean {
    const shouldPause = current >= this.pause || rss > this.topMB * MB;
    if (shouldPause) {
      this.emitMemoryUsage(MemoryAction.paused, rss);
    }
    return shouldPause;
  }

  private shouldResumeConsumer(prev: Action, current: number, rss: number): boolean {
    const shouldResume = prev === Action.pause &&
      current <= this.resume &&
      rss < (this.topMB * MB) / 2;

    if (shouldResume) {
      this.emitMemoryUsage(MemoryAction.resumed, rss);
    }

    return shouldResume;
  }
}
