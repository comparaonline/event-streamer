import { InputEvent, OutputEvent } from './events';
import { Server } from './server';

export interface ActionCtor {
  new(server: Server): Action;
}

export abstract class Action {
  constructor(private server: Server) {}

  abstract perform(event: InputEvent): Promise<any>;

  protected emit(event: OutputEvent): Promise<void> {
    return this.server.output(event);
  }
}
