import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import Fastify from 'fastify';
import postgres from 'postgres';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('serves all Message Interaction APIs over real HTTP with PostgreSQL persistence', {
  skip: databaseUrl === undefined,
}, async () => {
  assert.ok(databaseUrl);
  configureServerEnvironment(databaseUrl);

  const [{ default: createServer }, { closeDbConnection }] = await Promise.all([
    import('#src/server/index.ts'),
    import('#src/shared/db/postgres.ts'),
  ]);
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { keywords: ['example'] } },
  });
  const cleanupDb = postgres(databaseUrl, { max: 1 });
  const endpointId = `e2e-${randomUUID()}`;
  const endpointToken = 'e2e-endpoint-token';
  const messageToken = 'e2e-message-token';

  try {
    await createServer(app);
    const address = await app.listen({ host: '127.0.0.1', port: 0 });

    const endpointResponse = await fetch(`${address}/v1/endpoints`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${endpointToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: endpointId,
        egressAdapter: 'http',
        address: 'https://destination.example.test/openmessage',
        enabled: true,
      }),
    });
    assert.equal(endpointResponse.status, 201);

    const submitResponse = await fetch(`${address}/v1/messages`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${messageToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          origin: 'e2e-origin',
          destination: endpointId,
          content: 'real HTTP and PostgreSQL E2E',
        },
      }),
    });
    assert.equal(submitResponse.status, 201);
    const submitted = (await submitResponse.json()) as {
      messageId: string;
      interactionId: string;
    };
    assert.ok(submitted.messageId);
    assert.ok(submitted.interactionId);

    const auth = { authorization: `Bearer ${messageToken}` };
    const messageResponse = await fetch(`${address}/v1/messages/${submitted.messageId}`, {
      headers: auth,
    });
    assert.equal(messageResponse.status, 200);
    const message = (await messageResponse.json()) as Record<string, unknown>;
    assert.equal(message.id, submitted.messageId);
    assert.equal(message.origin, 'e2e-origin');
    assert.equal(message.destination, endpointId);
    assert.equal(message.content, 'real HTTP and PostgreSQL E2E');

    const interactionResponse = await fetch(
      `${address}/v1/interactions/${submitted.interactionId}`,
      { headers: auth },
    );
    assert.equal(interactionResponse.status, 200);
    assert.deepEqual(await interactionResponse.json(), {
      id: submitted.interactionId,
      messages: [{ messageId: submitted.messageId, position: '0' }],
    });
  } finally {
    await app.close();
    await closeDbConnection();
    await cleanupDb`DELETE FROM endpoints WHERE id = ${endpointId}`;
    await cleanupDb.end();
  }
});

function configureServerEnvironment(urlValue: string) {
  const url = new URL(urlValue);
  process.env.POSTGRES_URL = `${url.hostname}:${url.port || '5432'}`;
  process.env.POSTGRES_USER = decodeURIComponent(url.username);
  process.env.POSTGRES_PASSWORD = decodeURIComponent(url.password);
  process.env.POSTGRES_DB = url.pathname.slice(1);
  process.env.POSTGRES_SSL = 'false';
  process.env.LOG_LEVEL = 'warn';
  process.env.NODE_ENV = 'test';
  process.env.ENDPOINT_CONFIG_TOKEN = 'e2e-endpoint-token';
  process.env.MESSAGE_API_TOKEN = 'e2e-message-token';
}
