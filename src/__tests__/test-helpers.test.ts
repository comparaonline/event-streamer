import { TestServer, TestInputEvent, TestOutputEvent } from '../test-helpers';
import { Router } from '../router';
import { TestOutputAction } from '../test/factories/test-output-action';

describe('TestHelpers', () => {
  describe('TestRouter', () => {
    let server: TestServer;
    beforeEach(() => {
      const router = new Router();
      router.add(TestInputEvent, TestOutputAction);
      server = new TestServer(router);
    });

    it('routes an event', async () => {
      const output = new TestOutputEvent();
      TestOutputAction.outputEvent = output;

      await server.input({ code: TestInputEvent.name, value: 'test' });
      expect(server.emitted()).toStrictEqual([output]);
    });

    it('routes multiple events', async () => {
      const output = new TestOutputEvent();
      TestOutputAction.outputEvent = output;

      await server.input({ code: TestInputEvent.name, value: 'test' });
      await server.input({ code: TestInputEvent.name, value: 'test' });
      expect(server.emitted()).toStrictEqual([output, output]);
    });

    describe('cleanEmitted', () => {
      it('should clean emitted events list', async () => {
        const output = new TestOutputEvent();
        TestOutputAction.outputEvent = output;

        await server.input({ code: TestInputEvent.name, value: 'test' });
        await server.input({ code: TestInputEvent.name, value: 'test' });
        expect(server.emitted()).toStrictEqual([output, output]);

        server.cleanEmitted();

        expect(server.emitted().length).toBe(0);
      });
    });
  });
});
