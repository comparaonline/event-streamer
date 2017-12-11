import 'reflect-metadata';
import { BaseEvent } from '../../event';
import { Action } from '../index';

describe('emitter', () => {
  class NewBalance extends BaseEvent {
    build(receivedEvent: Object) { }
    property = 'test';
  }
  class Test extends Action {
    async perform() { }
    emitNewBalance = this.emitter(NewBalance);
  }

  it('injects an emitter into a class', () => {
    const test = new Test();
    expect(test.emitNewBalance).toBeInstanceOf(Function);
    expect(test.emitNewBalance).toHaveLength(1);
  });

  it('emit the events to the results subject', () => {
    const test = new Test();
    const event = new NewBalance({});
    const mock = (<any>test).result.next = jest.fn();
    test.emitNewBalance(event);
    expect(mock).toHaveBeenCalledWith(event);
  });

  it('adds the event metadata to the action object', () => {
    const metadata = Reflect.getMetadata(Symbol.for('emits'), Test);
    expect(metadata).toEqual(new Set([NewBalance]));
  });
});
