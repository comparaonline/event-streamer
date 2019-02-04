import { Subject, Subscription } from 'rxjs';
import { ConsumerStreamMessage } from 'node-rdkafka';

export interface Partition {
  observer: Subject<ConsumerStreamMessage>;
  subscription: Subscription;
}
