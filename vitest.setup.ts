import { vi } from 'vitest';
import MockDate from 'mockdate';

vi.mock('mockdate', () => {
  return {
    default: {
      set: (date: string | number | Date) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(date);
      },
      reset: () => {
        vi.useRealTimers();
      },
    },
  };
});
