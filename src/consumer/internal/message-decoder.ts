import { SchemaRegistryClient } from '../../schema-registry/client';
import { getParsedJson, debug } from '../../helpers';
import { EventMetadata } from '../../schemas';
import { Debug } from '../../interfaces';

export interface DecodeResult<T = unknown> {
  value: T | null;
  metadata: EventMetadata;
  schemaId?: number;
}

function normalizeHeaders(headers: Record<string, unknown> | undefined): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (!headers) return normalized;
  for (const [key, raw] of Object.entries(headers)) {
    if (raw == null) continue;
    try {
      if (Buffer.isBuffer(raw)) {
        normalized[key] = raw.toString('utf8');
      } else if (typeof raw === 'string') {
        normalized[key] = raw;
      } else if (Array.isArray(raw)) {
        normalized[key] = (raw as any[])
          .map((h: any) => (Buffer.isBuffer(h) ? h.toString('utf8') : String(h)))
          .join(',');
      } else {
        normalized[key] = String(raw);
      }
    } catch {
      normalized[key] = '';
    }
  }
  return normalized;
}

export class MessageDecoder {
  private readonly client?: SchemaRegistryClient;

  constructor(client?: SchemaRegistryClient) {
    this.client = client;
  }

  async decode<T = unknown>(topic: string, partition: number, message: any): Promise<DecodeResult<T> | null> {
    if (!message?.value) {
      debug(Debug.DEBUG, 'Ignoring empty message', { topic, partition });
      return null;
    }

    const headers = normalizeHeaders(message.headers);
    const baseMeta: EventMetadata = {
      topic,
      partition,
      offset: message.offset,
      timestamp: message.timestamp,
      headers
    };

    const isSr = this.client && SchemaRegistryClient.isSchemaRegistryEncoded(message.value);
    if (isSr && this.client) {
      try {
        const decoded = await this.client.decodeAndValidate(message.value, false);
        return {
          value: decoded.value as T,
          metadata: { ...baseMeta, isSchemaRegistryMessage: true, schemaId: decoded.schemaId },
          schemaId: decoded.schemaId
        };
      } catch (error) {
        debug(Debug.ERROR, 'Failed to decode Schema Registry message', { topic, error });
        return null;
      }
    }

    try {
      const parsed = getParsedJson<T>(message.value);
      if (!parsed) {
        debug(Debug.DEBUG, 'Could not parse JSON message', { topic });
        return null;
      }
      return { value: parsed, metadata: { ...baseMeta, isSchemaRegistryMessage: false } };
    } catch (error) {
      debug(Debug.ERROR, 'Failed to parse JSON message', { topic, error });
      return null;
    }
  }
}
