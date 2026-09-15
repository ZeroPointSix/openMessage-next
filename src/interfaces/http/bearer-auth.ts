import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

interface BearerAuthOptions {
  token: string;
  unconfiguredMessage: string;
  forbiddenMessage: string;
}

export function authenticateBearer(
  request: FastifyRequest,
  reply: FastifyReply,
  options: BearerAuthOptions,
): FastifyReply | undefined {
  if (options.token.length === 0) {
    return reply
      .status(503)
      .send(errorBody(503, 'Service Unavailable', options.unconfiguredMessage, request.id));
  }

  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ') || authorization.length === 7) {
    return reply
      .header('www-authenticate', 'Bearer')
      .status(401)
      .send(errorBody(401, 'Unauthorized', 'Bearer token is required', request.id));
  }

  const provided = createHash('sha256').update(authorization.slice(7)).digest();
  const expected = createHash('sha256').update(options.token).digest();
  if (!timingSafeEqual(provided, expected)) {
    return reply
      .header('www-authenticate', 'Bearer')
      .status(403)
      .send(errorBody(403, 'Forbidden', options.forbiddenMessage, request.id));
  }

  return undefined;
}

function errorBody(statusCode: number, error: string, message: string, correlationId: string) {
  return { statusCode, error, message, correlationId };
}
