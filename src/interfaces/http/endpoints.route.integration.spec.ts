import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import Fastify from 'fastify';
import postgres from 'postgres';
import { PostgresEndpointStore } from '#src/adapters/persistence/postgres-endpoint-store.ts';
import {
  CreateEndpointService,
  GetEndpointService,
  UpdateEndpointService,
} from '#src/modules/endpoint/index.ts';
import {
  SubmitMessageError,
  SubmitMessageService,
  type SubmitMessageStore,
} from '#src/modules/message/index.ts';
import errorHandler from '#src/server/plugins/error-handler.ts';
import requestContext from '#src/server/plugins/request-context.ts';
import swaggerPlugin from '#src/server/plugins/swagger.ts';
import endpointRoutes from '../endpoints.route.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('HTTP endpoint update is immediately visible and blocks a new submission when disabled', {
  skip: databaseUrl === undefined,
}, async () => {
  assert.ok(databaseUrl);
  const db = postgres(databaseUrl, { max: 2 });
  const store = new PostgresEndpointStore(db);
  const app = Fastify({ ajv: { customOptions: { keywords: ['example'] } } });
  app.decorate('createEndpoint', new CreateEndpointService({ store }));
  app.decorate('getEndpoint', new GetEndpointService({ store }));
  app.decorate('updateEndpoint', new UpdateEndpointService({ store }));
  app.decorate('endpointConfigToken', 'integration-token');
  await app.register(requestContext);
  await app.register(errorHandler);
  await app.register(swaggerPlugin);
  await app.register(endpointRoutes);
  await app.ready();

  const endpointId = `endpoint-${randomUUID()}`;
  const headers = { authorization: 'Bearer integration-token' };

  try {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/endpoints',
      headers,
      payload: {
        id: endpointId,
        egressAdapter: 'http',
        address: 'https://old.test/messages',
        enabled: true,
      },
    });
    assert.equal(created.statusCode, 201);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/v1/endpoints/${endpointId}`,
      headers,
      payload: { address: 'https://new.test/messages', enabled: false },
    });
    assert.equal(updated.statusCode, 200);

    const resolved = await store.findById(endpointId);
    assert.equal(resolved?.address, 'https://new.test/messages');
    assert.equal(resolved?.enabled, false);

    let committed = false;
    const messageStore: SubmitMessageStore = {
      async commit() {
        committed = true;
      },
    };
    const submit = new SubmitMessageService({
      endpointResolver: { resolveEndpoint: (id) => store.findById(id) },
      store: messageStore,
    });
    await assert.rejects(
      submit.execute({
        message: { origin: 'origin-a', destination: endpointId, content: 'hello' },
      }),
      (error: unknown) => error instanceof SubmitMessageError && error.code === 'ENDPOINT_DISABLED',
    );
    assert.equal(committed, false);
  } finally {
    await app.close();
    await db`DELETE FROM endpoints WHERE id = ${endpointId}`;
    await db.end();
  }
});
