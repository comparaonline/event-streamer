import { tryParse } from '../try-parse';

describe('tryParse', () => {
  it('parses valid json', () => {
    const json = '{"value": "test"}';
    const defaultValue = { value: 'default' };
    const result = tryParse(json, defaultValue);
    expect(result).toEqual({ value: 'test' });
  });

  it('returns the default value for invalid json', () => {
    const json = '{value: test}';
    const defaultValue = { value: 'default' };
    const result = tryParse(json, defaultValue);
    expect(result).toEqual({ value: 'default' });
  });
});
