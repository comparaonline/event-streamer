import { BaseEvent, InputEvent, OutputEvent } from '../index';

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

describe('InputEvent', () => {
  class TestEvent extends InputEvent {
    build() { }
  }

  it('gets the event code from the rawInput', () => {
    const event = new TestEvent({ code: 'Test' });
    expect(event.code).toEqual('Test');
  });
});

describe('OutputEvent', () => {
  class TestEvent extends OutputEvent {
    encode() { return {}; }
  }

  it('gets the event code from the class name', () => {
    const event = new TestEvent();
    expect(event.code).toEqual('TestEvent');
  });
  it('returns the JSON representation on toString()', () => {
    const event = new TestEvent();
    expect(JSON.parse(event.toString())).toEqual({
      code: 'TestEvent'
    });
  });
});
