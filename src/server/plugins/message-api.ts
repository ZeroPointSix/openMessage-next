import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { PostgresEndpointStore } from '#src/adapters/persistence/postgres-endpoint-store.ts';
import { PostgresMessageReadStore } from '#src/adapters/persistence/postgres-message-read-store.ts';
import { PostgresSubmitMessageStore } from '#src/adapters/persistence/postgres-submit-message-store.ts';
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

  fastify.decorate(
    'submitMessage',
    new SubmitMessageService({
      endpointResolver: {
        resolveEndpoint: (endpointId) => endpointStore.findById(endpointId),
      },
      store: submitMessageStore,
    }),
  );
  fastify.decorate('getMessage', new GetMessageService({ store: messageReadStore }));
  fastify.decorate('getInteraction', new GetInteractionService({ store: messageReadStore }));
  fastify.decorate('messageApiToken', process.env.MESSAGE_API_TOKEN ?? '');
}

export default fp(messageApiPlugin, { name: 'messageApi' });
