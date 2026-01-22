import { MessageDecoder } from '../message-decoder';

describe('MessageDecoder', () => {
  class FakeClient {
    async decode(): Promise<any> {
      return { subject: 's', payload: { a: 1 } };
    }
  }

  it('returns null on null input', async () => {
    const md = new MessageDecoder(new (FakeClient as any)());
    expect(await md.decodeValue(null)).toBeNull();
  });

  it('delegates to client.decode on non-null input', async () => {
    const md = new MessageDecoder(new (FakeClient as any)());
    const res = await md.decodeValue(Buffer.from('{}'));
    expect(res).toEqual({ subject: 's', payload: { a: 1 } });
  });
});
