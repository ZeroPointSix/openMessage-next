import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify';
import type {
  CreateEndpointService,
  GetEndpointService,
  UpdateEndpointService,
} from '#src/modules/endpoint/index.ts';
import { Dependencies as InfrastructureDependencies } from '#src/modules/index.ts';
import type { SubmitMessageService } from '#src/modules/message/index.ts';

declare module 'fastify' {
  interface FastifyInstance {
    createEndpoint: CreateEndpointService;
    getEndpoint: GetEndpointService;
    updateEndpoint: UpdateEndpointService;
    endpointConfigToken: string;
    submitMessage: SubmitMessageService;
  }
}

declare global {
  // Declare global DI container type
  // type Dependencies = InfrastructureDependencies;
  interface Dependencies extends InfrastructureDependencies {}
  // Ensures HTTP request is strongly typed from the schema
  type FastifyRouteInstance = FastifyInstance<
    RawServerDefault,
    RawRequestDefaultExpression<RawServerDefault>,
    RawReplyDefaultExpression<RawServerDefault>,
    FastifyBaseLogger,
    TypeBoxTypeProvider
  >;
}

// Strongly Type DI container
declare module '@fastify/awilix' {
  interface Cradle extends Dependencies {}

  interface RequestCradle extends Dependencies {}
}

declare module '@fastify/request-context' {
  interface RequestContextData {
    requestId: string;
  }
}
