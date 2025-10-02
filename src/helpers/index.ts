import { getConfig } from '../config';

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

export function validateTestingConfig(): void {
  const config = getConfig();
  if (config.onlyTesting !== true) {
    throw new Error('This method only can be called on only testing mode');
  }
}
