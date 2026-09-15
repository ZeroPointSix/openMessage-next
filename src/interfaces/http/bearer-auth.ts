import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
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
  const providedToken = authorization?.match(/^Bearer +(\S+)$/i)?.[1];
  if (providedToken === undefined) {
    return reply
      .header('www-authenticate', 'Bearer')
      .status(401)
      .send(errorBody(401, 'Unauthorized', 'Bearer token is required', request.id));
  }

  const provided = Buffer.from(providedToken);
  const expected = Buffer.from(options.token);
  const comparisonLength = Math.max(provided.length, expected.length);
  const providedPadded = Buffer.alloc(comparisonLength);
  const expectedPadded = Buffer.alloc(comparisonLength);
  provided.copy(providedPadded);
  expected.copy(expectedPadded);
  const tokenMatches = timingSafeEqual(providedPadded, expectedPadded);
  if (!tokenMatches || provided.length !== expected.length) {
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
