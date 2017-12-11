import { Router, SequentialRouter } from '../router';
import { BaseServer, BindingCallback } from '../base-server';
import { Action } from '../action';
import { BaseEvent } from '../event';
import { marbles } from 'rxjs-marbles';
import { ReplaySubject } from 'rxjs/ReplaySubject';
import { Observable } from 'rxjs/Observable';
import { TestServer, TestEvent } from '../test-helpers';
import { resolve } from 'path';

describe('Router', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  class FakeInputEvent extends TestEvent { }
  class FakeOutputEvent extends TestEvent { }

  // tslint:disable-next-line variable-name
  const routerExamples = (RouterType: typeof Router) => {
    describe(RouterType.name, () => {
      it('routes an event', async () => {
        class TestAction extends Action {
          emitFakeEvent = this.emitter(FakeOutputEvent);
          async perform() {
            this.emitFakeEvent(new FakeOutputEvent());
          }
        }

        const router = new RouterType();
        const server = new TestServer(router);
        router.add(FakeInputEvent, TestAction);

        server.inputEvent({ code: 'FakeInputEvent' });
        const eventCodes = (await server.publishedEvents()).map(e => e.code);
        expect(eventCodes).toEqual(['FakeOutputEvent']);
      });

      it('routes an async event', async () => {
        class TestAction extends Action {
          emitFakeEvent = this.emitter(FakeOutputEvent);
          async perform() {
            const emit = () => {
              this.emitFakeEvent(new FakeOutputEvent());
              resolve();
            };
            setTimeout(emit, 1000);
          }
        }

        const router = new RouterType();
        const server = new TestServer(router);
        router.add(FakeInputEvent, TestAction);

        server.inputEvent({ code: 'FakeInputEvent' });
        const publishedEvents = server.publishedEvents();
        jest.runTimersToTime(1000);
        const eventCodes = (await publishedEvents).map(e => e.code);
        expect(eventCodes).toEqual(['FakeOutputEvent']);
      });
    });
  };

  [Router, SequentialRouter].forEach(routerExamples);

  describe('SequentialRouter', () => {
    it('executes actions sequentially', async () => {
      class FakeInputEvent2 extends TestEvent { }
      class FakeOutputEvent2 extends TestEvent { }
      class TestAction1 extends Action {
        emitFakeEvent = this.emitter(FakeOutputEvent);
        perform() {
          return new Promise<void>((resolve: Function) => {
            const emit = () => {
              this.emitFakeEvent(new FakeOutputEvent());
              resolve();
            };
            setTimeout(emit, 1000);
          });
        }
      }
      class TestAction2 extends Action {
        emitFakeEvent2 = this.emitter(FakeOutputEvent2);
        async perform() {
          this.emitFakeEvent2(new FakeOutputEvent2());
        }
      }

      const router = new SequentialRouter();
      const server = new TestServer(router);
      router.add(FakeInputEvent, TestAction1);
      router.add(FakeInputEvent2, TestAction2);

      server.inputEvent({ code: 'FakeInputEvent' });
      server.inputEvent({ code: 'FakeInputEvent2' });
      const publishedEvents = server.publishedEvents();
      jest.runTimersToTime(1000);

      const eventCodes = (await publishedEvents).map(e => e.code);
      expect(eventCodes).toEqual(['FakeOutputEvent', 'FakeOutputEvent2']);

    });
  });


  describe('event filtering logic', () => {
    class FakeAction extends Action {
      async perform() { }
    }

    it('handles registered events', () => {
      const router = new Router();
      const server = new TestServer(router);
      router.add(FakeInputEvent, FakeAction);
      expect(router.willHandle({ code: 'FakeInputEvent' })).toBeTruthy();
    });
    it('does not handle unknown events', () => {
      const router = new Router();
      const server = new TestServer(router);
      router.add(FakeInputEvent, FakeAction);
      expect(router.willHandle({ code: 'UnknownInputEvent' })).toBeFalsy();
    });
  });
});
