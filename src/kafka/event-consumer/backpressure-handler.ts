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

export class BackpressureHandler {
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

  public increment<T>() {
    return tap<T>(() => this.backpressureSubject.next(1));
  }

  public decrement<T>(): MonoTypeOperatorFunction<T> {
    return tap<T>(() => this.backpressureSubject.next(-1));
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
