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

const get = <K, V>(map: Map<K, Map<K, V>>, ...keys: K[]): V =>
  keys.reduce((map: Map<K, any>, key) => map.get(key) || fail(`${key} not found on ${map}`), map);
