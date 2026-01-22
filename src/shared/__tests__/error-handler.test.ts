import { toDeadLetterMessage } from '../error-handler';

describe('toDeadLetterMessage', () => {
  it('wraps error and preserves fields', () => {
    const out = toDeadLetterMessage({ topic: 't', value: { a: 1 }, error: new Error('boom'), headers: { h: 'v' } });
    expect(out.topic).toBe('t');
    expect(out.value).toEqual({ a: 1 });
    expect(out.error.message).toBe('boom');
    expect(out.headers).toEqual({ h: 'v' });
    expect(typeof out.timestamp).toBe('string');
  });
});
