import { createAjv } from '../ajv';

describe('createAjv', () => {
  it('registers common formats', () => {
    const ajv = createAjv();
    const validate = ajv.compile({ type: 'string', format: 'date-time' });
    expect(validate('2020-01-01T00:00:00Z')).toBe(true);
    expect(validate('not-a-date')).toBe(false);
  });
});
