export interface Message {
  id: string;
  origin: string;
  destination: string;
  content: string;
  createdAt: string;
}

export interface InteractionReadModel {
  id: string;
  messages: Array<{
    messageId: string;
    position: string;
  }>;
}

export interface PersistedMessage {
  id: string;
  origin: string;
  destination: string;
  content: string;
  createdAt: Date;
}

export interface InteractionDirectory {
  id: string;
  messages: Array<{
    messageId: string;
    position: string;
  }>;
}

export interface MessageReadStore {
  findMessage(messageId: string): Promise<PersistedMessage | undefined>;
  findInteraction(interactionId: string): Promise<InteractionDirectory | undefined>;
}

export type MessageReadErrorCode =
  | 'INVALID_REQUEST'
  | 'MESSAGE_NOT_FOUND'
  | 'INTERACTION_NOT_FOUND';

export class MessageReadError extends Error {
  readonly code: MessageReadErrorCode;

  constructor(code: MessageReadErrorCode, message: string) {
    super(message);
    this.name = 'MessageReadError';
    this.code = code;
  }
}

interface MessageReadDependencies {
  store: MessageReadStore;
}

export class GetMessageService {
  readonly #store: MessageReadStore;

  constructor({ store }: MessageReadDependencies) {
    this.#store = store;
  }

  async execute(messageId: string): Promise<Message> {
    assertNonBlank(messageId, 'messageId');

    const message = await this.#store.findMessage(messageId);
    if (!message) {
      throw new MessageReadError('MESSAGE_NOT_FOUND', `Message ${messageId} does not exist`);
    }

    return {
      id: message.id,
      origin: message.origin,
      destination: message.destination,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    };
  }
}

export class GetInteractionService {
  readonly #store: MessageReadStore;

  constructor({ store }: MessageReadDependencies) {
    this.#store = store;
  }

  async execute(interactionId: string): Promise<InteractionReadModel> {
    assertNonBlank(interactionId, 'interactionId');

    const interaction = await this.#store.findInteraction(interactionId);
    if (!interaction) {
      throw new MessageReadError(
        'INTERACTION_NOT_FOUND',
        `Interaction ${interactionId} does not exist`,
      );
    }

    return {
      id: interaction.id,
      messages: interaction.messages.map((entry) => ({
        messageId: entry.messageId,
        position: entry.position,
      })),
    };
  }
}

function assertNonBlank(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MessageReadError('INVALID_REQUEST', `${field} must be a non-empty string`);
  }
}
