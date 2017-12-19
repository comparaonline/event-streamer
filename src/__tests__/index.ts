import * as index from '../index';

describe('index', () => {
  it('re-exports the basic components', () => {
    const components = [
      'Router',
      'SequentialRouter',
      'BaseServer',
      'BaseEvent',
      'Action',
      'KafkaEvent',
      'KafkaServer'
    ];
    components.forEach (component => expect(index[component]).toBeDefined());
  });
});
