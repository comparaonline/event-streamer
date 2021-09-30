import { EventEmitter } from 'events';

let notifier = new EventEmitter();

export class Notifier {
  static getInstance() : EventEmitter {
    return notifier;
  }

  static refreshInstance() : void {
    notifier = new EventEmitter();
  }
}
