import { TestServer, TestInputEvent, TestOutputEvent } from '../test-helpers';
import { Router } from '../router';
import { TestOutputAction } from '../test/factories/test-output-action';

describe('TestHelpers', () => {
  describe('TestRouter', () => {
    it('routes the events', async () => {
      const router = new Router();
      router.add(TestInputEvent, TestOutputAction);
      const output = new TestOutputEvent();
      TestOutputAction.outputEvent = output;
      const server = new TestServer(router);
      server.input({ code: TestInputEvent.name, value: 'test' });
      expect(await server.emitted()).toStrictEqual([output]);
    });
  });
});
