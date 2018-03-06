# Event Streamer

## WARNING!
This is a very early release!! It's not intended to be used yet, it still lacks
some critical features

## Description
Event Streamer is a simple framework for building microservices connected by event
streams.

One of the biggest issues with event based systems is having a good documentation
of which events are being produced and consumed by different microservices, so
this framework takes a self-documenting approach, all actions have metadata
available with which events they might produce.

The framework is intended to be used with Typescript, though Javascript should
work, you won't be able to take advantage of the type checks.

## Installation
npm:
```
$ npm install @comparaonline/event-streamer
```
yarn:
```
$ yarn add @comparaonline/event-streamer
```

## Usage

You need to initialize the server with a router implementation.
```js
import { Router, BaseServer } from 'event-streamer';

const router = new Router();
const myServerImplementation: BaseServer = new MyCustomServer(router);
```

You have two types of router available. The default `Router` will process the actions
in parallel and return the output events as soon as they are emitted. There's also
a `SequentialRouter` that will process events in the order they are received
(i.e. it will not process the next event until the previous one finishes).

## KafkaServer

You can use the KafkaServer implementation to consume/produce from Kafka
```typescript
import * as config from 'config';
import { KafkaServer } from 'event-streamer';
import { router } from './router';

const server = new KafkaServer(router, config.get('kafka'));
server.start();
```

The configuration options are:
```typescript
export interface KafkaConfiguration {
  producer?: {
    'client.id'?: string,
    'metadata.broker.list'?: string,
    'compression.codec'?: string,
    'retry.backoff.ms'?: number,
    'message.send.max.retries'?: number,
    'socket.keepalive.enable'?: boolean,
    'queue.buffering.max.messages'?: number,
    'queue.buffering.max.ms'?: number,
    'batch.num.messages'?: number
  };
  consumer?: {
    'group.id'?: string,
    'metadata.broker.list'?: string
  };
  consumerTopics: string[];
  consumerTopicConfiguration?: {};
  producerTopic?: string;
  rest?: {
    url?: string
  };
}
```

Then you need to add routes to the router

```typescript
router.add(AnInputEventClass, AnActionClass);
```

Events should implement the BaseEvent class:
```typescript
import { BaseEvent } from 'event-streamer';

export class AnInputEventClass extends BaseEvent {
  someParam: string;
  build(eventArgs: {}) {
    this.someParam = eventArgs.someParam;
  }
}
```

Actions should implement the Action class.
```typescript
import { Action } from 'event-streamer';
import { AnOutputEventClass } from './my-output-event';

export class AnActionClass extends Action {
  private emitOutput = this.emitter(AnOutputEventClass);

  async perform(inputEvent: AnInputEventClass) {
    if (inputEvent.someParam === 'whatever') {
      this.emitOutput(new AnOutputEventClass({
        extraParam: `${inputEvent.someParam} output`
      }));
    }
  }
}
```

The action is considered finished when the `perform` promise resolves.

## Triggering events locally

You can start an action locally by calling the `trigger` method on the KafkaServer

```typescript
server.trigger(new CustomEvent(someParams));
```

## Testing

A test server is provided to write functional tests:

```typescript
import { Router, TestServer, TestEvent } from 'event-streamer';

describe('AnActionClass', () => {
  it('responds with AnOutputEvent to AnInputEvent', async () => {
    const router = new Router();
    const server = new TestServer(router)
    loadRoutes(router);
    server.inputEvent({ code: 'AnOutputEvent', someParam: 'whatever' });
    const published = await server.publishedEvents();
    expect(published[0].extraParam).toEqual('whatever output');
  })
});
```
