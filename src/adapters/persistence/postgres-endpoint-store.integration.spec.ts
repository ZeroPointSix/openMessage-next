import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import postgres from 'postgres';
import {
  CreateEndpointService,
  GetEndpointService,
  UpdateEndpointService,
} from '#src/modules/endpoint/index.ts';
import { PostgresEndpointStore } from './postgres-endpoint-store.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('persists endpoint config and resolves updates without restarting', {
  skip: databaseUrl === undefined,
}, async () => {
  assert.ok(databaseUrl);
  const db = postgres(databaseUrl, { max: 5 });
  const store = new PostgresEndpointStore(db);
  const createEndpoint = new CreateEndpointService({ store });
  const getEndpoint = new GetEndpointService({ store });
  const updateEndpoint = new UpdateEndpointService({ store });
  const endpointId = randomUUID();
  const missingEndpointId = randomUUID();
  const initial = {
    endpointId,
    egressAdapter: 'http',
    address: 'https://old.example.test/messages',
    enabled: true,
  };

  try {
    assert.deepEqual(await createEndpoint.execute(initial), initial);
    assert.deepEqual(await getEndpoint.execute(endpointId), initial);

    const afterAddressUpdate = await updateEndpoint.execute({
      endpointId,
      address: 'https://new.example.test/messages',
    });
    assert.deepEqual(await store.findById(endpointId), afterAddressUpdate);

    await updateEndpoint.execute({ endpointId, enabled: false });
    assert.deepEqual(await getEndpoint.execute(endpointId), {
      ...afterAddressUpdate,
      enabled: false,
    });
    assert.equal(await store.findById(missingEndpointId), undefined);
  } finally {
    await db`DELETE FROM endpoints WHERE id IN (${endpointId}, ${missingEndpointId})`;
    await db.end();
  }
});
