import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import postgres from 'postgres';
import { GetInteractionService, GetMessageService } from '#src/modules/message/index.ts';
import { PostgresMessageReadStore } from './postgres-message-read-store.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('reads canonical messages and ordered interaction directories without writes', {
  skip: databaseUrl === undefined,
}, async () => {
  assert.ok(databaseUrl);
  const db = postgres(databaseUrl, { max: 5 });
  const store = new PostgresMessageReadStore(db);
  const getMessage = new GetMessageService({ store });
  const getInteraction = new GetInteractionService({ store });

  const interactionId = randomUUID();
  const firstMessageId = randomUUID();
  const secondMessageId = randomUUID();
  const createdAt = new Date('2026-09-15T02:03:04.000Z');

  try {
    await db`INSERT INTO interactions (id) VALUES (${interactionId})`;
    await db`
      INSERT INTO messages (id, origin, destination, content, created_at)
      VALUES
        (${firstMessageId}, 'endpoint-a', 'endpoint-b', 'first', ${createdAt}),
        (${secondMessageId}, 'endpoint-b', 'endpoint-a', 'second', ${createdAt})
    `;
    await db`
      INSERT INTO interaction_messages (interaction_id, message_id, position)
      VALUES
        (${interactionId}, ${firstMessageId}, 0),
        (${interactionId}, ${secondMessageId}, 1)
    `;

    assert.deepEqual(await getMessage.execute(firstMessageId), {
      id: firstMessageId,
      origin: 'endpoint-a',
      destination: 'endpoint-b',
      content: 'first',
      createdAt: createdAt.toISOString(),
    });

    assert.deepEqual(await getInteraction.execute(interactionId), {
      id: interactionId,
      messages: [
        { messageId: firstMessageId, position: 0 },
        { messageId: secondMessageId, position: 1 },
      ],
    });

    const emptyInteractionId = randomUUID();
    await db`INSERT INTO interactions (id) VALUES (${emptyInteractionId})`;
    assert.deepEqual(await getInteraction.execute(emptyInteractionId), {
      id: emptyInteractionId,
      messages: [],
    });

    await assert.rejects(getMessage.execute(randomUUID()), (error: unknown) => {
      return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'MESSAGE_NOT_FOUND'
      );
    });
    await assert.rejects(getInteraction.execute(randomUUID()), (error: unknown) => {
      return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'INTERACTION_NOT_FOUND'
      );
    });
  } finally {
    await db.end();
  }
});
