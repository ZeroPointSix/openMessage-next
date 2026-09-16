import type {
  ActionInvocation,
  ActionResult,
  CanonicalMessage,
  DeckItem,
  ReplyDelivery,
} from '../shared/contracts.ts';
import type { DeckStore } from './deck-store.ts';

export interface CoreActionPort {
  getMessage(messageId: string): Promise<CanonicalMessage>;
  findReply(input: {
    interactionId: string;
    destination: string;
    content: string;
    preparedAt: string;
  }): Promise<CanonicalMessage | undefined>;
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
      if (item.status === 'handled') {
        throw new Error('Deck item is already handled');
      }

      if (action.type === 'send-fixed-message' || action.type === 'send-custom-message') {
        return await this.submitReply(item, action);
      }
      if (item.replyDelivery) {
        throw new Error('A reply is awaiting recovery for this card');
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

  private async submitReply(item: DeckItem, action: ActionInvocation): Promise<ActionResult> {
    let delivery = item.replyDelivery;
    if (!delivery) {
      const content = action.value?.trim();
      if (!content) {
        throw new Error(
          action.type === 'send-fixed-message'
            ? 'Fixed message must not be empty'
            : 'Custom message must not be empty',
        );
      }
      const source = await this.core.getMessage(item.messageId);
      delivery = {
        destination: source.origin,
        content,
        preparedAt: new Date().toISOString(),
      };
      await this.store.update(item.messageId, { replyDelivery: delivery });
    }

    const existing = await this.core.findReply({
      interactionId: item.interactionId,
      destination: delivery.destination,
      content: delivery.content,
      preparedAt: delivery.preparedAt,
    });
    const reply =
      existing ??
      (await this.core.submitReply({
        interactionId: item.interactionId,
        destination: delivery.destination,
        content: delivery.content,
      }));
    const replyMessageId = 'id' in reply ? reply.id : reply.messageId;
    const completed: ReplyDelivery = { ...delivery, replyMessageId };

    let updated: DeckItem;
    try {
      updated = await this.store.update(item.messageId, {
        status: 'handled',
        replyDelivery: completed,
      });
    } catch (error) {
      const inMemory = this.store.get(item.messageId);
      if (inMemory?.status !== 'handled') {
        throw error;
      }
      updated = inMemory;
    }

    return { item: updated, advance: true, replyMessageId };
  }
}
