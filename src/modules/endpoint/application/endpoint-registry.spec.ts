import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CreateEndpointService,
  EndpointRegistryError,
  type EndpointRoute,
  type EndpointStore,
  GetEndpointService,
  type UpdateEndpointCommand,
  UpdateEndpointService,
} from '../index.ts';

class MemoryEndpointStore implements EndpointStore {
  readonly endpoints = new Map<string, EndpointRoute>();
  findCalls: string[] = [];

  async create(endpoint: EndpointRoute): Promise<boolean> {
    if (this.endpoints.has(endpoint.endpointId)) {
      return false;
    }
    this.endpoints.set(endpoint.endpointId, { ...endpoint });
    return true;
  }

  async findById(endpointId: string): Promise<EndpointRoute | undefined> {
    this.findCalls.push(endpointId);
    const endpoint = this.endpoints.get(endpointId);
    return endpoint ? { ...endpoint } : undefined;
  }

  async update(command: UpdateEndpointCommand): Promise<EndpointRoute | undefined> {
    const current = this.endpoints.get(command.endpointId);
    if (!current) {
      return undefined;
    }
    const updated = { ...current, ...command };
    this.endpoints.set(command.endpointId, updated);
    return { ...updated };
  }
}

const endpoint = {
  endpointId: 'destination-1',
  egressAdapter: 'http',
  address: 'https://example.test/messages',
  enabled: true,
};

test('creates and gets an endpoint using only first-stage route fields', async () => {
  const store = new MemoryEndpointStore();
  const createEndpoint = new CreateEndpointService({ store });
  const getEndpoint = new GetEndpointService({ store });

  assert.deepEqual(await createEndpoint.execute(endpoint), endpoint);
  assert.deepEqual(await getEndpoint.execute(endpoint.endpointId), endpoint);
  assert.deepEqual(Object.keys(await getEndpoint.execute(endpoint.endpointId)).sort(), [
    'address',
    'egressAdapter',
    'enabled',
    'endpointId',
  ]);
});

test('rejects duplicate endpoint creation with a stable conflict code', async () => {
  const store = new MemoryEndpointStore();
  const service = new CreateEndpointService({ store });
  await service.execute(endpoint);

  await assert.rejects(service.execute(endpoint), (error: unknown) => {
    return error instanceof EndpointRegistryError && error.code === 'ENDPOINT_ALREADY_EXISTS';
  });
});

test('updates the route and resolves the new address immediately', async () => {
  const store = new MemoryEndpointStore();
  const createEndpoint = new CreateEndpointService({ store });
  const updateEndpoint = new UpdateEndpointService({ store });
  const getEndpoint = new GetEndpointService({ store });
  await createEndpoint.execute(endpoint);

  const updated = await updateEndpoint.execute({
    endpointId: endpoint.endpointId,
    address: 'https://new.example.test/messages',
  });

  assert.deepEqual(updated, { ...endpoint, address: 'https://new.example.test/messages' });
  assert.deepEqual(await getEndpoint.execute(endpoint.endpointId), updated);
  assert.deepEqual(store.findCalls, [endpoint.endpointId]);
});

test('returns not found when getting or updating a missing endpoint', async () => {
  const store = new MemoryEndpointStore();
  const getEndpoint = new GetEndpointService({ store });
  const updateEndpoint = new UpdateEndpointService({ store });

  await assert.rejects(getEndpoint.execute('missing'), hasCode('ENDPOINT_NOT_FOUND'));
  await assert.rejects(
    updateEndpoint.execute({ endpointId: 'missing', enabled: false }),
    hasCode('ENDPOINT_NOT_FOUND'),
  );
});

test('validates commands before accessing the store', async () => {
  const store = new MemoryEndpointStore();
  const createEndpoint = new CreateEndpointService({ store });
  const getEndpoint = new GetEndpointService({ store });

  await assert.rejects(
    createEndpoint.execute({ ...endpoint, address: '   ' }),
    hasCode('INVALID_REQUEST'),
  );
  await assert.rejects(
    createEndpoint.execute({ ...endpoint, address: 'https://' }),
    hasCode('INVALID_REQUEST'),
  );
  await assert.rejects(getEndpoint.execute(''), hasCode('INVALID_REQUEST'));
  assert.equal(store.endpoints.size, 0);
  assert.equal(store.findCalls.length, 0);
});

function hasCode(expected: string) {
  return (error: unknown) => {
    return error instanceof EndpointRegistryError && error.code === expected;
  };
}
