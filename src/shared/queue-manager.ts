type Task<T> = () => Promise<T>;

export class QueueManager {
  private readonly concurrency: number;
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(concurrency = 1) {
    this.concurrency = Math.max(1, concurrency);
  }

  async run<T>(task: Task<T>): Promise<T> {
    if (this.running >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.running += 1;
    try {
      const result = await task();
      return result;
    } finally {
      this.running -= 1;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
