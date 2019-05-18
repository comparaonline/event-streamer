import { Action } from '../../action';
import { TestSlowInputEvent } from './test-slow-input-event';

export class TestSlowAction extends Action {
  static perform = jest.fn(async (event: TestSlowInputEvent) => {
    await new Promise(resolve => setTimeout(resolve, event.delay));
  });
  perform = TestSlowAction.perform;
}
