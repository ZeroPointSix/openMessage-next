import type { FastifyReply, FastifyRequest } from 'fastify';
import { type Static, Type } from 'typebox';
import { EndpointRegistryError } from '#src/modules/endpoint/index.ts';
import { apiErrorResponseRef } from '#src/shared/api/api-error.response.ts';
import { authenticateBearer } from './http/bearer-auth.ts';

const endpointId = Type.String({
  minLength: 1,
  maxLength: 128,
  pattern: '.*\\S.*',
  example: 'endpoint-b',
});
const address = Type.String({
  minLength: 8,
  format: 'uri',
  pattern: '^https?://',
  example: 'https://b.example.com/openmessage',
});
const headers = Type.Unsafe<Record<string, string>>({
  type: 'object',
  additionalProperties: { type: 'string', maxLength: 4096 },
  maxProperties: 32,
  example: { 'x-openmessage-token': 'replace-with-a-secret' },
});
const endpoint = Type.Object(
  {
    endpointId,
    egressAdapter: Type.Literal('http', { example: 'http' }),
    address,
    enabled: Type.Boolean({ example: true }),
    headers: Type.Optional(headers),
  },
  { $id: 'EndpointConfig', additionalProperties: false },
);
const createBody = Type.Object(
  {
    id: endpointId,
    egressAdapter: Type.Literal('http', { example: 'http' }),
    address,
    enabled: Type.Boolean({ example: true }),
    headers: Type.Optional(headers),
  },
  { additionalProperties: false },
);
const updateBody = Type.Object(
  {
    address: Type.Optional(address),
    enabled: Type.Optional(Type.Boolean({ example: false })),
    egressAdapter: Type.Optional(Type.Literal('http', { example: 'http' })),
    headers: Type.Optional(headers),
  },
  { additionalProperties: false, minProperties: 1 },
);
const params = Type.Object({ endpointId }, { additionalProperties: false });
type Params = Static<typeof params>;
type CreateBody = Static<typeof createBody>;
type UpdateBody = Static<typeof updateBody>;
const errors = {
  400: apiErrorResponseRef,
  401: apiErrorResponseRef,
  403: apiErrorResponseRef,
  404: apiErrorResponseRef,
  503: apiErrorResponseRef,
};

export default async function endpointRoutes(fastify: FastifyRouteInstance) {
  fastify.post<{ Body: CreateBody }>(
    '/v1/endpoints',
    {
      preHandler: authenticate,
      schema: {
        tags: ['Endpoint configuration'],
        summary: 'Create an endpoint route',
        description: 'Registers a runtime HTTP route without probing reachability.',
        security: [{ endpointConfigBearer: [] }],
        body: createBody,
        response: { 201: endpoint, ...errors, 409: apiErrorResponseRef },
      },
    },
    async (request, reply) => {
      try {
        const created = await fastify.createEndpoint.execute({
          endpointId: request.body.id,
          egressAdapter: request.body.egressAdapter,
          address: request.body.address,
          enabled: request.body.enabled,
          ...(request.body.headers === undefined ? {} : { headers: request.body.headers }),
        });
        return reply.status(201).send(created);
      } catch (error) {
        return sendEndpointError(error, request, reply);
      }
    },
  );

  fastify.get<{ Params: Params }>(
    '/v1/endpoints/:endpointId',
    {
      preHandler: authenticate,
      schema: {
        tags: ['Endpoint configuration'],
        summary: 'Get an endpoint route',
        security: [{ endpointConfigBearer: [] }],
        params,
        response: { 200: endpoint, ...errors },
      },
    },
    async (request, reply) => {
      try {
        return await fastify.getEndpoint.execute(request.params.endpointId);
      } catch (error) {
        return sendEndpointError(error, request, reply);
      }
    },
  );

  fastify.patch<{ Params: Params; Body: UpdateBody }>(
    '/v1/endpoints/:endpointId',
    {
      preHandler: authenticate,
      schema: {
        tags: ['Endpoint configuration'],
        summary: 'Update an endpoint route',
        description:
          'Address, enabled, and header updates affect subsequent resolution immediately.',
        security: [{ endpointConfigBearer: [] }],
        params,
        body: updateBody,
        response: { 200: endpoint, ...errors },
      },
    },
    async (request, reply) => {
      try {
        return await fastify.updateEndpoint.execute({
          ...request.body,
          endpointId: request.params.endpointId,
        });
      } catch (error) {
        return sendEndpointError(error, request, reply);
      }
    },
  );
}

async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  return authenticateBearer(request, reply, {
    token: request.server.endpointConfigToken,
    unconfiguredMessage: 'Endpoint configuration authentication is not configured',
    forbiddenMessage: 'Bearer token is not authorized for endpoint configuration',
  });
}

function sendEndpointError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (!(error instanceof EndpointRegistryError)) throw error;
  const mapped = {
    INVALID_REQUEST: [400, 'Bad Request'],
    ENDPOINT_NOT_FOUND: [404, 'Not Found'],
    ENDPOINT_ALREADY_EXISTS: [409, 'Conflict'],
  }[error.code] as [number, string];
  return reply.status(mapped[0]).send(errorBody(mapped[0], mapped[1], error.message, request.id));
}

function errorBody(statusCode: number, error: string, message: string, correlationId: string) {
  return { statusCode, error, message, correlationId };
}
