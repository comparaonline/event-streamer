import { Subject, of, EMPTY, MonoTypeOperatorFunction } from 'rxjs';
import { scan, share, tap, distinctUntilChanged, skip, flatMap } from 'rxjs/operators';

interface PausableStream {
  pause(): unknown;
  resume(): unknown;
}

export interface MemoryMetrics {
  action: MemoryAction;
  memUsed: number;
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
  check = 'check',
  heapTotal = 'heapTotal',
  rss = 'rss'
}

const actions = (stream: PausableStream) => ({
  [Action.initial]: EMPTY,
  [Action.pause]: of(() => stream.pause()),
  [Action.resume]: of(() => stream.resume())
});

export class BackpressureHandler {
  current = 0;
  private actions = actions(this.pausableStream);
  private readonly backpressureSubject = new Subject<number>();

  public readonly backpressure = this.backpressureSubject.pipe(
    scan((acc, value) => acc + value, 0),
    share()
  );

  constructor(
      private pausableStream: PausableStream,
      /* istanbul ignore next */
      private pause: number = Infinity,
      /* istanbul ignore next */
      private resume: number = Infinity
   ) {}

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
    const shouldPause = this.shouldPauseConsumer(current);
    const shouldResume = this.shouldResumeConsumer(prev, current);

    return shouldPause ? Action.pause : (
      shouldResume ? Action.resume : prev
    );
  }

  private shouldPauseConsumer(current: number): boolean {
    return current >= this.pause;
  }

  private shouldResumeConsumer(prev: Action, current: number): boolean {
    return  prev === Action.pause && current <= this.resume;
  }
}
