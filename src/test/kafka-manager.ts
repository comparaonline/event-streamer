import { Kafka, Admin, Producer } from 'kafkajs';
import { getConfig } from '../config';

let kafka: Kafka;
let admin: Admin;
let producer: Producer;

export function getKafkaClient(): Kafka {
  if (!kafka) {
    const config = getConfig();
    kafka = new Kafka({
      brokers: config.host.split(','),
      logLevel: config.kafkaJSLogs
    });
  }
  return kafka;
}

export function getAdminClient(): Admin {
  if (!admin) {
    const kafkaClient = getKafkaClient();
    admin = kafkaClient.admin();
  }
  return admin;
}

export function getProducer(): Producer {
  if (!producer) {
    const kafkaClient = getKafkaClient();
    producer = kafkaClient.producer();
  }
  return producer;
}

export async function connect(): Promise<void> {
  await getAdminClient().connect();
  await getProducer().connect();
}

export async function disconnect(): Promise<void> {
  await getAdminClient().disconnect();
  await getProducer().disconnect();
}
