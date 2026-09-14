import path from 'node:path';
import AutoLoad from '@fastify/autoload';
import Cors from '@fastify/cors';
import Helmet from '@fastify/helmet';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import UnderPressure from '@fastify/under-pressure';
import type { FastifyInstance } from 'fastify';
import { di } from '#src/server/di/index.ts';

export default async function createServer(fastify: FastifyInstance) {
  await fastify.register(Helmet, { global: true });

  await fastify.register(Cors, { origin: false });

  await fastify.register(AutoLoad, {
    dir: path.join(import.meta.dirname, 'plugins'),
    dirNameRoutePrefix: false,
  });

  await di(fastify);

  await fastify.register(AutoLoad, {
    dir: path.join(import.meta.dirname, '../modules'),
    dirNameRoutePrefix: false,
    options: {
      prefix: '/api',
    },
    matchFilter: (routePath) => /\.route\.ts$/.test(routePath),
  });

  await fastify.register(UnderPressure, {
    healthCheck: async () => true,
    healthCheckInterval: 5000,
    exposeStatusRoute: {
      routeOpts: { logLevel: 'silent' },
      url: '/health',
    },
  });

  return fastify.withTypeProvider<TypeBoxTypeProvider>();
}
