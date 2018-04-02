import { KafkaEventConsumer } from './kafka-event-consumer';
import { ConsumerStreamMessage } from 'node-rdkafka';

const kafkaEventConsumer = new KafkaEventConsumer('localhost:9092', ['test2']);
kafkaEventConsumer.on('error', (error) => {
  console.error(error);
  shutdown();
});
kafkaEventConsumer.start();

// Graceful shutdown. Based on:
// https://github.com/RisingStack/kubernetes-graceful-shutdown-example/blob/master/src/index.js
function shutdown() {
  console.log(`Shutting down appName`);
  kafkaEventConsumer.stop()
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
