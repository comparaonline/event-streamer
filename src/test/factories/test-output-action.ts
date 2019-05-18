import { Action } from '../../action';
import { KafkaOutputEvent } from '../../kafka';

export class TestOutputAction extends Action {
  public outputEvent: KafkaOutputEvent;
  async perform() {
    await this.emit(this.outputEvent);
  }
}
