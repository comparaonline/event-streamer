import { InputEvent, OutputEvent } from '../events';

describe('InputEvent', () => {
  class TestEvent extends InputEvent {
    build() { }
  }

  it('gets the event code from the class name', () => {
    expect(TestEvent.code).toEqual('TestEvent');
  });

  it('gets the event code from the class static getter', () => {
    class TestEvent extends InputEvent {
      static get code() { return 'Test'; }
      build() { }
    }
    expect(TestEvent.code).toEqual('Test');
  });

  it('copies the properties from the raw event by default', () => {
    class TestEvent extends InputEvent {
      public value: string;
    }
    const testEvent = new TestEvent({ value: 'test' });
    expect(testEvent).toHaveProperty('value', 'test');
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
    expect(JSON.parse(event.toString())).toEqual(expect.objectContaining({
      code: 'TestEvent'
    }));
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
