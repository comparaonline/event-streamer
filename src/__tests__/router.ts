import { Router } from '../router';
import { BaseServer, BindingCallback } from '../base-server';
import { SequentialAction } from '../action/sequential-action';
import { BaseEvent } from '../event';
import { marbles } from 'rxjs-marbles';
import { ReplaySubject } from 'rxjs/ReplaySubject';
import { Observable } from 'rxjs/Observable';
import { TestServer, TestEvent } from '../test-helpers';

describe('Router', () => {
  class FakeInputEvent extends TestEvent { }
  class FakeOutputEvent extends TestEvent { }

  describe('acceptance tests', () => {
    it('correctly routes an event', async () => {
      const outputEvent = new FakeOutputEvent({});
      class TestAction extends SequentialAction {
        emitFakeEvent = this.emitter(FakeOutputEvent);
        async perform() {
          this.emitFakeEvent(outputEvent);
        }
      }

      const server = new TestServer();
      const router = new Router(server);
      router.add(FakeInputEvent, TestAction);

      server.inputEvent({ code: 'FakeInputEvent' });
      expect(await server.publishedEvents()).toEqual([outputEvent]);
    });
  });

  describe('event filtering logic', () => {
    class FakeAction extends SequentialAction {
      async perform() { }
    }

    it('handles registered events', () => {
      const router = new Router(new TestServer());
      router.add(FakeInputEvent, FakeAction);
      expect(router.willHandle({ code: 'FakeInputEvent' })).toBeTruthy();
    });
    it('does not handle unknown events', () => {
      const router = new Router(new TestServer());
      router.add(FakeInputEvent, FakeAction);
      expect(router.willHandle({ code: 'UnknownInputEvent' })).toBeFalsy();
    });
  });
});
