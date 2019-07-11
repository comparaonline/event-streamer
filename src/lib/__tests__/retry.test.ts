import { of } from 'rxjs';
import { map } from 'rxjs/operators';
import { retry } from '../retry';
import { fail } from 'assert';

describe('Retry', () => {
  const testErr = (failTimes = 3, result = true) => {
    let count = 0;
    return () => ((count += 1) < failTimes) ? fail(`Count: ${count}`) : result;
  };

  it('retries a failed observable', async () => {
    const result = await of(1).pipe(
      map(testErr()),
      retry(2, 100, 1)
    ).toPromise();
    expect(result).toEqual(true);
  });

  it('fails after the expected retries', async () => {
    const result = of(1).pipe(
      map(testErr(4)),
      retry(2, 100, 1)
    ).toPromise();
    await expect(result).rejects.toThrow(/Count: 3/);
  });

  it('waits the expected time', async () => {
    const expected = 600;
    const start = Date.now();
    await of(1).pipe(
      map(testErr(4)),
      retry(3, 100, 2)
    ).toPromise();
    const end = Date.now();
    await expect(expected - (end - start)).toBeLessThan(100);
  });
});
