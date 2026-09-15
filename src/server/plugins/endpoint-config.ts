import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { PostgresEndpointStore } from '#src/adapters/persistence/postgres-endpoint-store.ts';
import {
  CreateEndpointService,
  GetEndpointService,
  UpdateEndpointService,
} from '#src/modules/index.ts';
import { getDb } from '#src/shared/db/postgres.ts';

async function endpointConfigPlugin(fastify: FastifyInstance) {
  const store = new PostgresEndpointStore(getDb());
  fastify.decorate('createEndpoint', new CreateEndpointService({ store }));
  fastify.decorate('getEndpoint', new GetEndpointService({ store }));
  fastify.decorate('updateEndpoint', new UpdateEndpointService({ store }));
  fastify.decorate('endpointConfigToken', process.env.ENDPOINT_CONFIG_TOKEN ?? '');
}

export default fp(endpointConfigPlugin, { name: 'endpointConfig' });
