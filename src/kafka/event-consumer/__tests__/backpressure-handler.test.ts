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
      { action: MemoryAction.heapTotal, memUsed: 2 }
    );
    expect(mockEmit).toHaveBeenNthCalledWith(
      2,
      EventsEnum.ON_MEMORY_USED,
      { action: MemoryAction.initial, memUsed: 1 }
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
    beforeEach(async () => subscription = await handler.handle() || fail('Subscription undefined'));
    afterEach(() => subscription.unsubscribe());

    it('stops when it gets to the pause limit', async () => {
      const ONE_HUNDRED = 100;
      mockMemoryUsage.mockImplementation(() => ({
        heapUsed: 1,
        heapTotal: 2,
        rss: ONE_HUNDRED
      }));

      process.memoryUsage = mockMemoryUsage;

      await testTap(handler.increment());
      await testTap(handler.increment());
      await testTap(handler.increment());
      expect(stream.pause).toHaveBeenCalledTimes(1);
      expect(stream.resume).not.toHaveBeenCalled();
      expect(mockEmit).toHaveBeenCalledTimes(6);
      [
        { action: MemoryAction.heapTotal, memUsed: 2 },
        { action: MemoryAction.initial, memUsed: 1 },
        { action: MemoryAction.rss, memUsed: ONE_HUNDRED }
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
      expect(mockEmit).toHaveBeenCalledTimes(13);
      expect(mockEmit).toHaveBeenNthCalledWith(
        13,
        EventsEnum.ON_MEMORY_USED,
        { action: MemoryAction.resumed, memUsed: ONE_HUNDRED }
      );
    });
  });
  describe('checkMem', () => {
    it('should emit actions', () => {
      // arrange
      process.memoryUsage = mockMemoryUsage;
      mockMemoryUsage.mockImplementation(() => ({
        heapUsed: 1,
        rss: 3,
        heapTotal: 2
      }));

      // act
      handler.checkMem();

      // assert
      expect(mockEmit).toHaveBeenCalledTimes(3);
      [
        { action: MemoryAction.check, memUsed: 1 },
        { action: MemoryAction.rss, memUsed: 3 },
        { action: MemoryAction.heapTotal, memUsed: 2 }
      ].forEach((event, index) => expect(mockEmit).toHaveBeenNthCalledWith(
        index + 1,
        EventsEnum.ON_MEMORY_USED,
        event
      ));

    });
  });
});
