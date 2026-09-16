import type { ActionInvocation, ActionResult, CanonicalMessage } from '../shared/contracts.ts';
import type { DeckStore } from './deck-store.ts';

export interface CoreActionPort {
  getMessage(messageId: string): Promise<CanonicalMessage>;
  submitReply(input: {
    interactionId: string;
    destination: string;
    content: string;
  }): Promise<{ messageId: string; interactionId: string }>;
}

export class ActionService {
  private readonly store: DeckStore;
  private readonly core: CoreActionPort;
  private readonly inFlight = new Set<string>();

  constructor(store: DeckStore, core: CoreActionPort) {
    this.store = store;
    this.core = core;
  }

  async execute(messageId: string, action: ActionInvocation): Promise<ActionResult> {
    if (this.inFlight.has(messageId)) {
      throw new Error('An action is already in progress for this card');
    }

    this.inFlight.add(messageId);
    try {
      const item = this.store.get(messageId);
      if (!item) {
        throw new Error('Deck item not found');
      }

      if (action.type === 'send-fixed-message' || action.type === 'send-custom-message') {
        const content = action.value?.trim();
        if (!content) {
          throw new Error(
            action.type === 'send-fixed-message'
              ? 'Fixed message must not be empty'
              : 'Custom message must not be empty',
          );
        }
        const source = await this.core.getMessage(messageId);
        const reply = await this.core.submitReply({
          interactionId: item.interactionId,
          destination: source.origin,
          content,
        });
        const updated = await this.store.update(messageId, { status: 'handled' });
        return { item: updated, advance: true, replyMessageId: reply.messageId };
      }

      if (action.type === 'handled') {
        return {
          item: await this.store.update(messageId, { status: 'handled' }),
          advance: true,
        };
      }

      if (action.type === 'later') {
        return {
          item: await this.store.update(messageId, { status: 'later' }),
          advance: true,
        };
      }

      if (action.type === 'mark-read') {
        return {
          item: await this.store.update(messageId, { attention: 'read' }),
          advance: true,
        };
      }

      if (action.type === 'mark-unread') {
        return {
          item: await this.store.update(messageId, { attention: 'unread' }),
          advance: true,
        };
      }

      if (action.type === 'skip') {
        return { item, advance: true };
      }

      return { item, advance: false };
    } finally {
      this.inFlight.delete(messageId);
    }
  }
}
