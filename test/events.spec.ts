import { expect } from 'chai';
import { spy } from 'sinon';

import { InputEvent, OutputEvent } from '../src/events';

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
  const event = new TestEvent();

  it('gets the event code from the class name', () => {
    expect(event.code).to.equal('TestEvent');
  });

  describe('#toJSON', () => {
    it('calls #encode for base JSON representation', () => {
      const encodeSpy = spy(event, 'encode');
      event.toJSON();
      expect(encodeSpy).to.have.been.calledOnce;
    });

    it('includes code in JSON representation', () => {
      const json = event.toJSON();
      expect(json).to.have.property('code', 'TestEvent');
    });
  });

  describe('#toString', () => {
    it('calls #toJSON', () => {
      const toJSONSpy = spy(event, 'toJSON');
      event.toString();
      expect(toJSONSpy).to.have.been.calledOnce;
    });
  });
});
