import * as index from '../index';

describe('index', () => {
  [
    'Router',
    'InputEvent',
    'OutputEvent',
    'Action',
    'Server'
  ].forEach((module) => {
    it(`re-exports the ${module} module`, () => {
      expect(index[module]).toBeDefined();
    });
  });
});
