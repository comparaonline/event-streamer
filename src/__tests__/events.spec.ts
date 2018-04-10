import { InputEvent, OutputEvent } from '../events';

describe('InputEvent', () => {
  class TestEvent extends InputEvent {
    build() { }
  }

  it('gets the event code from the class name', () => {
    const event = new TestEvent({});
    expect(event.code).toEqual('TestEvent');
  });

  it('gets the event code from the class attribute', () => {
    class TestEvent extends InputEvent {
      code = 'Test';
      build() { }
    }
    const event = new TestEvent({});
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

  it('gets the event code from the class attribute', () => {
    class TestEvent extends OutputEvent {
      code = 'Test';
      encode() { return {}; }
    }
    const event = new TestEvent();
    expect(event.code).toEqual('Test');
  });
});
