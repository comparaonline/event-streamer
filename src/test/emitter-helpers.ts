import { fail } from 'assert';

export const emitterHelper = () => {
  const listeners = new Map<string, Map<string, Function[]>>();
  return {
    listeners,
    trigger: trigger(listeners),
    on: handler(listeners)
  };
};

const handler = (listeners: Map<string, Map<string, Function[]>>) =>
  (className: string) =>
    jest.fn((name: string, handler: Function) => {
      const classMap = listeners.get(className) || new Map<string, Function[]>();
      classMap.set(name, (classMap.get(name) || []).concat(handler));
      listeners.set(className, classMap);
    });
const trigger = (listeners: Map<string, Map < string, Function[] >>) =>
  (className: string, name: string, ...values: any[]) => {
    const handlers = get(listeners, className, name);
    handlers.forEach(fn => fn(...values));
  };

const get = <V>(map: Map<string, Map<string, V>>, ...keys: string[]): V =>
  keys.reduce<any>(
    (map, key) => map.get(key) || fail(`'${key}' not found on ${displayMap(map)}`),
    map
  );

const displayMap = (map: Map<string, any>) =>
  `[${[...map.keys()].map(v => `'${v}'`).join(', ')}]`;
