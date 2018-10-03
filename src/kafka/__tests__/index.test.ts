import { expect } from 'chai';
import * as index from '..';

describe('index', () => {
  [
    'KafkaInputEvent',
    'KafkaOutputEvent',
    'KafkaServer'
  ].forEach((module) => {
    it(`re-exports the ${module} module`, () => {
      expect(index[module]).to.be.a('function');
    });
  });
});
