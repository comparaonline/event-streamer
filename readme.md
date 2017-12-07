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
$ npm install event-streamer
```
yarn:
```
$ yarn add event-streamer
```

## Usage

You need to initialize the router with a server implementation.
```js
import { Router, BaseServer } from 'event-streamer';

const myServerImplementation: BaseServer = initializeMyServer();
const router = new Router(myServerImplementation);
```

We'll add some implementations in the following versions.

Then you need to add routes to the router

```js
router.add(AnInputEventClass, AnActionClass);
```

Events should implement the BaseEvent class:
```js
import { BaseEvent } from 'event-streamer';

export class AnInputEventClass extends BaseEvent {
  someParam: string;
  build(eventArgs: {}) {
    this.someParam = eventArgs.someParam;
  }
}
```

Actions should implement the BaseAction class. A SequentialAction is currently
provided, new actions will be added in the future. A SequentialAction handles one
event at a time and doesn't handle any new events until the previous one is finished.
```js
import { SequentialAction } from 'event-streamer';
import { AnOutputEventClass } from './my-output-event';

export class AnActionClass extends SequentialAction {
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

## Testing

A test server is provided to write functional tests:

```js
import { TestServer, TestEvent } from 'event-streamer/test-helpers';
import { Router } from 'event-streamer';

describe('AnActionClass', () => {
  it('responds with AnOutputEvent to AnInputEvent', async () => {
    const server = new TestServer()
    const router = new Router(server);
    loadRoutes(router);
    server.inputEvent({ code: 'AnOutputEvent', someParam: 'whatever' });
    const published = await server.publishedEvents();
    expect(published[0].extraParam).toEqual('whatever output');
  })
});
```
