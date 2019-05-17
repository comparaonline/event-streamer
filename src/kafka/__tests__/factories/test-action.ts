import { Action } from '../../../action';

export class TestAction extends Action {
  perform = jest.fn();
}
