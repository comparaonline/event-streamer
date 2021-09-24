import { Subject, of, EMPTY, MonoTypeOperatorFunction } from 'rxjs';
import { scan, share, tap, distinctUntilChanged, skip, flatMap } from 'rxjs/operators';

interface PausableStream {
  pause(): unknown;
  resume(): unknown;
}

const enum Action {
  initial = 'initial',
  pause = 'pause',
  resume = 'resume'
}

const actions = (stream: PausableStream) => ({
  [Action.initial]: EMPTY,
  [Action.pause]: of(() => stream.pause()),
  [Action.resume]: of(() => stream.resume())
});
const MB = 1000000;
const SEC = 2000;
export class BackpressureHandler {
  private actions = actions(this.pausableStream);
  current = 0;
  minMemUsage = 0;
  hasResumed = false;

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
      private resume: number = Infinity,

      private collectorMetric: (obj:object) => void = () => {}
    ) {
    this.minMemUsage = process.memoryUsage().heapUsed;
    setInterval(() => {
      this.resumeOnReachedLimit();
    },          SEC);
  }

  private pauseOnReachedLimit() {
    if (process.memoryUsage().heapUsed > this.minMemUsage + this.pause * MB) {
      this.hasResumed = false;
      this.collectorMetric({ action: 'paused', heapUsed: process.memoryUsage().heapUsed });
      this.pausableStream.pause();
    }
  }

  private resumeOnReachedLimit() {
    if (
      !this.hasResumed &&
      process.memoryUsage().heapUsed <= this.minMemUsage + (this.pause * MB / 2)
    ) {
      this.collectorMetric({ action: 'resumed', heapUsed: process.memoryUsage().heapUsed });
      this.hasResumed = true;
      this.pausableStream.resume();
    }
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
      this.pauseOnReachedLimit();
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
    return current >= this.pause ? Action.pause : (
      prev === Action.pause && current <= this.resume ? Action.resume : prev
    );
  }
}
