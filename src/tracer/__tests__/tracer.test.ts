import { Tracer } from '..';
import { first } from 'rxjs/operators';

describe('Tracer', () => {
  const tracer = Tracer.instance();
  const testEvent = { code: 'TestEvent', data: 'test' };

  it('returns a context with the event data when you start tracing', () => {
    const context = tracer.startTracing(testEvent);
    expect(context).toHaveProperty('event', expect.objectContaining(testEvent));
  });

  it('allows emiting and listening to events', async () => {
    const eventName = 'test';
    const context = tracer.startTracing(testEvent);
    const result = tracer.listen(eventName).pipe(first()).toPromise();
    tracer.emit(eventName, context);
    await expect(result).resolves.toEqual(context);
  });
});
