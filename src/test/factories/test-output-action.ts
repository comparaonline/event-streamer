import { Action } from '../../action';
import { KafkaOutputEvent } from '../../kafka';

export class TestOutputAction extends Action {
  public static outputEvent: KafkaOutputEvent;
  async perform() {
    await this.emit(TestOutputAction.outputEvent);
  }
}
