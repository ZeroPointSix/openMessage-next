import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  CreateEndpointService,
  type EndpointRoute,
  type EndpointStore,
  GetEndpointService,
  UpdateEndpointService,
} from '#src/modules/endpoint/index.ts';
import errorHandler from '#src/server/plugins/error-handler.ts';
import requestContext from '#src/server/plugins/request-context.ts';
import swaggerPlugin from '#src/server/plugins/swagger.ts';
import endpointRoutes from '../endpoints.route.ts';

class MemoryEndpointStore implements EndpointStore {
  readonly values = new Map<string, EndpointRoute>();

  async create(endpoint: EndpointRoute) {
    if (this.values.has(endpoint.endpointId)) return false;
    this.values.set(endpoint.endpointId, endpoint);
    return true;
  }

  async findById(endpointId: string) {
    return this.values.get(endpointId);
  }

  async update(endpoint: EndpointRoute) {
    if (!this.values.has(endpoint.endpointId)) return false;
    this.values.set(endpoint.endpointId, endpoint);
    return true;
  }
}

describe('endpoint config routes', () => {
  let app: FastifyInstance;
  before(async () => {
    const store = new MemoryEndpointStore();
    app = Fastify({ ajv: { customOptions: { keywords: ['example'] } } });
    app.decorate('createEndpoint', new CreateEndpointService({ store }));
    app.decorate('getEndpoint', new GetEndpointService({ store }));
    app.decorate('updateEndpoint', new UpdateEndpointService({ store }));
    app.decorate('endpointConfigToken', 'admin-token');
    await app.register(requestContext);
    await app.register(errorHandler);
    await app.register(swaggerPlugin);
    await app.register(endpointRoutes);
    await app.ready();
  });
  after(async () => app.close());

  it('covers authentication, validation, not found, conflicts and hot update', async () => {
    assert.equal((await app.inject({ method: 'GET', url: '/v1/endpoints/x' })).statusCode, 401);
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: '/v1/endpoints/x',
          headers: { authorization: 'Bearer wrong' },
        })
      ).statusCode,
      403,
    );

    const headers = { authorization: 'Bearer admin-token' };
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/endpoints',
          headers,
          payload: { id: 'x', egressAdapter: 'http', address: 'invalid', enabled: true },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/endpoints',
          headers,
          payload: {
            id: 'x',
            egressAdapter: 'dynamic-code',
            address: 'https://example.test/messages',
            enabled: true,
          },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await app.inject({ method: 'GET', url: '/v1/endpoints/missing', headers })).statusCode,
      404,
    );

    const createRequest = {
      method: 'POST' as const,
      url: '/v1/endpoints',
      headers,
      payload: {
        id: 'b',
        egressAdapter: 'http',
        address: 'https://old.test/messages',
        enabled: true,
      },
    };
    assert.equal((await app.inject(createRequest)).statusCode, 201);
    assert.equal((await app.inject(createRequest)).statusCode, 409);

    const updated = await app.inject({
      method: 'PATCH',
      url: '/v1/endpoints/b',
      headers,
      payload: { address: 'https://new.test/messages', enabled: false },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().enabled, false);

    const read = await app.inject({ method: 'GET', url: '/v1/endpoints/b', headers });
    assert.equal(read.json().address, 'https://new.test/messages');

    const document = app.swagger();
    assert.ok(document.paths?.['/v1/endpoints']?.post);
    assert.ok(document.paths?.['/v1/endpoints/{endpointId}']?.patch);
  });
});
