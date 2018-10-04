import { expect } from 'chai';
import { InputEvent, OutputEvent } from '../events';

describe('InputEvent', () => {
  class TestEvent extends InputEvent {
    build() { }
  }

  it('gets the event code from the class name', () => {
    expect(TestEvent.code).to.equal('TestEvent');
  });

  it('gets the event code from the class static getter', () => {
    class TestEvent extends InputEvent {
      static get code() { return 'Test'; }
      build() { }
    }
    expect(TestEvent.code).to.equal('Test');
  });
});

describe('OutputEvent', () => {
  class TestEvent extends OutputEvent {
    encode() { return {}; }
  }

  it('gets the event code from the class name', () => {
    const event = new TestEvent();
    expect(event.code).to.equal('TestEvent');
  });

  it('returns the JSON representation on toString()', () => {
    const event = new TestEvent();
    expect(JSON.parse(event.toString())).to.deep.equal({
      code: 'TestEvent'
    });
  });

  it('gets the event code from the class attribute', () => {
    class TestEvent extends OutputEvent {
      code = 'Test';
      encode() { return {}; }
    }
    const event = new TestEvent();
    expect(event.code).to.equal('Test');
  });
});
