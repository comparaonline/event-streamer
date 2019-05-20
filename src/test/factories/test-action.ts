import { Action } from '../../action';
import { TestInputEvent } from './test-input-event';

export class TestAction extends Action {
  static perform = jest.fn(async (event: TestInputEvent) => {
    if (event.value === 'throw') {
      throw new Error('Test Error');
    }
  });
  perform = TestAction.perform;
}
