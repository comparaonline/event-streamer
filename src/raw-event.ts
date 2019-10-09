import { tryParse } from './lib/try-parse';

export class RawEvent {
  code: string;

  static isValid(obj: any): obj is RawEvent {
    return typeof obj === 'object'
      && typeof obj.code === 'string'
      && obj.code !== '';
  }

  static parse(json: string): RawEvent {
    return tryParse(json, { code: '' });
  }
}
