import { ConsumerGroup, Message } from 'kafka-node';
import { getConfig } from '../config';
import { debug, getParsedJson, stringToUpperCamelCase, validateTestingConfig } from '../helpers';
import { Callback, Debug, Output, Route } from '../interfaces';
import { emit } from '../producer';

export class ConsumerRouter {
  private routes: Route[] = [];
  private groupId: string;
  private host: string;
  private autoCommit: boolean;
  private fetchSizeInMB: number;
  private consumer: ConsumerGroup | null = null;
  private onlyTesting: boolean;

  constructor() {
    const config = getConfig();

    if (config.consumer?.groupId == null || config.consumer.groupId.trim() === '') {
      throw new Error('Missing configuration config.consumer.groupId for consumer');
    }

    this.groupId = config.consumer.groupId;
    this.host = config.host;
    this.autoCommit = config.consumer.autoCommit ?? false;
    this.fetchSizeInMB = config.consumer.fetchSizeInMB ?? 3;
    this.onlyTesting = config.onlyTesting ?? false;
  }

  private commit(): void {
    if (this.consumer != null && !this.autoCommit) {
      this.consumer.commit(true, (error, data) => {
        /* istanbul ignore next */
        if (error != null) {
          debug(Debug.ERROR, error);
        }
        debug(Debug.INFO, data);
      });
    }
  }

  public add(topic: string, handler: Callback<any>): void;
  public add(topics: string[], handler: Callback<any>): void;
  public add(topic: string, eventName: string, handler: Callback<any>): void;
  public add(topic: string, eventNames: string[], handler: Callback<any>): void;
  public add(topics: string[], eventNames: string[], handler: Callback<any>): void;
  public add(topics: string[], eventNames: string, handler: Callback<any>): void;
  public add(
    param1: string | string[],
    param2: string | string[] | Callback<any>,
    handler?: Callback<any>
  ): void {
    const topics = Array.isArray(param1) ? param1 : [param1];
    const eventNames =
      typeof param2 === 'string'
        ? [stringToUpperCamelCase(param2)]
        : Array.isArray(param2)
        ? param2.map((name) => stringToUpperCamelCase(name))
        : new Array(topics.length).fill(undefined);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const callback = typeof param2 === 'function' ? param2 : handler!;
    for (const topic of topics) {
      for (const eventName of eventNames) {
        const route = {
          topic,
          eventName,
          callback
        };
        debug(Debug.INFO, 'Adding route', route);
        this.routes.push(route);
      }
    }
  }

  public async input({ data, topic, eventName }: Output): Promise<void> {
    validateTestingConfig();
    const code = stringToUpperCamelCase(eventName ?? topic);
    const routes = this.routes.filter(
      (route) => topic === route.topic && (route.eventName == null || route.eventName === code)
    );

    for (const route of routes) {
      await route.callback({ ...data, code }, emit);
    }
  }

  public async start(): Promise<void> {
    if (this.routes.length === 0) {
      throw new Error('Missing routes, please add minimum 1 route');
    }
    if (this.onlyTesting) {
      return Promise.resolve();
    } else {
      return new Promise((resolve, reject) => {
        const MB = 1024 * 1024;
        this.consumer = new ConsumerGroup(
          {
            groupId: this.groupId,
            kafkaHost: this.host,
            autoCommit: this.autoCommit,
            encoding: 'utf8',
            fetchMaxWaitMs: 100,
            fetchMaxBytes: MB * this.fetchSizeInMB
          },
          this.routes
            .map((route) => route.topic)
            .filter((value, index, array) => array.indexOf(value) === index)
        );

        this.consumer.on('connect', () => {
          console.log('Event server ready');
          resolve();
        });

        this.consumer.on('message', (message: Message) => {
          const content = getParsedJson<{ code?: string }>(message.value);

          if (content != null) {
            if (this.consumer != null) {
              this.consumer.pause();
            }
            debug(Debug.DEBUG, 'Message offset', message.offset);
            Promise.all(
              this.routes
                .filter(
                  (route) =>
                    message.topic === route.topic &&
                    (route.eventName == null || route.eventName === content.code)
                )
                .map((route) => {
                  debug(Debug.TRACE, 'Message received on route', route);
                  return route.callback(content, emit);
                })
            ).then((results) => {
              if (results.length === 0) {
                debug(Debug.DEBUG, 'Committing without match');
              } else {
                debug(Debug.DEBUG, 'Committing with', results.length, 'matches');
              }
              this.commit();
              if (this.consumer != null) {
                this.consumer.resume();
              }
            });
          } else {
            debug(Debug.DEBUG, 'Committing without content');
            this.commit();
          }
        });

        /* istanbul ignore next */
        this.consumer.on('error', (error) => {
          reject(error);
        });
      });
    }
  }
}
