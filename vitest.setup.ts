import { afterEach, vi } from 'vitest';
import MockDate from 'mockdate';

afterEach(() => {
  MockDate.reset();
  vi.useRealTimers();
  vi.clearAllTimers();
});
