import { z } from 'zod';
import { Validator } from '../validator';

describe('Validator', () => {
  const schema = z.object({ id: z.number().int().positive() });

  it('valid when data matches', () => {
    const v = new Validator(schema);
    expect(v.validate({ id: 1 })).toEqual({ valid: true });
  });

  it('invalid when mismatch', () => {
    const v = new Validator(schema);
    const r = v.validate({ id: -1 });
    expect(r.valid).toBe(false);
    expect(r.errors && r.errors.length).toBeGreaterThan(0);
  });
});
