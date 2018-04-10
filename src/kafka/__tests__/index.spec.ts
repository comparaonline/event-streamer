import * as index from '../index';

describe('index', () => {
  [
    'KafkaInputEvent',
    'KafkaOutputEvent',
    'KafkaServer'
  ].forEach((module) => {
    it(`re-exports the ${module} module`, () => {
      expect(index[module]).toBeDefined();
    });
  });
});
