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
  check = 'check',
  heapTotal = 'heapTotal'
}

const actions = (stream: PausableStream) => ({
  [Action.initial]: EMPTY,
  [Action.pause]: of(() => stream.pause()),
  [Action.resume]: of(() => stream.resume())
});
const MB = 1000000;
const SEC = 2000;
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
      private resume: number = Infinity
   ) {
    this.minMemUsage = process.memoryUsage().heapUsed;
    this.emitMemoryUsage(MemoryAction.heapTotal, process.memoryUsage().heapTotal);
    this.emitMemoryUsage(MemoryAction.initial, this.minMemUsage);
    setInterval(this.resumeOnReachedLimit, SEC);
  }

  private emitMemoryUsage (action: MemoryAction, heapUsed: number) {
    this.notifier.emit(
      EventsEnum.ON_MEMORY_USED,
      <MemoryMetrics>{ action, heapUsed });
  }

  pauseOnReachedLimit() {
    const heap = process.memoryUsage().heapUsed;
    this.emitMemoryUsage(MemoryAction.check, heap);
    if (heap > this.minMemUsage + this.pause * MB) {
      this.hasResumed = false;
      this.emitMemoryUsage(MemoryAction.paused, heap);
     // this.pausableStream.pause();
    }
  }

  resumeOnReachedLimit() {
    const heap = process.memoryUsage().heapUsed;
    if (
      !this.hasResumed &&
      heap <= this.minMemUsage + (this.pause * MB / 2)
    ) {
      this.emitMemoryUsage(MemoryAction.resumed, heap);
      this.hasResumed = true;
      // this.pausableStream.resume();
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
