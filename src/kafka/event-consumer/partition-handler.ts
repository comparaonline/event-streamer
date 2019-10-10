import { GroupedObservable, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Message } from 'kafka-node';
import { Databag } from '../../lib/databag';
import { RawEvent } from '../../raw-event';
import { Router } from '../../router';

export class PartitionHandler {
  constructor(
    private consumerGroup: string,
    private router: Router
  ) { }

  handle(partition: GroupedObservable<string, Databag<Message>>) {
    return partition.pipe(
      Databag.setMany({
        partition: partition.key,
        consumerGroup: this.consumerGroup
      }),
      Databag.inside(this.buildEvent()),
      this.process()
    );
  }

  private process() {
    return (obs: Observable<Databag<RawEvent>>) => obs.pipe(
      Databag.inside(this.router.route())
    );
  }

  private buildEvent() {
    return map((message: Message) => RawEvent.parse(message.value.toString()));
  }
}
