import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import postgres from 'postgres';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function hasSqlState(error: unknown, expected: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === expected;
}

describe('core persistence schema', { skip: testDatabaseUrl === undefined }, () => {
  let sql: ReturnType<typeof postgres> | undefined;

  before(() => {
    assert.ok(testDatabaseUrl);
    sql = postgres(testDatabaseUrl, { max: 1 });
  });

  after(async () => {
    await sql?.end({ timeout: 5 });
  });

  it('creates only the first-stage business tables', async () => {
    const rows = await sql!<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    assert.deepEqual(
      rows.map(({ table_name }) => table_name),
      ['endpoints', 'interaction_messages', 'interactions', 'messages', 'schema_migrations'],
    );
  });

  it('keeps the first-stage columns exact', async () => {
    const rows = await sql!<{ column_name: string; table_name: string }[]>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('messages', 'interactions', 'interaction_messages', 'endpoints')
      ORDER BY table_name, ordinal_position
    `;

    const columns = Object.groupBy(rows, ({ table_name }) => table_name);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(columns).map(([tableName, tableColumns]) => [
          tableName,
          tableColumns?.map(({ column_name }) => column_name),
        ]),
      ),
      {
        endpoints: ['id', 'egress_adapter', 'address', 'enabled'],
        interaction_messages: ['interaction_id', 'message_id', 'position'],
        interactions: ['id'],
        messages: ['id', 'origin', 'destination', 'content', 'created_at'],
      },
    );
  });

  it('enforces interaction position uniqueness', async () => {
    const interactionId = randomUUID();
    const firstMessageId = randomUUID();
    const secondMessageId = randomUUID();

    await sql!`INSERT INTO interactions (id) VALUES (${interactionId})`;
    await sql!`
      INSERT INTO messages (id, origin, destination, content, created_at)
      VALUES
        (${firstMessageId}, 'endpoint-a', 'endpoint-b', 'first', NOW()),
        (${secondMessageId}, 'endpoint-b', 'endpoint-a', 'second', NOW())
    `;
    await sql!`
      INSERT INTO interaction_messages (interaction_id, message_id, position)
      VALUES (${interactionId}, ${firstMessageId}, 0)
    `;

    await assert.rejects(
      sql!`
        INSERT INTO interaction_messages (interaction_id, message_id, position)
        VALUES (${interactionId}, ${secondMessageId}, 0)
      `,
      (error: unknown) => hasSqlState(error, '23505'),
    );
  });

  it('prevents a message from belonging to multiple interactions', async () => {
    const firstInteractionId = randomUUID();
    const secondInteractionId = randomUUID();
    const messageId = randomUUID();

    await sql!`
      INSERT INTO interactions (id)
      VALUES (${firstInteractionId}), (${secondInteractionId})
    `;
    await sql!`
      INSERT INTO messages (id, origin, destination, content, created_at)
      VALUES (${messageId}, 'endpoint-a', 'endpoint-b', 'message', NOW())
    `;
    await sql!`
      INSERT INTO interaction_messages (interaction_id, message_id, position)
      VALUES (${firstInteractionId}, ${messageId}, 0)
    `;

    await assert.rejects(
      sql!`
        INSERT INTO interaction_messages (interaction_id, message_id, position)
        VALUES (${secondInteractionId}, ${messageId}, 0)
      `,
      (error: unknown) => hasSqlState(error, '23505'),
    );
  });

  it('enforces both interaction-message foreign keys', async () => {
    const interactionId = randomUUID();
    const messageId = randomUUID();

    await sql!`INSERT INTO interactions (id) VALUES (${interactionId})`;
    await sql!`
      INSERT INTO messages (id, origin, destination, content, created_at)
      VALUES (${messageId}, 'endpoint-a', 'endpoint-b', 'message', NOW())
    `;

    await assert.rejects(
      sql!`
        INSERT INTO interaction_messages (interaction_id, message_id, position)
        VALUES (${randomUUID()}, ${messageId}, 0)
      `,
      (error: unknown) => hasSqlState(error, '23503'),
    );
    await assert.rejects(
      sql!`
        INSERT INTO interaction_messages (interaction_id, message_id, position)
        VALUES (${interactionId}, ${randomUUID()}, 0)
      `,
      (error: unknown) => hasSqlState(error, '23503'),
    );
  });

  it('keeps messages immutable after creation', async () => {
    const messageId = randomUUID();

    await sql!`
      INSERT INTO messages (id, origin, destination, content, created_at)
      VALUES (${messageId}, 'endpoint-a', 'endpoint-b', 'immutable', NOW())
    `;

    await assert.rejects(
      sql!`UPDATE messages SET content = 'changed' WHERE id = ${messageId}`,
      (error: unknown) => hasSqlState(error, '55000'),
    );
    await assert.rejects(sql!`DELETE FROM messages WHERE id = ${messageId}`, (error: unknown) =>
      hasSqlState(error, '55000'),
    );
  });
});
