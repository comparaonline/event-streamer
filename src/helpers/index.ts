import { getConfig } from '../config';
import { Debug } from '../interfaces';

export function toArray<T>(input?: T | T[]): T[] {
  return input == null ? [] : Array.isArray(input) ? input : [input];
}

export function stringToUpperCamelCase(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1).replace(/[-_ ]./g, (x) => x[1].toUpperCase());
}

export function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function getSubjectName(topic: string, schemaName: string): string {
  // Remove 'Schema' suffix if present to get event code
  const eventCode = schemaName.replace(/Schema$/, '');

  // Convert both topic and event code to kebab-case using same logic as producer
  const topicKebab = toKebabCase(topic);
  const eventCodeKebab = toKebabCase(eventCode);

  // Use same format as runtime: {topic}-{eventCode}
  const subject = `${topicKebab}-${eventCodeKebab}`;
  return subject;
}

export function getParsedJson<T extends Object>(input: string | Buffer | null): T | null {
  try {
    if (input == null) {
      return null;
    }
    return JSON.parse(typeof input === 'string' ? input : input.toString());
  } catch (_e) {
    return null;
  }
}

/* istanbul ignore next */
export function debug(level: Debug, ...args: unknown[]): void {
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
