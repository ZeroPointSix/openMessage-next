import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
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
  assert.equal(receivedInit?.redirect, 'manual');
  assert.deepEqual(receivedInit?.headers, { 'content-type': 'application/json' });
  assert.equal(receivedInit?.body, JSON.stringify(envelope));
  assert.ok(receivedInit?.signal instanceof AbortSignal);
});

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('does not follow redirect responses', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    let configuredEndpointRequests = 0;
    let redirectTargetRequests = 0;
    const redirectTarget = createServer((_request, response) => {
      redirectTargetRequests += 1;
      response.writeHead(204).end();
    });
    const redirectTargetAddress = await listen(redirectTarget);
    const configuredEndpoint = createServer((_request, response) => {
      configuredEndpointRequests += 1;
      response.writeHead(status, { location: `${redirectTargetAddress}/redirected` }).end();
    });
    const configuredEndpointAddress = await listen(configuredEndpoint);

    try {
      const adapter = new HttpEgressAdapter({ timeoutMs: 5000 });

      await assert.rejects(
        adapter.deliver(`${configuredEndpointAddress}/messages`, envelope),
        new RegExp(`HTTP egress returned status ${status}`),
      );

      assert.equal(configuredEndpointRequests, 1);
      assert.equal(redirectTargetRequests, 0);
    } finally {
      await Promise.all([close(configuredEndpoint), close(redirectTarget)]);
    }
  }
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
