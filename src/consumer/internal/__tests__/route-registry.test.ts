import { vi } from 'vitest';
import { RouteRegistry } from '../route-registry';
import { getSubjectName } from '../../../helpers';
import type { EventHandler } from '../../../schemas';

describe('RouteRegistry', () => {
  it('registers and retrieves handler by topic + schemaName', () => {
    const rr = new RouteRegistry();
    const handler: EventHandler = vi.fn();
    rr.register('topic-a', 'My Event', handler);
    expect(rr.get('topic-a', 'My Event')).toBe(handler);
  });

  it('uses kebab-cased subject key', () => {
    const rr = new RouteRegistry();
    const handler: EventHandler = vi.fn();
    rr.register('Topic_A', 'MyEventName', handler);
    const key = getSubjectName('Topic_A', 'MyEventName');
    expect(key).toBe('topic-a-my-event-name');
    expect(rr.get('Topic_A', 'MyEventName')).toBe(handler);
  });
});
