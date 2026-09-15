import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { SubmitMessageError } from '#src/modules/message/index.ts';
import { PostgresSubmitMessageStore } from './postgres-submit-message-store.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;

test(
  'commits new and appended messages atomically with unique concurrent positions',
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);
    const db = postgres(databaseUrl, { max: 20 });
    const store = new PostgresSubmitMessageStore(db);
    const interactionId = randomUUID();
    const firstMessageId = randomUUID();

    try {
      await store.commit({
        messageId: firstMessageId,
        interactionId,
        createInteraction: true,
        origin: 'origin-1',
        destination: 'destination-1',
        content: 'first',
        createdAt: new Date('2026-09-15T00:00:00.000Z'),
      });

      const appendedMessageIds = Array.from({ length: 16 }, () => randomUUID());
      await Promise.all(
        appendedMessageIds.map((messageId) =>
          store.commit({
            messageId,
            interactionId,
            createInteraction: false,
            origin: 'origin-1',
            destination: 'destination-1',
            content: 'concurrent',
            createdAt: new Date('2026-09-15T00:00:01.000Z'),
          }),
        ),
      );

      const positions = await db<{ position: string }[]>`
        SELECT position::text AS position
        FROM interaction_messages
        WHERE interaction_id = ${interactionId}
        ORDER BY position
      `;
      assert.deepEqual(
        positions.map(({ position }) => Number(position)),
        Array.from({ length: 17 }, (_, index) => index),
      );

      const messageCount = await db<{ count: string }[]>`
        SELECT COUNT(*)::text AS count
        FROM messages
        WHERE id = ${firstMessageId}
           OR id = ANY(${appendedMessageIds})
      `;
      assert.equal(messageCount[0]?.count, '17');
    } finally {
      await db.end();
    }
  },
);

test(
  'rejects a missing interaction and rolls back a failed append',
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);
    const db = postgres(databaseUrl);
    const store = new PostgresSubmitMessageStore(db);
    const missingInteractionId = randomUUID();

    try {
      await assert.rejects(
        store.commit({
          messageId: randomUUID(),
          interactionId: missingInteractionId,
          createInteraction: false,
          origin: 'origin-1',
          destination: 'destination-1',
          content: 'missing',
          createdAt: new Date(),
        }),
        (error: unknown) => {
          return error instanceof SubmitMessageError && error.code === 'INTERACTION_NOT_FOUND';
        },
      );

      const missingRows = await db<{ count: string }[]>`
        SELECT COUNT(*)::text AS count
        FROM interaction_messages
        WHERE interaction_id = ${missingInteractionId}
      `;
      assert.equal(missingRows[0]?.count, '0');

      const interactionId = randomUUID();
      const duplicateMessageId = randomUUID();
      await store.commit({
        messageId: duplicateMessageId,
        interactionId,
        createInteraction: true,
        origin: 'origin-1',
        destination: 'destination-1',
        content: 'first',
        createdAt: new Date(),
      });

      await assert.rejects(
        store.commit({
          messageId: duplicateMessageId,
          interactionId,
          createInteraction: false,
          origin: 'origin-1',
          destination: 'destination-1',
          content: 'duplicate id',
          createdAt: new Date(),
        }),
      );

      const committedRows = await db<{ count: string }[]>`
        SELECT COUNT(*)::text AS count
        FROM interaction_messages
        WHERE interaction_id = ${interactionId}
      `;
      assert.equal(committedRows[0]?.count, '1');
    } finally {
      await db.end();
    }
  },
);
