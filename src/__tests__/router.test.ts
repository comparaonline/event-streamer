import { TestSlowAction } from '../test/factories/test-slow-action';
import { TestAction } from '../test/factories/test-action';
import { RouteStrategy } from '../router';
import { testMessage } from '../test/factories/test-message';
import { testSlowMessage } from '../test/factories/test-slow-message';
import { testInvalidMessage } from '../test/factories/test-invalid-message';
import { trackAction } from '../test/action-helpers';
import { buildMessageEvent } from '../test/message-helpers';
import { testRouting } from '../test/router-helpers';
import { testRouter } from '../test/factories/test-router';

const actions = [TestAction, TestSlowAction];
const trackers = actions.map(trackAction);
describe('Router', () => {
  let results: string[];
  beforeEach(() => {
    results = [];
    trackers.map(tracker => tracker(results));
  });
  afterEach(() => actions.forEach((action: any) => action.restore()));

  describe('routing order', () => {
    it('routes events in parallel by default', async () => {
      const messages = [
        buildMessageEvent(testSlowMessage()),
        buildMessageEvent(testMessage())
      ];
      await testRouting(messages);
      expect(results).toStrictEqual(['Test Message', 'Slow Message']);
    });

    it('routes events sequentially', async () => {
      const messages = [
        buildMessageEvent(testSlowMessage()),
        buildMessageEvent(testMessage())
      ];
      await testRouting(messages, RouteStrategy.SEQUENTIAL_ROUTE);
      expect(results).toStrictEqual(['Slow Message', 'Test Message']);
    });

    it('routes in parallel, but dispatches sequentially', async () => {
      const messages = [
        buildMessageEvent(testSlowMessage('Slow Message 2', 200)),
        buildMessageEvent(testSlowMessage('Slow Message 1', 100)),
        buildMessageEvent(testMessage())
      ];
      await testRouting(messages, RouteStrategy.PARALLEL_ROUTE_SEQUENTIAL_DISPATCH);
      expect(results).toStrictEqual(['Test Message', 'Slow Message 2', 'Slow Message 1']);
    });
  });

  it('resolves without doing anything on unknown events', async () => {
    const messages = [
      buildMessageEvent(testInvalidMessage(JSON.stringify({ code: 'unknown' })))
    ];
    await testRouting(messages);
    expect(TestAction.perform).not.toBeCalled();
    expect(TestSlowAction.perform).not.toBeCalled();

  });

  describe('canRoute', () => {
    it('returns true for known events', () => {
      const router = testRouter();
      expect(router.canRoute('TestInputEvent')).toBeTruthy();
    });

    it('returns false for unkknown events', () => {
      const router = testRouter();
      expect(router.canRoute('TestUnknownEvent')).toBeFalsy();
    });
  });
});
