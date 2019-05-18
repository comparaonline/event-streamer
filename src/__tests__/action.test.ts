import { Server } from '../server';
import { TestOutputEvent } from '../test/factories/test-output-event';
import { TestOutputAction } from '../test/factories/test-output-action';

describe('Action', () => {
  it('emits', async () => {
    const output = jest.fn();
    const server: Server = { output } as any;
    const action = new TestOutputAction(server);
    const event = new TestOutputEvent();
    TestOutputAction.outputEvent = event;
    await action.perform();
    expect(output).toHaveBeenCalledWith(event);
  });
});
