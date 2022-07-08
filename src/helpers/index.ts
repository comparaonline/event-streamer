import { getConfig } from '../config';
import { Debug } from '../interfaces';

export function toArray<T>(input?: T | T[]): T[] {
  return input == null ? [] : Array.isArray(input) ? input : [input];
}

export function stringToUpperCamelCase(input: string): string {
  return (
    input.charAt(0).toUpperCase() + input.slice(1).replace(/[-_ ]./g, (x) => x[1].toUpperCase())
  );
}

export function getParsedJson<T extends Object>(input: string | Buffer): T | null {
  try {
    return JSON.parse(typeof input === 'string' ? input : input.toString());
  } catch (e) {
    return null;
  }
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
