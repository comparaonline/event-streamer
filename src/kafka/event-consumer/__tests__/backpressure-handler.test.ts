import { of, MonoTypeOperatorFunction, Subscription } from 'rxjs';
import { BackpressureHandler } from '../backpressure-handler';

describe('BackpressureHandler', () => {
  let handler: BackpressureHandler;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const testTap = (op: MonoTypeOperatorFunction<any>) => of(null).pipe(op).toPromise();
  let stream: { resume: () => unknown, pause: () => unknown };
  beforeEach(() => stream = { resume: jest.fn(), pause: jest.fn() });

  it('constructor backpressure', () => {
    // act
    new BackpressureHandler(stream, 10, 0);
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
});
