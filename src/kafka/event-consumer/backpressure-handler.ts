import { Subject, of, EMPTY, MonoTypeOperatorFunction } from 'rxjs';
import { scan, share, tap, distinctUntilChanged, skip, flatMap } from 'rxjs/operators';
import { EventsEnum } from '../notifier/events-enum';
import { Notifier } from '../notifier';
import { defaultLogger } from '../../lib/default-logger';

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
const MB = 1000000;
const FOUR_HUNDRED = 400;
const HALF_SEC = 500;

export class BackpressureHandler {
  current = 0;
  minMemUsage = 0;
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
      private topMB: number = FOUR_HUNDRED
   ) {
    this.minMemUsage = process.memoryUsage().heapUsed;
    this.emitMemoryUsage(MemoryAction.heapTotal, process.memoryUsage().heapTotal);
    this.emitMemoryUsage(MemoryAction.initial, this.minMemUsage);
    /* istanbul ignore next */
    setInterval(this.checkMem, HALF_SEC);
  }

  checkMem = () => {
    const heap = process.memoryUsage().heapUsed;
    const rss = process.memoryUsage().rss;
    const heapTotal = process.memoryUsage().heapTotal;

    this.emitMemoryUsage(MemoryAction.check, heap);
    this.emitMemoryUsage(MemoryAction.rss, rss);
    this.emitMemoryUsage(MemoryAction.heapTotal, heapTotal);
  }

  private emitMemoryUsage (action: MemoryAction, memUsed: number) {
    try {
      this.notifier.emit(
        EventsEnum.ON_MEMORY_USED,
        <MemoryMetrics>{ action, memUsed });
    } catch (e) {
      /* istanbul ignore next */
      defaultLogger.error(`emitMemoryUsage error sending metrics ${e}`);
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
      defaultLogger.debug('BackpressureHandler.increment');
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

  public async handle() {
    return await this.backpressure.pipe(
      scan((acc, current) => {
        defaultLogger.debug('BackpressureHandler.handle scan');
        return this.chooseAction(acc, current);
      },   Action.initial),
      distinctUntilChanged(),
      skip(1),
      flatMap(action => this.actions[action])
    ).subscribe(action => action());
  }

  private chooseAction(prev: Action, current: number) {
    const rss = process.memoryUsage().rss;
    this.emitMemoryUsage(MemoryAction.rss, rss);

    const shouldPause = this.shouldPauseConsumer(current, rss);
    const shouldResume = this.shouldResumeConsumer(prev, current, rss);

    return shouldPause ? Action.pause : (
      shouldResume ? Action.resume : prev
    );
  }

  private shouldPauseConsumer(current: number, rss: number): boolean {
    const shouldPause = current >= this.pause || rss > this.topMB * MB;
    defaultLogger.debug(`BackpressureHandler.shouldPauseConsumer rss ${rss}`);
    defaultLogger.debug(
      `BackpressureHandler.shouldPauseConsumer this.topMB * MB ${this.topMB * MB}`
    );

    if (shouldPause) {
      this.emitMemoryUsage(MemoryAction.paused, rss);
    }
    defaultLogger.debug(`BackpressureHandler.shouldPauseConsumer shouldPause ${shouldPause}`);
    return shouldPause;
  }

  private shouldResumeConsumer(prev: Action, current: number, rss: number): boolean {
    const shouldResume = prev === Action.pause &&
      current <= this.resume &&
      rss < (this.topMB * MB) / 2;
    defaultLogger.debug(`BackpressureHandler.shouldResumeConsumer rss, ${rss}`);
    defaultLogger.debug(
      `BackpressureHandler.shouldResumeConsumer this.topMB * MB / 2,
      ${(this.topMB * MB) / 2}`
    );
    if (shouldResume) {
      this.emitMemoryUsage(MemoryAction.resumed, rss);
    }
    defaultLogger.debug(`BackpressureHandler.shouldResumeConsumer shouldResume ${shouldResume}`);
    return shouldResume;
  }
}
