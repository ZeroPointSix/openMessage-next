import assert from 'node:assert/strict';
import test from 'node:test';
import type { EgressEnvelope } from '#src/modules/message/index.ts';
import { HttpEgressAdapter } from './http-egress-adapter.ts';

const envelope: EgressEnvelope = {
  interactionId: 'interaction-1',
  message: {
    id: 'message-1',
    origin: 'origin-1',
    destination: 'destination-1',
    content: 'hello',
    createdAt: '2026-09-15T00:00:00.000Z',
  },
};

test('posts the exact message envelope as JSON', async () => {
  let receivedAddress: string | URL | Request | undefined;
  let receivedInit: RequestInit | undefined;
  const adapter = new HttpEgressAdapter({
    timeoutMs: 1000,
    fetch: async (address, init) => {
      receivedAddress = address;
      receivedInit = init;
      return new Response(null, { status: 204 });
    },
  });

  await adapter.deliver('https://example.test/messages', envelope);

  assert.equal(receivedAddress, 'https://example.test/messages');
  assert.equal(receivedInit?.method, 'POST');
  assert.deepEqual(receivedInit?.headers, { 'content-type': 'application/json' });
  assert.equal(receivedInit?.body, JSON.stringify(envelope));
  assert.ok(receivedInit?.signal instanceof AbortSignal);
});

test('rejects a non-success HTTP response without reading its body', async () => {
  const adapter = new HttpEgressAdapter({
    timeoutMs: 1000,
    fetch: async () => new Response('sensitive remote response', { status: 503 }),
  });

  await assert.rejects(
    adapter.deliver('https://example.test/messages', envelope),
    /HTTP egress returned status 503/,
  );
});

test('aborts a stalled request when the configured timeout expires', async () => {
  const adapter = new HttpEgressAdapter({
    timeoutMs: 10,
    fetch: async (_address, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      }),
  });

  await assert.rejects(adapter.deliver('https://example.test/messages', envelope), {
    name: 'TimeoutError',
  });
});
