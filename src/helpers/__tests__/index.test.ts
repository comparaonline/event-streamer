import { getParsedJson, settlesWithin, stringToUpperCamelCase, toArray, validateTestingConfig } from '..';
import { setConfig } from '../../config';

describe('Helpers', () => {
  describe('toArray', () => {
    it('Should return array', () => {
      expect(toArray('string')).toMatchObject(['string']);
      expect(toArray(['string'])).toMatchObject(['string']);
      expect(toArray()).toMatchObject([]);
    });
  });

  describe('stringToUpperCamelCase', () => {
    it('Should always return an upper camel case string', () => {
      const result = 'MyUpperCaseString';
      const inputs = ['my-upper-case-string', 'myUpperCaseString', 'MyUpperCaseString'];
      for (const input of inputs) {
        expect(stringToUpperCamelCase(input)).toBe(result);
      }
    });
  });

  describe('getParsedJson', () => {
    it('Should return an object from valid json string', () => {
      expect(getParsedJson('{ "firstName": "Rodrigo" }')).toMatchObject({ firstName: 'Rodrigo' });
    });

    it('Should return an object from valid json buffer', () => {
      expect(getParsedJson(Buffer.from('{ "lastName": "Cabral" }', 'utf-8'))).toMatchObject({
        lastName: 'Cabral'
      });
    });

    it('Should return null from an invalid json string', () => {
      expect(getParsedJson('{ "firstNa')).toBe(null);
    });

    it('Should return null from null', () => {
      expect(getParsedJson(null)).toBe(null);
    });
  });

  describe('validateTestingConfig', () => {
    it('Should throw an exception', () => {
      // act
      setConfig({
        host: 'localhost',
        onlyTesting: false
      });

      // assert
      expect(validateTestingConfig).toThrow();
    });

    it('Should not throw an exception', () => {
      // act
      setConfig({
        host: 'localhost',
        onlyTesting: true
      });

      // assert
      expect(validateTestingConfig()).toBe(undefined);
    });
  });

  describe('settlesWithin', () => {
    it('Should return true when the promise resolves first', async () => {
      expect(await settlesWithin(Promise.resolve('done'), 5000)).toBe(true);
    });

    it('Should return true when the promise rejects first', async () => {
      // A rejected handler is finished work: the caller only asks whether anything is still pending.
      expect(await settlesWithin(Promise.reject(new Error('handler failed')), 5000)).toBe(true);
    });

    it('Should return false when the timeout elapses first', async () => {
      expect(await settlesWithin(new Promise(() => undefined), 50)).toBe(false);
    });
  });
});
