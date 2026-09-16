import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CreateEndpointService,
  EndpointRegistryError,
  type EndpointRoute,
} from './endpoint-registry.ts';

test('retains safe custom headers on endpoint creation', async () => {
  let stored: EndpointRoute | undefined;
  const service = new CreateEndpointService({
    store: {
      create: async (endpoint) => {
        stored = endpoint;
        return true;
      },
      findById: async () => undefined,
      update: async () => undefined,
    },
  });
  const result = await service.execute({
    endpointId: 'user-web',
    egressAdapter: 'http',
    address: 'https://user-web.example/api/inbound',
    enabled: true,
    headers: { 'x-openmessage-token': 'secret' },
  });
  assert.deepEqual(result.headers, { 'x-openmessage-token': 'secret' });
  assert.deepEqual(stored, result);
});

test('rejects transport-controlled and newline-bearing headers', async () => {
  const service = new CreateEndpointService({
    store: {
      create: async () => true,
      findById: async () => undefined,
      update: async () => undefined,
    },
  });
  const invalidHeaders: Record<string, string>[] = [
    { host: 'example.test' },
    { 'x-safe': 'ok\r\ninjected: true' },
  ];
  for (const headers of invalidHeaders) {
    await assert.rejects(
      service.execute({
        endpointId: 'user-web',
        egressAdapter: 'http',
        address: 'https://user-web.example/api/inbound',
        enabled: true,
        headers,
      }),
      (error: unknown) =>
        error instanceof EndpointRegistryError && error.code === 'INVALID_REQUEST',
    );
  }
});
