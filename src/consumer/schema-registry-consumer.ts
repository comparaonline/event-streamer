import type { EventHandler } from '../schemas';
import { RouteRegistry } from './internal/route-registry';
import { getConfig } from '../config';

export class SchemaRegistryConsumerRouter {
  private readonly routes = new RouteRegistry();

  constructor() {
    const cfg = getConfig();
    if (!cfg.schemaRegistry?.url) {
      throw new Error('SchemaRegistryConsumerRouter requires config.schemaRegistry.url');
    }
  }

  on(topic: string, schemaName: string, handler: EventHandler): this {
    this.routes.register(topic, schemaName, handler);
    return this;
  }

  async start(): Promise<void> {
    // PR2 minimal: setup would occur here; leave as no-op.
  }
}
