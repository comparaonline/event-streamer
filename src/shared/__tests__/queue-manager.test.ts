import { QueueManager } from '../queue-manager';

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('QueueManager', () => {
  it('runs sequentially with concurrency=1', async () => {
    const qm = new QueueManager(1);
    const order: number[] = [];
    await Promise.all([
      qm.run(async () => {
        await wait(50);
        order.push(1);
      }),
      qm.run(async () => {
        order.push(2);
      })
    ]);
    expect(order).toEqual([1, 2]);
  });

  it('runs in parallel with concurrency=2', async () => {
    const qm = new QueueManager(2);
    const marks: number[] = [];
    const start = Date.now();
    await Promise.all([
      qm.run(async () => {
        await wait(50);
        marks.push(1);
      }),
      qm.run(async () => {
        await wait(50);
        marks.push(2);
      })
    ]);
    expect(marks.sort()).toEqual([1, 2]);
    expect(Date.now() - start).toBeLessThan(100);
  });
});
