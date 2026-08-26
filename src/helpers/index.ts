import { getConfig } from '../config';
import { Debug } from '../interfaces';

export function toArray<T>(input?: T | T[]): T[] {
  return input == null ? [] : Array.isArray(input) ? input : [input];
}

export function stringToUpperCamelCase(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1).replace(/[-_ ]./g, (x) => x[1].toUpperCase());
}

export function getParsedJson<T extends Object>(input: string | Buffer | null): T | null {
  try {
    if (input == null) {
      return null;
    }
    return JSON.parse(typeof input === 'string' ? input : input.toString());
  } catch (e) {
    return null;
  }
}

/**
 * Resolves true when `promise` settles first and false when `ms` elapses first. Rejections count as
 * settled: the caller only needs to know whether the work is still pending. The timer is always
 * cleared, so a fast settle does not keep the process alive waiting for it.
 */
export async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([
      promise.then(
        () => true,
        () => true
      ),
      timedOut
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reports something the library lost. This deliberately bypasses debug(): DEFAULT_CONFIG sets no
 * debug level, so for any app that has not opted into library logging debug() prints nothing -- and
 * a shutdown that drops in-flight messages would be exactly as silent as the bug it is reporting.
 */
export function reportDataLoss(...args: unknown[]): void {
  console.error('[event-streamer]', ...args);
}

/* istanbul ignore next */
export function debug(level: Debug, ...args: any[]): void {
  const configLevel = getConfig().debug;
  if (configLevel != null && configLevel !== false && configLevel <= level) {
    switch (level) {
      case Debug.TRACE:
        console.trace(args);
        break;
      case Debug.DEBUG:
      case Debug.INFO:
        console.log(args);
        break;
      case Debug.WARN:
        console.warn(args);
        break;
      case Debug.ERROR:
      case Debug.FATAL:
        console.error(args);
    }
  }
}

export function validateTestingConfig(): void {
  const config = getConfig();
  if (config.onlyTesting !== true) {
    throw new Error('This method only can be called on only testing mode');
  }
}
