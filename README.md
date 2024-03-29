# Event Streamer

## Description

Event Streamer is a library for connect micro services based on kafka event communication.

This is a wrap of [kafka-js](https://github.com/tulios/kafkajs) simplifying connection, errors and topic with subject (event name, event code).

This library is not intended to consume two different clusters at the same time, but you can produce in two or more clusters at the same time.

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
| producer.additionalHosts | string[] | Additional hosts to send a message. This is useful if you need to send information to two or more different clusters | *optional* |
| producer.connectionTTL | number | Time in ms that the connection will be keep open after last message was sent | *optional* <br/> default: 5000 |
| producer.retryOptions | RetryOptions (Object) | kafka-node retry options: retries, factor, minTimeout, maxTimeout and randomize | *optional* |
| producer.compressionType | CompressionTypes (KafkaJS) | Set compression type. Only None and GZIP are available without any additional implementation | *optional* <br/> default: CompressionTypes.NONE |
| producer.idempotent | boolean | Set message to only be sent once. **EXPERIMENTAL** | *optional*  <br/> default: false |
| producer.partitioners | DefaultPartitioner/LegacyPartitioner | Set how message will be sended to each partition | *optional* <br/> default: LegacyPartitioner |
| consumer | Object | Object | *required to start consumer* |
| consumer.groupId | string | Kafka group id | **required** |
| consumer.strategy | Strategy ('topic'/'one-by-one') | Chose if you want to create topic queues or process all the messages in a single queue. <br/> *topic*: each topic will have an exclusive queue and fetch messages from kafka based on queue size. When queue is full it will stop fetching for this specific topic and resume it when some handler ends. **Lag can be caused if queue size is too small** <br/>  *one-by-one*: all the message will be handle in a single queue and it will need to wait previous message handler to finish before start to process a new message | *optional* <br/> default: 'topic'
| consumer.maxMessagesPerTopic | number/'unlimited' | Set global queue size | *optional* <br/> default: 20 |
| consumer.maxMessagesPerSpecificTopic | Object (key: string, value: maxMessagesPerTopic) | Set specific topic queue size. You can also use 'unlimited' for a specific topic | *optional* <br/> default: empty object |
| debug | false or Debug | Increase library logging based on Debug level | *optional* default: false |
| kafkaJSLogs | kafkajs.logLevel | Set kafkajs logs for connection, commits and streamings | *optional* default: kafkajs.logLevel.NOTHING |
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

Event streamer will create and close kafka client on demand to avoid keeping open connections, this connection will be reused until TTL is reached (TTL is renewed after each execution).
Produced events will be delivered the `data` object into a single topic as JSON string with the corresponding subject. It will also add `appName` and `createdAt` properties

#### App name

`appName` is a first-level property with sender name. `event-streamer` has this options to set appName
1. Sending `appName` property on messages
2. Perform `event-streamer` initialization with `appName` property
3. Read `consumerGroupId` from `event-streamer` initialization and use it as `appName`
4. Read `process.env.HOSTNAME`. This is automatically setup on K8S deployment
5. Set `unknown` string

#### Message date

every message should have a property `createdAt`, it is message creation date on ISO UTC format. `event-streamer` add this property automatically

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
  
  // Topic: my-topic Message: { "firstName": "John", "code": "MyEventName", "createdAt": "2024-03-07 18:41:54Z", "appName": "test" }

}
```

#### Single event with alternative syntax

```ts
import { emit } from '@comparaonline/event-streamer'

async function main () {
  await emit('my-topic', 'my-event-name', { firstName: 'John' })
  // Topic: my-topic Message: { "firstName": "John", "code": "MyEventName", "createdAt": "2024-03-07 18:41:54Z", "appName": "test" }

  await emit('my-topic', { firstName: 'John' })
  // Topic: my-topic Message: { "firstName": "John", "code": "MyTopic", "createdAt": "2024-03-07 18:41:54Z", "appName": "test" }
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
  
  // Topic: my-topic Message: { "firstName": "John", "code": "MyEventName", "createdAt": "2024-03-07 18:41:54Z", "appName": "test" }
  // Topic: my-topic Message: { "firstName": "Jane", "code": "MyEventName", "createdAt": "2024-03-07 18:41:54Z", "appName": "test" }

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
  
  // Topic: my-topic-a Message: { "firstName": "John", "code": "MyEventName", "createdAt": "2024-03-07 18:41:54Z", "appName": "test" }
  // Topic: my-topic-b Message: { "firstName": "Jane", "code": "MyEventName", "createdAt": "2024-03-07 18:41:54Z", "appName": "test" }
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
  
  // Topic: my-topic Message: { "firstName": "John", "code": "MyTopic", "createdAt": "2024-03-07 18:41:54Z", "appName": "test" }
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

  // Alternative syntax 

  consumer.add({
    topic: 'topic-i',
    eventName: 'my-event-name-i', // this is optional
    callback: (data, emit) => { console.log(6) }
  })
  
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
import { getEmittedEvents, clearEmittedEvents, getParsedEmittedEvents } from '@comparaonline/event-server'

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

    it('Should emit event into topic c with parsed event', async () => {
      await consumer.input({
        data: { someData: true },
        topic: 'a',
        eventName: 'event-name-a'
      })

      const events = getEmittedEvents()

      expect(events[0]).toMatchObject({
        topic: 'topic-b',
        eventName: 'TopicB',
        data: {
          message: 'Event received',
          code: 'TopicB'
        }
      })
    })
  })
})

```

## Migration to version +8.0.0

### Node version

You need node version greater than or equal to v14.17.0. A good choice for Dockerfile is `node:14.17.0-alpine3.13` at least than you already want to go with `node:16.13-alpine3.15`

#### Known issues after update node

* `pg`: if you are using a previous version from node v13 with pg v7.X.X then it will not run anymore. The easiest way to fix it is with `yarn add pg@8.0.3`
* `python`: in your docker file change `python` to `python3`

### Topics and subjects

#### Listeners

Previous versions read all the topics and performs actions from every event not mattering the topic. Now you need to link topic/event/handler

```ts
// Option A: you know where the event came from
consumer.add('topic-a', 'my-event-name', myHandler)

// Option B: you don't know where the event came from
consumer.add(['topic-a', 'topic-b'], 'my-event-name', myHandler)

// Option C: you know where the event came from but there are two input events with the same action
consumer.add('topic-a', ['my-event-name-a', 'my-event-name-b'], myHandler)

// Option D: you don't know where the event came from but there are two input events with the same action
consumer.add(['topic-a', 'topic-b'], ['my-event-name-a', 'my-event-name-b'], myHandler)
```

#### Events subjects

Previous event-streamer version uses class name as event subject. Now you need to specify them, no matter what the event subject will be automatically converted to upper camel case 

#### Tips

* You can transform your events folder into simple TS interfaces
* Create a kafka service folder with all the emits events

### Migration PRs

[Flux comparador sync](https://github.com/comparaonline/flux-comparador-sync/pull/53/files)

[Results connector](https://github.com/comparaonline/results-connector/pull/67/files)

[Quoteapp CICL](https://github.com/comparaonline/quoteapp-cicl/pull/127/files)
