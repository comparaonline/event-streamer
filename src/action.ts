import * as opentracing from 'opentracing';
import { InputEvent, OutputEvent } from './events';
import { Server } from './server';

export interface ActionCtor {
  new(server: Server, span?: opentracing.Span): Action;
}

export abstract class Action {
  constructor(private server: Server, public span?: opentracing.Span) {}

  abstract perform(event: InputEvent): Promise<any>;

  protected emit(event: OutputEvent): Promise<void> {
    return this.server.output(event, this.span);
  }
}
