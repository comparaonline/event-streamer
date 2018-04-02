import { KafkaEventProducer } from './kafka-event-producer';

const kafkaEventProducer = new KafkaEventProducer('localhost:9092');
kafkaEventProducer.on('error', (error) => {
  console.error(error);
  shutdown();
});
kafkaEventProducer.start();

// Graceful shutdown. Based on:
// https://github.com/RisingStack/kubernetes-graceful-shutdown-example/blob/master/src/index.js
function shutdown() {
  console.log(`Shutting down appName`);
  kafkaEventProducer.stop()
    .then(message => console.log(message))
    .then(() => console.log(`appname stopped!`))
    .catch((error: Error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .then(() => process.exit());
}

// quit on ctrl-c when running docker in terminal
process.on('SIGINT', () => {
  console.info('Got SIGINT. Graceful shutdown ', new Date().toISOString());
  shutdown();
});

// quit properly on docker stop
process.on('SIGTERM', () => {
  console.info('Got SIGTERM. Graceful shutdown ', new Date().toISOString());
  shutdown();
});


// tslint:disable:no-increment-decrement
let idx0 = 0;
let idx1 = 0;
let idx2 = 0;

// const wait = setInterval(
//   () => {
    // clearTimeout(wait);
    // kafkaEventProducer.produce('test2', 0, idx0++);
    // kafkaEventProducer.produce('test2', 1, idx1++);
    // kafkaEventProducer.produce('test2', 2, idx2++);
    // kafkaEventProducer.flush()
    //   .then(() => {
    //     process.exit();
    //   })
    //   .catch(() => {

    //   });
//   },
//   1000
// );


kafkaEventProducer.produce('test2', 0, idx0++);
kafkaEventProducer.produce('test2', 1, idx1++);
kafkaEventProducer.produce('test2', 2, idx2++);
kafkaEventProducer.flush()
  .catch((error) => {
    console.error(error);
  }).then(() => {
    process.exit();
  });
