import type postgres from 'postgres';
import type {
  InteractionDirectory,
  MessageReadStore,
  PersistedMessage,
} from '#src/modules/message/index.ts';

type Database = ReturnType<typeof postgres>;

interface MessageRow {
  id: string;
  origin: string;
  destination: string;
  content: string;
  created_at: Date | string;
}

interface InteractionMessageRow {
  message_id: string;
  position: string | number | bigint;
}

export class PostgresMessageReadStore implements MessageReadStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async findMessage(messageId: string): Promise<PersistedMessage | undefined> {
    const rows = await this.#db<MessageRow[]>`
      SELECT id, origin, destination, content, created_at
      FROM messages
      WHERE id = ${messageId}
    `;
    const row = rows[0];
    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      origin: row.origin,
      destination: row.destination,
      content: row.content,
      createdAt: toDate(row.created_at),
    };
  }

  async findInteraction(interactionId: string): Promise<InteractionDirectory | undefined> {
    const interactions = await this.#db<{ id: string }[]>`
      SELECT id
      FROM interactions
      WHERE id = ${interactionId}
    `;
    if (interactions.length === 0) {
      return undefined;
    }

    const rows = await this.#db<InteractionMessageRow[]>`
      SELECT message_id, position
      FROM interaction_messages
      WHERE interaction_id = ${interactionId}
      ORDER BY position ASC
    `;

    return {
      id: interactionId,
      messages: rows.map((row) => ({
        messageId: row.message_id,
        position: toPosition(row.position),
      })),
    };
  }
}

function toDate(value: Date | string): Date {
  if (value instanceof Date) {
    return value;
  }
  return new Date(value);
}

function toPosition(value: string | number | bigint): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return Number(value);
}
