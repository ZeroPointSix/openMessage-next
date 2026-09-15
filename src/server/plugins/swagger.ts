import Swagger from '@fastify/swagger';
import SwaggerUI from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { apiErrorResponseRef } from '#src/shared/api/api-error.response.ts';

async function swaggerGeneratorPlugin(fastify: FastifyInstance) {
  await fastify.register(Swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'openMessage',
        description: 'openMessage backend API documentation.',
        version: process.env.npm_package_version ?? '0.0.0',
      },
      components: {
        securitySchemes: {
          endpointConfigBearer: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'API key',
            description: 'Management token for runtime endpoint configuration.',
          },
        },
      },
    },
    // Document the shared error envelope once, globally, as the 4XX/5XX range
    // responses for every schema-bearing route. Specific route codes override the range.
    transform: ({ schema, url }) => ({
      url,
      schema: {
        ...schema,
        response: {
          '4xx': apiErrorResponseRef,
          '5xx': apiErrorResponseRef,
          ...(schema?.response as Record<string | number, unknown> | undefined),
        },
      },
    }),
  });

  await fastify.register(SwaggerUI, {
    routePrefix: '/api-docs',
  });

  fastify.log.info(`Swagger documentation is available at /api-docs`);
}

export default fp(swaggerGeneratorPlugin, {
  name: 'swaggerGenerator',
});
