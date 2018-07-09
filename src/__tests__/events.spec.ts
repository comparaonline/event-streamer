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
});

describe('OutputEvent', () => {
  class TestEvent extends OutputEvent {
    encode() { return {}; }
  }
  const event = new TestEvent();

  it('gets the event code from the class name', () => {
    expect(event.code).toEqual('TestEvent');
  });

  describe('#toJSON', () => {
    it('calls #encode for base JSON representation', () => {
      const spy = spyOn(event, 'encode');
      event.toJSON();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('includes code in JSON representation', () => {
      const json = event.toJSON();
      expect(json).toHaveProperty('code', 'TestEvent');
    });
  });

  describe('#toString', () => {
    it('calls #toJSON', () => {
      const spy = spyOn(event, 'toJSON');
      event.toString();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
