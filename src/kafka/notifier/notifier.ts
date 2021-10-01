import { EventEmitter } from 'events';

const notifier = new EventEmitter();

export class Notifier {
  static getInstance() : EventEmitter {
    return notifier;
  }
}
