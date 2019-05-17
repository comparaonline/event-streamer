import kafkaNode = require('../../../__mocks__/kafka-node');

export const registeredEvent = (className: string, event: string) => {
  it(`listens for the ${event} event on ${className}`, () => {
    const listeners = kafkaNode.spies.listeners.get(className) || fail();
    expect(listeners.get(event)).toBeTruthy();
  });
};
