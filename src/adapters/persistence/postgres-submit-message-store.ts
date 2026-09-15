import type postgres from 'postgres';
import {
  type CommitMessageInput,
  SubmitMessageError,
  type SubmitMessageStore,
} from '#src/modules/message/index.ts';

type Database = ReturnType<typeof postgres>;

export class PostgresSubmitMessageStore implements SubmitMessageStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async commit(input: CommitMessageInput): Promise<void> {
    await this.#db.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${input.interactionId}, 0))`;

      if (input.createInteraction) {
        await tx`INSERT INTO interactions (id) VALUES (${input.interactionId})`;
      } else {
        const interactions = await tx<{ id: string }[]>`
          SELECT id
          FROM interactions
          WHERE id = ${input.interactionId}
        `;
        if (interactions.length === 0) {
          throw new SubmitMessageError(
            'INTERACTION_NOT_FOUND',
            `Interaction ${input.interactionId} does not exist`,
          );
        }
      }

      const [currentPosition] = await tx<{ position: string }[]>`
        SELECT COALESCE(MAX(position), -1)::text AS position
        FROM interaction_messages
        WHERE interaction_id = ${input.interactionId}
      `;
      if (!currentPosition) {
        throw new Error('Failed to allocate interaction message position');
      }
      const nextPosition = (BigInt(currentPosition.position) + 1n).toString();

      await tx`
        INSERT INTO messages (id, origin, destination, content, created_at)
        VALUES (
          ${input.messageId},
          ${input.origin},
          ${input.destination},
          ${input.content},
          ${input.createdAt}
        )
      `;
      await tx`
        INSERT INTO interaction_messages (interaction_id, message_id, position)
        VALUES (${input.interactionId}, ${input.messageId}, ${nextPosition})
      `;
    });
  }
}
