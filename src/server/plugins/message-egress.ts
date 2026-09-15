import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { BestEffortDispatcher } from '#src/adapters/egress/best-effort-dispatcher.ts';
import { HttpEgressAdapter } from '#src/adapters/egress/http-egress-adapter.ts';
import { PostgresEndpointStore } from '#src/adapters/persistence/postgres-endpoint-store.ts';
import { PostgresSubmitMessageStore } from '#src/adapters/persistence/postgres-submit-message-store.ts';
import { env } from '#src/config/index.ts';
import { SubmitMessageService } from '#src/modules/index.ts';
import { getDb } from '#src/shared/db/postgres.ts';

async function messageEgressPlugin(fastify: FastifyInstance) {
  const db = getDb();
  const endpointStore = new PostgresEndpointStore(db);
  const endpointResolver = {
    resolveEndpoint: (endpointId: string) => endpointStore.findById(endpointId),
  };
  const httpAdapter = new HttpEgressAdapter({ timeoutMs: env.egress.httpTimeoutMs });
  const dispatcher = new BestEffortDispatcher({
    endpointResolver,
    adapters: new Map([['http', httpAdapter]]),
    logger: fastify.log,
  });

  fastify.decorate(
    'submitMessage',
    new SubmitMessageService({
      endpointResolver,
      store: new PostgresSubmitMessageStore(db),
      dispatcher,
    }),
  );
}

export default fp(messageEgressPlugin, { name: 'messageEgress' });
