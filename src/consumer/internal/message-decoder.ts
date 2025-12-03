import { SchemaRegistryClient } from '../../schema-registry/client';

export class MessageDecoder {
  private readonly client: SchemaRegistryClient;

  constructor(client?: SchemaRegistryClient) {
    this.client = client ?? new SchemaRegistryClient();
  }

  async decodeValue(value: Buffer | null): Promise<unknown> {
    if (value == null) return null;
    return this.client.decode(value);
  }
}
