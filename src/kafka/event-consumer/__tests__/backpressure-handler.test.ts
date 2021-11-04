import { of, MonoTypeOperatorFunction, Subscription } from 'rxjs';
import { BackpressureHandler, MemoryAction } from '../backpressure-handler';
import { EventsEnum } from '../../notifier/events-enum';

jest.useFakeTimers();

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
      const ONE_HUNDRED = 100;
      process.memoryUsage = mockMemoryUsage;
      mockMemoryUsage.mockImplementation(() => ({
        heapUsed: 1,
        heapTotal: 2,
        rss: ONE_HUNDRED
      }));

      await testTap(handler.increment());
      await testTap(handler.increment());
      await testTap(handler.increment());
      expect(stream.pause).toHaveBeenCalledTimes(1);
      expect(stream.resume).not.toHaveBeenCalled();
      expect(mockEmit).toHaveBeenCalledTimes(12);
      [
        { action: MemoryAction.heapTotal, heapUsed: 2 },
        { action: MemoryAction.initial, heapUsed: 1 },
        { action: MemoryAction.heapUsed, heapUsed: 1 },
        { action: MemoryAction.rss, heapUsed: ONE_HUNDRED },
        { action: MemoryAction.heapTotal, heapUsed: 2 }
      ].forEach((event, index) => expect(mockEmit).toHaveBeenNthCalledWith(
        index + 1,
        EventsEnum.ON_MEMORY_USED,
        event
      ));
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
      const ONE_HUNDRED = 100;
      process.memoryUsage = mockMemoryUsage;
      mockMemoryUsage.mockImplementation(() => ({
        heapUsed: 1,
        heapTotal: 2,
        rss: ONE_HUNDRED
      }));
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
      expect(mockEmit).toHaveBeenCalledTimes(27);
      expect(mockEmit).toHaveBeenNthCalledWith(
        27,
        EventsEnum.ON_MEMORY_USED,
        { action: MemoryAction.resumed, heapUsed: ONE_HUNDRED }
      );
    });
  });
});
