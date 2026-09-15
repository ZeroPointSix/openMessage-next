import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  GetInteractionService,
  GetMessageService,
  type InteractionDirectory,
  type MessageReadStore,
  type PersistedMessage,
  SubmitMessageService,
  type SubmitMessageStore,
} from '#src/modules/message/index.ts';
import errorHandler from '#src/server/plugins/error-handler.ts';
import requestContext from '#src/server/plugins/request-context.ts';
import swaggerPlugin from '#src/server/plugins/swagger.ts';
import messageRoutes from '../messages.route.ts';

class MemoryMessageStore implements SubmitMessageStore, MessageReadStore {
  readonly messages = new Map<string, PersistedMessage>();
  readonly interactions = new Map<string, InteractionDirectory>();
  failCommit = false;

  async commit(input: Parameters<SubmitMessageStore['commit']>[0]) {
    if (this.failCommit) {
      throw new Error('persistence unavailable');
    }
    this.messages.set(input.messageId, {
      id: input.messageId,
      origin: input.origin,
      destination: input.destination,
      content: input.content,
      createdAt: input.createdAt,
    });
    const directory = this.interactions.get(input.interactionId) ?? {
      id: input.interactionId,
      messages: [],
    };
    directory.messages.push({
      messageId: input.messageId,
      position: String(directory.messages.length),
    });
    this.interactions.set(input.interactionId, directory);
  }

  async findMessage(messageId: string) {
    return this.messages.get(messageId);
  }

  async findInteraction(interactionId: string) {
    return this.interactions.get(interactionId);
  }
}

describe('Message and Interaction HTTP ingress', () => {
  let app: FastifyInstance;
  let store: MemoryMessageStore;
  let endpointEnabled = true;
  before(async () => {
    store = new MemoryMessageStore();
    let nextId = 0;
    const submitMessage = new SubmitMessageService({
      endpointResolver: {
        async resolveEndpoint(endpointId) {
          if (endpointId === 'missing') return undefined;
          return {
            endpointId,
            egressAdapter: 'http',
            address: 'https://example.test/messages',
            enabled: endpointEnabled,
          };
        },
      },
      store,
      idFactory: () => `generated-${++nextId}`,
      now: () => new Date('2026-09-15T08:00:00.000Z'),
    });
    app = Fastify({ ajv: { customOptions: { keywords: ['example'] } } });
    app.decorate('submitMessage', submitMessage);
    app.decorate('getMessage', new GetMessageService({ store }));
    app.decorate('getInteraction', new GetInteractionService({ store }));
    app.decorate('messageApiToken', 'api-token');
    await app.register(requestContext);
    await app.register(errorHandler);
    await app.register(swaggerPlugin);
    await app.register(messageRoutes);
    await app.ready();
  });
  after(async () => app.close());

  it('requires and validates the bearer API key', async () => {
    const missing = await app.inject({ method: 'GET', url: '/v1/messages/unknown' });
    assert.equal(missing.statusCode, 401);
    assert.equal(missing.headers['www-authenticate'], 'Bearer');

    const forbidden = await app.inject({
      method: 'GET',
      url: '/v1/messages/unknown',
      headers: { authorization: 'Bearer wrong' },
    });
    assert.equal(forbidden.statusCode, 403);

    const lowercaseScheme = await app.inject({
      method: 'GET',
      url: '/v1/messages/unknown',
      headers: { authorization: 'bearer api-token' },
    });
    assert.equal(lowercaseScheme.statusCode, 404);

    const unauthenticatedInvalidBody = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      payload: {
        unexpected: true,
        message: { origin: ' ', destination: 'endpoint-b', content: 'hello' },
      },
    });
    assert.equal(unauthenticatedInvalidBody.statusCode, 401);
  });

  it('validates transport schemas before calling the Application API', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      headers: auth,
      payload: {
        unexpected: true,
        message: { origin: ' ', destination: 'endpoint-b', content: 'hello' },
      },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().message, 'Validation error');
  });

  it('submits, reads, and lists messages through the Application API', async () => {
    endpointEnabled = true;
    const submitted = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      headers: auth,
      payload: {
        message: { origin: 'endpoint-a', destination: 'endpoint-b', content: 'hello' },
      },
    });
    assert.equal(submitted.statusCode, 201);
    const accepted = submitted.json();
    assert.deepEqual(accepted, {
      messageId: 'generated-2',
      interactionId: 'generated-1',
    });
    assert.equal('status' in accepted, false);

    const read = await app.inject({
      method: 'GET',
      url: `/v1/messages/${accepted.messageId}`,
      headers: auth,
    });
    assert.deepEqual(read.json(), {
      id: accepted.messageId,
      origin: 'endpoint-a',
      destination: 'endpoint-b',
      content: 'hello',
      createdAt: '2026-09-15T08:00:00.000Z',
    });

    const directory = await app.inject({
      method: 'GET',
      url: `/v1/interactions/${accepted.interactionId}`,
      headers: auth,
    });
    assert.deepEqual(directory.json(), {
      id: accepted.interactionId,
      messages: [{ messageId: accepted.messageId, position: '0' }],
    });
  });

  it('maps endpoint, interaction, and read not-found errors', async () => {
    endpointEnabled = true;
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/messages',
          headers: auth,
          payload: { message: { origin: 'a', destination: 'missing', content: 'hello' } },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (await app.inject({ method: 'GET', url: '/v1/messages/missing', headers: auth })).statusCode,
      404,
    );
    assert.equal(
      (await app.inject({ method: 'GET', url: '/v1/interactions/missing', headers: auth }))
        .statusCode,
      404,
    );
  });

  it('maps disabled destinations without persisting a message', async () => {
    const persistedBefore = store.messages.size;
    endpointEnabled = false;
    const response = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      headers: auth,
      payload: { message: { origin: 'a', destination: 'disabled', content: 'hello' } },
    });
    assert.equal(response.statusCode, 409);
    assert.equal(store.messages.size, persistedBefore);
  });

  it('maps persistence failures to the shared 500 response', async () => {
    endpointEnabled = true;
    store.failCommit = true;
    const response = await app.inject({
      method: 'POST',
      url: '/v1/messages',
      headers: auth,
      payload: { message: { origin: 'a', destination: 'b', content: 'hello' } },
    });
    store.failCommit = false;
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().message, 'Internal Server Error');
  });

  it('publishes complete schemas, errors, examples, and bearer auth in OpenAPI', () => {
    const document = app.swagger();
    const post = document.paths?.['/v1/messages']?.post;
    assert.ok(post);
    assert.deepEqual(post.security, [{ messageBearer: [] }]);
    assert.ok('requestBody' in post && post.requestBody);
    assert.ok(post.responses?.['201']);
    assert.ok(post.responses?.['400']);
    assert.ok(post.responses?.['401']);
    assert.ok(post.responses?.['403']);
    assert.ok(post.responses?.['404']);
    assert.ok(post.responses?.['409']);
    assert.ok(post.responses?.['500']);
    assert.ok(document.paths?.['/v1/messages/{messageId}']?.get);
    assert.ok(document.paths?.['/v1/interactions/{interactionId}']?.get);
    assert.ok('components' in document);
    const securityScheme = document.components?.securitySchemes?.messageBearer;
    assert.ok(securityScheme && 'type' in securityScheme);
    assert.equal(securityScheme.type, 'http');
  });

  it('serves all three public APIs through real HTTP', async () => {
    endpointEnabled = true;
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const submitted = await fetch(`${address}/v1/messages`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: { origin: 'endpoint-a', destination: 'endpoint-b', content: 'network hello' },
      }),
    });
    assert.equal(submitted.status, 201);
    const accepted = (await submitted.json()) as { messageId: string; interactionId: string };

    const read = await fetch(`${address}/v1/messages/${accepted.messageId}`, { headers: auth });
    assert.equal(read.status, 200);
    assert.equal(((await read.json()) as { content: string }).content, 'network hello');

    const directory = await fetch(`${address}/v1/interactions/${accepted.interactionId}`, {
      headers: auth,
    });
    assert.equal(directory.status, 200);
    assert.deepEqual(((await directory.json()) as InteractionDirectory).messages, [
      { messageId: accepted.messageId, position: '0' },
    ]);
  });
});

const auth = { authorization: 'Bearer api-token' };
