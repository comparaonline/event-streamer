import { getParsedJson, reportDataLoss, settlesWithin, stringToUpperCamelCase, toArray, validateTestingConfig } from '..';
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

  describe('reportDataLoss', () => {
    it('Should print even with library logging turned off', () => {
      // The whole point: DEFAULT_CONFIG sets no debug level, so debug() would print nothing here and
      // the message about discarded messages would be as silent as the loss it reports.
      setConfig({ host: 'localhost', debug: false });
      const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      reportDataLoss('discarding', 3, 'in-flight messages');

      expect(error).toHaveBeenCalledWith('[event-streamer]', 'discarding', 3, 'in-flight messages');
      error.mockRestore();
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
