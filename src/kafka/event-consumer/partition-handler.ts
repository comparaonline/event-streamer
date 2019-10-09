import { GroupedObservable, Observable } from 'rxjs';
import { Message } from 'kafka-node';
import { Databag } from '../../lib/databag';
import { RawEvent } from '../../raw-event';
import { Tracer } from '../../tracer';
import { Router } from '../../router';
import { tap, map } from 'rxjs/operators';
import { TracerEvent } from '../../tracer/tracer-event';

export class PartitionHandler {
  private tracer = Tracer.instance();

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
      this.setupTracer(),
      this.process()
    );
  }

  private setupTracer() {
    return (obs: Observable<Databag<RawEvent>>) => obs.pipe(
      Databag.setWithBag('context', bag => this.tracer.startTracing(bag.data)
        .set('partition', bag.get('partition'))
        .set('consumerGroup', bag.get('consumerGroup'))
      )
    );
  }

  private trace<A>(eventName: TracerEvent, event: 'next' | 'error' | 'complete' = 'next') {
    const handler = (data: Databag<A>) =>
      this.tracer.emit(eventName, data.get('context'));
    return tap(...['next', 'error', 'complete']
      .map(name => name !== event ? undefined : handler)
    );
  }

  private process() {
    return (obs: Observable<Databag<RawEvent>>) => obs.pipe(
      this.trace(TracerEvent.process),
      Databag.inside(this.router.route()),
      this.trace(TracerEvent.processFinished),
      this.trace(TracerEvent.processError, 'error')
    );
  }

  private buildEvent() {
    return map((message: Message) => RawEvent.parse(message.value.toString()));
  }
}
