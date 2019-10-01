import { TracerContext } from '../tracer-context';

describe('TracerContext', () => {
  const testEvent = { code: 'TestEvent', data: 'test' };
  let context: TracerContext;
  beforeEach(() => context = new TracerContext(testEvent));

  it('exposes the event data', () => {
    expect(context.event).toEqual(testEvent);
  });

  it('can store contextual data', () => {
    context.set('value', 'test');
    const result: string = context.get('value');

    expect(result).toEqual('test');
  });
});
