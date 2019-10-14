import * as opentracing from 'opentracing';
import { GroupedObservable, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Message } from 'kafka-node';
import { Databag } from '../../lib/databag';
import { RawEvent } from '../../raw-event';
import { Router } from '../../router';

const tracer = opentracing.globalTracer();

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
      this.buildEvent(),
      this.process()
    );
  }

  private process() {
    return (obs: Observable<Databag<RawEvent>>) => obs.pipe(
      Databag.insideWithBag(bag => this.router.route(bag.get('span')))
    );
  }

  private buildEvent() {
    return (obs: Observable<Databag<Message>>) => obs.pipe(
      tap(bag => bag.set('build-event-span', tracer.startSpan(
        'event-streamer.partition-handler.build-event',
        { childOf: bag.get('span'), tags: { 'span.type': 'Custom' } }
      ))),
      Databag.inside(map(message => RawEvent.parse(message.value.toString()))),
      tap(bag => bag.get<opentracing.Span>('build-event-span').finish())
    );
  }
}
