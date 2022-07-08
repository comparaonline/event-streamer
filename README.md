# Event Streamer

## Description

Event Streamer is a library for connect micro services based on kafka event communication.

This is a wrap of [kafka-node](https://www.npmjs.com/package/kafka-node) simplifying connection, errors and topic with subject (event name, event code).

## Installation

yarn:
```
$ yarn add @comparaonline/event-streamer
```

## Initialization

Before use it, it should be initialized calling the method `setConfig`

### Basic producer configuration

With this it will be enough to produce any message

```ts
import { setConfig } from '@comparaonline/events-streamer'

setConfig({
  host: 'kafka:9092'
})
```

### Basic consumer configuration

The only difference if you also need to consume events is that consumer group id is **required**

```ts
import { setConfig } from '@comparaonline/events-streamer'

setConfig({
  host: 'kafka:9092',
  consumer: {
    groupId: 'my-group-id'
  }
})
```

### Full configuration

| Prop | Type | Description | Use |
| --- | --- | --- | --- |
| host | string | Kafka broker, it also can be separated using colons (Eg: `kafka-broker-1:9092,kafka-broker-2:9092`) | **required** |
| producer | Object | Object | *optional* |
| producer.partitionerType | ProducerPartitionerType (number) | Choose how the producer will send the messages | *optional* <br/> default: CYCLIC (2) |
| producer.additionalHosts | string[] | Additional hosts to send a message. This is useful if you need to send information to two or more different clusters | *optional* |
| producer.retryOptions | RetryOptions (Object) | kafka-node retry options: retries, factor, minTimeout, maxTimeout and randomize | *optional* |
| consumer | Object | Object | *required to start consumer* |
| consumer.groupId | string | Kafka group id | **required** |
| consumer.autoCommit | boolean | Choose commit method, if autoCommit is set to true performance will be increased but also some messages can be lost | *optional* <br/> default: false |
| consumer.fetchSizeInMB | number | It determines the max pool of messages to be fetched from the broker. <br/>**`IMPORTANT:`** If your application expects messages bigger than 3MB then increase this value, otherwise consumer partition will be stuck and think about your implementation :) | *optional* <br/> default: 3 |
| debug | false or Debug | Increase library logging based on Debug level | *optional* default: false |
| onlyTesting | boolean | Avoid kafka server communication, instead of send/consume messages it will be enable extra methods for unit testing | *optional* <br/> default: false

## Usage

### Event subject

Event subject, event code or event name is intended to allow send multiple messages into the same topic but handling them in different ways.

*Produced* messages will be delivered as JSON string with an extra property called 'code'. This `code` will be the event subject. Subject will be always passed to UpperCamelCase replacing `-_ ` and transforming the first character after each of them into upper case. Eg:

* `my-event-name`
* `my event name`
* `my_event_name`
* `myEventName`

All this will be transformed to `MyEventName`

If a subject is not provided then the topic will be transformed to UpperCamelCase and sended as subject.

*Consumed* messages with invalid JSON will be ignored. If the messages is a valid JSON but without `code` property it will be only handled by global listeners.

### Producing

Event streamer will create and close kafka client on demand to avoid keeping open connections.
Produced events will be delivered the `data` object into a single topic as JSON string with the corresponding subject.

#### Single event

```ts
import { emit } from '@comparaonline/event-streamer'

// Remember to call setConfig before use this method

async function main () {
  await emit({
    topic: 'my-topic',
    eventName: 'my-event-name',
    data: { firstName: 'John' }
  })
  
  // Topic: my-topic Message: { "firstName": "John", "code": "MyEventName" }

}
```

#### Two events to the same topic

```ts
import { emit } from '@comparaonline/event-streamer'

async function main () {
  await emit({
    topic: 'my-topic',
    eventName: 'my-event-name',
    data: [{ firstName: 'John' }, { firstName: 'Jane' }]
  })
  
  // Topic: my-topic Message: { "firstName": "John", "code": "MyEventName" }
  // Topic: my-topic Message: { "firstName": "Jane", "code": "MyEventName" }

}
```

#### Two events to two different topics

```ts
import { emit } from '@comparaonline/event-streamer'

async function main () {
  await emit(
    [
      {
        topic: 'my-topic-a',
        eventName: 'my-event-name',
        data: { firstName: 'John' }
      },
      {
        topic: 'my-topic-b',
        eventName: 'my-event-name',
        data: { firstName: 'Jane' }
      }
    ]
  )
  
  // Topic: my-topic-a Message: { "firstName": "John", "code": "MyEventName" }
  // Topic: my-topic-b Message: { "firstName": "Jane", "code": "MyEventName" }
}
```

#### Single event without subject

```ts
import { emit } from '@comparaonline/event-streamer'

async function main () {
  await emit({
    topic: 'my-topic',
    data: { firstName: 'John' }
  })
  
  // Topic: my-topic Message: { "firstName": "John", "code": "MyTopic" }
}
```

#### Single event to a different host/cluster

```ts
import { emit, setConfig } from '@comparaonline/event-streamer'

setConfig({
  host: 'kafka-gpc:9092',
  producer: {
    additionalHosts: ['kafka-aws:9092']
  }
})

async function main () {
  await emit({
    topic: 'my-topic',
    data: { firstName: 'John' }
  }, 'kafka-azure:9092')
  
  // Cluster: kafka-azure:9092
  // Topic: my-topic Message: { "firstName": "John", "code": "MyTopic" }
}
```

#### Not allowed by subject

```ts
import { emit } from '@comparaonline/event-streamer'

async function main () {
  await emit({
    topic: 'my-topic',
    data: { firstName: 'John', code: 'Code' }
  }) // Throw Error: 'Reserved object keyword "code" inside data'
}
```

```ts
import { emit } from '@comparaonline/event-streamer'

async function main () {
  await emit({
    topic: 'my-topic',
    data: { firstName: 'John' },
    eventName: ''
  }) // Throw Error: 'Invalid message code'
}
```

### Consuming

You will need at least 1 topic to listen. It's important to know size of messages that will be fetched because this will determine how many messages will be processed at the same time. Eg:

| Avg message | fetchSizeInMB | Concurrent actions |
| --- | --- | --- |
| 200KB | 0.5 | 2 |
| 300KB | 0.5 | 1 |
| 200KB | 3 (default) | 14/15 |
| 600KB | 0.5 | consumer stuck |

Data object delivered to the handler (first parameter) will be an object that includes `code` property

Emit function delivered to the handler (second parameter) is the same `emit` function used to produce events, but you won't need to import it

```ts
import { ConsumerRouter } from '@comparaonline/event-streamer'

// Remember to call setConfig with a groupId

async function main () {
  const consumer = new ConsumerRouter()

  // This handler will be executed with every message from 'topic-a', even if they don't have 'code' property
  consumer.add('topic-a', (data, emit) => { console.log(1) })

  // This handler will be executed only with messages from 'topic-b' with property 'code' equal to 'EventNameB'
  consumer.add('topic-b', 'event-name-b', (data, emit) => { console.log(2) })

  // This handler will be executed with message from 'topic-c' with property 'code' equal to 'EventNameC1' or 'EventNameC2'
  consumer.add('topic-c', ['event-name-c-1', 'event-name-c-2'], (data, emit) => { console.log(3) }) 

  // This handler will be executed with every message from 'topic-d' or 'topic-e'
  consumer.add(['topic-d', 'topic-e'], (data, emit) => { console.log(4) })

  // This handler will be executed with messages from 'topic-e' or 'topic-f' with property 'code' equal to 'MyEventName'
  consumer.add(['topic-e', 'topic-f'], 'my-event-name', (data, emit) => { console.log(5) })

  // This handler will be executed with messages from 'topic-g' and 'topic-h' with property 'code' equal to 'MyEventName1' or 'MyEventName2'
  consumer.add(['topic-g', 'topic-h'], ['my-event-name-1', 'my-event-name-2'], (data, emit) => { console.log(6) })

  await consumer.start()
}
```

#### Input / Output example

| topic | code | log |
| --- | --- | --- |
| topic-a | *undefined* | 1 |
| topic-a | 'TopicA' | 1 |
| topic-a | 'MyEventName' | 1 |
| topic-b | 'EventNameA' | --- |
| topic-b | 'EventNameB' | 2 |
| topic-b | 'TopicB' | --- |
| topic-c | EventNameC1 | 3 |
| topic-c | EventNameC2 | 3 |
| topic-c | EventNameC3 | --- |
| topic-d | *undefined* | 4 |
| topic-d | 'TopicD' | 4 |
| topic-d | 'MyEventName' | 4 |
| topic-e | *undefined* | 4 |
| topic-e | 'TopicE' | 4 |
| topic-e | 'MyEventName' | 4, 5 |
| topic-f | *undefined* | --- |
| topic-f | 'TopicF' | --- |
| topic-f | 'MyEventName' | 5 |
| topic-g | *undefined* | --- |
| topic-g | 'TopicG' | --- |
| topic-g | 'MyEventName1' | 6 |
| topic-g | 'MyEventName2' | 6 |
| topic-h | *undefined* | --- |
| topic-h | 'TopicH' | --- |
| topic-h | 'MyEventName1' | 6 |
| topic-h | 'MyEventName2' | 6 |


## Testing

When you need to perform unit/integration tests but you are not intended to connect with a real kafka server then, you can simply use it offline.

To do this call `setConfig` with `onlyTesting` on **true** on your jest setup. This will be enable you to use extra methods

### Setup

```ts
// src/test/setup/event-streamer.ts
import { setConfig } from '@comparaonline/event-streamer'

setConfig({
  host: 'any-host',
  consumer: {
    groupId: 'fake-group-id'
  },
  onlyTesting: true
})
```

### Event server

```ts
// src/event-server/index.ts
import { ConsumerRouter } from '@comparaonline/event-streamer'
import { application } from '../application'

// Remember to call setConfig with a groupId

export const consumer = new ConsumerRouter()
consumer.add('topic-a', 'event-name-a', async (data, emit) => { 
  await emit({
    topic: 'topic-b',
    data: {
      message: 'Event received'
    }
  })
})

application.onStart(async () => {
  await consumer.start()
})
```

### Service

```ts
// src/services/my-service/__tests__/index.test.ts
import { consumer } from '../../../event-server'
import { getEmittedEvents, clearEmittedEvents } from '@comparaonline/event-server'

describe('Testing some handlers', () => {
  beforeEach(() => {
    clearEmittedEvents()
  });

  describe('Testing EventNameA', () => {
    it('Should emit event into topic b', async () => {
      await consumer.input({
        data: { someData: true },
        topic: 'a',
        eventName: 'event-name-a'
      })

      const events = getEmittedEvents()

      expect(events[0]).toMatchObject({
        topic: 'topic-b',
        messages: [
          JSON.stringify({
            message: 'Event received',
            code: 'TopicB'
          })
        ]
      })
    })
  })
})

```
