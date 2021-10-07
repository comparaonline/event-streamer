import { of, MonoTypeOperatorFunction, Subscription } from 'rxjs';
import { BackpressureHandler, MemoryAction } from '../backpressure-handler';
import { EventsEnum } from '../../notifier/events-enum';

jest.useFakeTimers();

const MAX_MB = 99999999999999;
const MIN_MB = 1;
const INTERVAL = 1000;
const mockEmit = jest.fn();
const mockMemoryUsage = jest.fn();

jest.mock('../../notifier', () => ({
  Notifier: class {
    static getInstance() : any {
      return {
        emit: mockEmit
      };
    }
  }
}));

describe('BackpressureHandler', () => {
  let handler: BackpressureHandler;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const testTap = (op: MonoTypeOperatorFunction<any>) => of(null).pipe(op).toPromise();
  let stream: { resume: () => unknown, pause: () => unknown };
  beforeEach(() => stream = { resume: jest.fn(), pause: jest.fn() });

  it('constructor backpressure', () => {
    // arrange
    process.memoryUsage = mockMemoryUsage;
    mockMemoryUsage.mockImplementation(() => ({
      heapUsed: 1,
      heapTotal: 2
    }));

    // act
    new BackpressureHandler(stream, 10, 0);

    // assert
    expect(setInterval).toHaveBeenCalledTimes(1);
    expect(setInterval).toHaveBeenLastCalledWith(expect.any(Function), INTERVAL);
    expect(mockEmit).toHaveBeenNthCalledWith(
      1,
      EventsEnum.ON_MEMORY_USED,
      { action: MemoryAction.heapTotal, heapUsed: 2 }
    );
    expect(mockEmit).toHaveBeenNthCalledWith(
      2,
      EventsEnum.ON_MEMORY_USED,
      { action: MemoryAction.initial, heapUsed: 1 }
    );
  });

  it('keeps track of backpressure', async () => {
    const handler = new BackpressureHandler(stream, 10, 0);
    let backpressure = 0;
    handler.backpressure.subscribe(i => backpressure = i);
    expect(backpressure).toEqual(0);
    await testTap(handler.increment());
    expect(backpressure).toEqual(1);
    await testTap(handler.increment());
    expect(backpressure).toEqual(2);
    await testTap(handler.decrement());
    expect(backpressure).toEqual(1);
    await testTap(handler.decrement());
    expect(backpressure).toEqual(0);
  });

  describe('#handle', () => {
    const pause = 3;
    const resume = 1;
    let subscription: Subscription;
    beforeEach(() => handler = new BackpressureHandler(stream, pause, resume));
    beforeEach(() => subscription = handler.handle() || fail('Subscription undefined'));
    afterEach(() => subscription.unsubscribe());

    it('stops when it gets to the pause limit', async () => {
      await testTap(handler.increment());
      await testTap(handler.increment());
      await testTap(handler.increment());
      expect(stream.pause).toHaveBeenCalledTimes(1);
      expect(stream.resume).not.toHaveBeenCalled();
    });

    it('stops calling pause when over the limit', async () => {
      await testTap(handler.increment());
      await testTap(handler.increment());
      await testTap(handler.increment());
      await testTap(handler.increment());
      expect(stream.pause).toHaveBeenCalledTimes(1);
      expect(stream.resume).not.toHaveBeenCalled();
    });

    it('calls resume when it goes below the limit after calling pause', async () => {
      await testTap(handler.increment());
      await testTap(handler.increment());
      await testTap(handler.increment());
      await testTap(handler.increment());
      expect(stream.pause).toHaveBeenCalledTimes(1);
      expect(stream.resume).not.toHaveBeenCalled();
      await testTap(handler.decrement());
      expect(stream.pause).toHaveBeenCalledTimes(1);
      expect(stream.resume).not.toHaveBeenCalled();
      await testTap(handler.decrement());
      expect(stream.pause).toHaveBeenCalledTimes(1);
      expect(stream.resume).not.toHaveBeenCalled();
      await testTap(handler.decrement());
      expect(stream.pause).toHaveBeenCalledTimes(1);
      expect(stream.resume).toHaveBeenCalledTimes(1);
    });
  });

  describe('pauseOnReachedLimit', () => {
    it('should not emit action paused', () => {
      // arrange
      process.memoryUsage = mockMemoryUsage;
      mockMemoryUsage.mockImplementation(() => ({
        heapUsed: MIN_MB
      }));
      handler.hasResumed = true;
      // act
      handler.pauseOnReachedLimit();

      // assert
      expect(handler.hasResumed).toBeTruthy();
      expect(mockEmit).toHaveBeenCalledTimes(2);
      expect(mockEmit).toHaveBeenCalledWith(
        EventsEnum.ON_MEMORY_USED,
        { action: MemoryAction.check, heapUsed: MIN_MB }
      );
    });
    it('should emit action paused', () => {
      // arrange
      process.memoryUsage = mockMemoryUsage;
      mockMemoryUsage.mockImplementation(() => ({
        heapUsed: MAX_MB,
        rss: MAX_MB
      }));

      // act
      handler.pauseOnReachedLimit();

      // assert
      expect(handler.hasResumed).toBeFalsy();
      expect(mockEmit).toHaveBeenCalledTimes(3);
      expect(mockEmit).toHaveBeenNthCalledWith(
        1,
        EventsEnum.ON_MEMORY_USED,
        { action: MemoryAction.check, heapUsed: MAX_MB }
      );
      expect(mockEmit).toHaveBeenNthCalledWith(
        2,
        EventsEnum.ON_MEMORY_USED,
        { action: MemoryAction.rss, heapUsed: MAX_MB }
      );
      expect(mockEmit).toHaveBeenNthCalledWith(
        3,
        EventsEnum.ON_MEMORY_USED,
        { action: MemoryAction.paused, heapUsed: MAX_MB }
      );
    });
  });

  describe('resumeOnReachedLimit', () => {
    it('should emit action resumed', () => {
      // arrange
      process.memoryUsage = mockMemoryUsage;
      mockMemoryUsage.mockImplementation(() => ({
        heapUsed: MIN_MB
      }));

      // act
      handler.resumeOnReachedLimit();

      // assert
      expect(handler.hasResumed).toBeTruthy();
      expect(mockEmit).toHaveBeenCalledTimes(1);
      expect(mockEmit).toHaveBeenCalledWith(
        EventsEnum.ON_MEMORY_USED,
        { action: MemoryAction.resumed, heapUsed: MIN_MB }
      );
    });

    it('should not emit action resumed', () => {
      // arrange
      handler.hasResumed = true;

      // act
      handler.resumeOnReachedLimit();

      // assert
      expect(handler.hasResumed).toBeTruthy();
      expect(mockEmit).toHaveBeenCalledTimes(0);
    });
  });
});
