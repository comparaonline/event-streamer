import { BaseEvent } from '../index';

describe('BaseEvent', () => {
  it('gets the class code from the class name', () => {
    class TestEvent extends BaseEvent {
      build() { }
    }
    expect(TestEvent.code).toEqual('TestEvent');
  });
  it('gets the instance code from the class name', () => {
    class TestEvent extends BaseEvent {
      build() { }
    }
    const event = new TestEvent({});
    expect(event.code).toEqual('TestEvent');
  });
  it('returns the string "Event eventname" on toString()', () => {
    class TestEvent extends BaseEvent {
      build() { }
    }
    const event = new TestEvent({});
    expect(JSON.parse(event.toString())).toEqual({
      code: 'TestEvent'
    });
  });
});
