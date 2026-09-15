import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { BestEffortDispatcher } from '#src/adapters/egress/best-effort-dispatcher.ts';
import { HttpEgressAdapter } from '#src/adapters/egress/http-egress-adapter.ts';
import { PostgresEndpointStore } from '#src/adapters/persistence/postgres-endpoint-store.ts';
import { PostgresMessageReadStore } from '#src/adapters/persistence/postgres-message-read-store.ts';
import { PostgresSubmitMessageStore } from '#src/adapters/persistence/postgres-submit-message-store.ts';
import { env } from '#src/config/index.ts';
import {
  GetInteractionService,
  GetMessageService,
  SubmitMessageService,
} from '#src/modules/index.ts';
import { getDb } from '#src/shared/db/postgres.ts';

async function messageApiPlugin(fastify: FastifyInstance) {
  const db = getDb();
  const endpointStore = new PostgresEndpointStore(db);
  const messageReadStore = new PostgresMessageReadStore(db);
  const submitMessageStore = new PostgresSubmitMessageStore(db);
  const endpointResolver = {
    resolveEndpoint: (endpointId: string) => endpointStore.findById(endpointId),
  };
  const dispatcher = new BestEffortDispatcher({
    endpointResolver,
    adapters: new Map([['http', new HttpEgressAdapter({ timeoutMs: env.egress.httpTimeoutMs })]]),
    logger: fastify.log,
  });

  fastify.decorate(
    'submitMessage',
    new SubmitMessageService({
      endpointResolver,
      store: submitMessageStore,
      dispatcher,
    }),
  );
  fastify.decorate('getMessage', new GetMessageService({ store: messageReadStore }));
  fastify.decorate('getInteraction', new GetInteractionService({ store: messageReadStore }));
  fastify.decorate('messageApiToken', process.env.MESSAGE_API_TOKEN ?? '');
}

export default fp(messageApiPlugin, { name: 'messageApi' });
