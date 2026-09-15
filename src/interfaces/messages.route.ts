import type { FastifyReply, FastifyRequest } from 'fastify';
import { type Static, Type } from 'typebox';
import { MessageReadError, SubmitMessageError } from '#src/modules/message/index.ts';
import { apiErrorResponseRef } from '#src/shared/api/api-error.response.ts';
import { authenticateBearer } from './http/bearer-auth.ts';

const identifier = Type.String({
  minLength: 1,
  maxLength: 128,
  pattern: '.*\\S.*',
  example: '2ce69540-11d1-4fba-99f1-40e0e154e690',
});
const message = Type.Object(
  {
    id: identifier,
    origin: Type.String({
      minLength: 1,
      maxLength: 128,
      pattern: '.*\\S.*',
      example: 'endpoint-a',
    }),
    destination: Type.String({
      minLength: 1,
      maxLength: 128,
      pattern: '.*\\S.*',
      example: 'endpoint-b',
    }),
    content: Type.String({
      minLength: 1,
      maxLength: 65_536,
      pattern: '.*\\S.*',
      example: 'Hello from endpoint A',
    }),
    createdAt: Type.String({ format: 'date-time', example: '2026-09-15T08:00:00.000Z' }),
  },
  { $id: 'MessageResponse', additionalProperties: false },
);
const interaction = Type.Object(
  {
    id: identifier,
    messages: Type.Array(
      Type.Object(
        {
          messageId: identifier,
          position: Type.String({ pattern: '^\\d+$', example: '0' }),
        },
        { additionalProperties: false },
      ),
      { example: [{ messageId: '2ce69540-11d1-4fba-99f1-40e0e154e690', position: '0' }] },
    ),
  },
  { $id: 'InteractionResponse', additionalProperties: false },
);
const submitBody = Type.Object(
  {
    interactionId: Type.Optional(identifier),
    message: Type.Object(
      {
        origin: Type.String({
          minLength: 1,
          maxLength: 128,
          pattern: '.*\\S.*',
          example: 'endpoint-a',
        }),
        destination: Type.String({
          minLength: 1,
          maxLength: 128,
          pattern: '.*\\S.*',
          example: 'endpoint-b',
        }),
        content: Type.String({
          minLength: 1,
          maxLength: 65_536,
          pattern: '.*\\S.*',
          example: 'Hello from endpoint A',
        }),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'SubmitMessageRequest', additionalProperties: false },
);
const submitResponse = Type.Object(
  { messageId: identifier, interactionId: identifier },
  { $id: 'SubmitMessageResponse', additionalProperties: false },
);
const messageParams = Type.Object({ messageId: identifier }, { additionalProperties: false });
const interactionParams = Type.Object(
  { interactionId: identifier },
  { additionalProperties: false },
);
type SubmitBody = Static<typeof submitBody>;
type MessageParams = Static<typeof messageParams>;
type InteractionParams = Static<typeof interactionParams>;
const errors = {
  400: apiErrorResponseRef,
  401: apiErrorResponseRef,
  403: apiErrorResponseRef,
  404: apiErrorResponseRef,
  409: apiErrorResponseRef,
  500: apiErrorResponseRef,
  503: apiErrorResponseRef,
};

export default async function messageRoutes(fastify: FastifyRouteInstance) {
  fastify.post<{ Body: SubmitBody }>(
    '/v1/messages',
    {
      onRequest: authenticate,
      schema: {
        tags: ['Messages'],
        summary: 'Submit a message',
        description: 'Persists a canonical message and accepts it for best-effort dispatch.',
        security: [{ messageBearer: [] }],
        body: submitBody,
        response: { 201: submitResponse, ...errors },
      },
    },
    async (request, reply) => {
      try {
        const result = await fastify.submitMessage.execute({
          ...(request.body.interactionId === undefined
            ? {}
            : { interactionId: request.body.interactionId }),
          message: request.body.message,
        });
        return reply.status(201).send(result);
      } catch (error) {
        return sendApplicationError(error, request, reply);
      }
    },
  );

  fastify.get<{ Params: MessageParams }>(
    '/v1/messages/:messageId',
    {
      onRequest: authenticate,
      schema: {
        tags: ['Messages'],
        summary: 'Get a canonical message',
        security: [{ messageBearer: [] }],
        params: messageParams,
        response: { 200: message, ...errors },
      },
    },
    async (request, reply) => {
      try {
        return await fastify.getMessage.execute(request.params.messageId);
      } catch (error) {
        return sendApplicationError(error, request, reply);
      }
    },
  );

  fastify.get<{ Params: InteractionParams }>(
    '/v1/interactions/:interactionId',
    {
      onRequest: authenticate,
      schema: {
        tags: ['Interactions'],
        summary: 'Get an interaction directory',
        description: 'Returns message membership and persisted order without delivery state.',
        security: [{ messageBearer: [] }],
        params: interactionParams,
        response: { 200: interaction, ...errors },
      },
    },
    async (request, reply) => {
      try {
        return await fastify.getInteraction.execute(request.params.interactionId);
      } catch (error) {
        return sendApplicationError(error, request, reply);
      }
    },
  );
}

async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  return authenticateBearer(request, reply, {
    token: request.server.messageApiToken,
    unconfiguredMessage: 'Message API authentication is not configured',
    forbiddenMessage: 'Bearer token is not authorized for the Message API',
  });
}

function sendApplicationError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (error instanceof SubmitMessageError) {
    const mapped = {
      INVALID_REQUEST: [400, 'Bad Request'],
      ENDPOINT_NOT_FOUND: [404, 'Not Found'],
      ENDPOINT_DISABLED: [409, 'Conflict'],
      INTERACTION_NOT_FOUND: [404, 'Not Found'],
    }[error.code] as [number, string];
    return reply.status(mapped[0]).send(errorBody(mapped[0], mapped[1], error.message, request.id));
  }
  if (error instanceof MessageReadError) {
    const mapped = {
      INVALID_REQUEST: [400, 'Bad Request'],
      MESSAGE_NOT_FOUND: [404, 'Not Found'],
      INTERACTION_NOT_FOUND: [404, 'Not Found'],
    }[error.code] as [number, string];
    return reply.status(mapped[0]).send(errorBody(mapped[0], mapped[1], error.message, request.id));
  }
  throw error;
}

function errorBody(statusCode: number, error: string, message: string, correlationId: string) {
  return { statusCode, error, message, correlationId };
}
