import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  type AttentionState,
  type DeckItem,
  type DeckStatus,
  defaultGestures,
  type GestureConfig,
  type InboundEnvelope,
  type ReplyDelivery,
} from '../shared/contracts.ts';

interface PersistedState {
  version: 1;
  items: DeckItem[];
  gestures: GestureConfig;
}

export type StateWriter = (filePath: string, snapshot: string) => Promise<void>;

const writeState: StateWriter = async (filePath, snapshot) => {
  await mkdir(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  await writeFile(temporary, snapshot, 'utf8');
  await rename(temporary, filePath);
};

const initialState = (): PersistedState => ({
  version: 1,
  items: [],
  gestures: structuredClone(defaultGestures),
});

const isReplyDelivery = (value: unknown): value is ReplyDelivery => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const delivery = value as Partial<ReplyDelivery>;
  return (
    typeof delivery.destination === 'string' &&
    typeof delivery.content === 'string' &&
    typeof delivery.preparedAt === 'string' &&
    (delivery.replyMessageId === undefined || typeof delivery.replyMessageId === 'string')
  );
};

const isDeckItem = (value: unknown): value is DeckItem => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Partial<DeckItem>;
  return (
    typeof item.messageId === 'string' &&
    typeof item.interactionId === 'string' &&
    typeof item.receivedAt === 'string' &&
    (item.status === 'pending' || item.status === 'later' || item.status === 'handled') &&
    (item.attention === 'unread' || item.attention === 'read') &&
    (item.replyDelivery === undefined || isReplyDelivery(item.replyDelivery))
  );
};

const parseState = (source: string): PersistedState => {
  const value = JSON.parse(source) as Partial<PersistedState>;
  if (value.version !== 1 || !Array.isArray(value.items) || !value.items.every(isDeckItem)) {
    throw new Error('Invalid user-web state file');
  }

  return {
    version: 1,
    items: value.items,
    gestures: value.gestures ?? structuredClone(defaultGestures),
  };
};

export class DeckStore {
  private readonly filePath: string;
  private readonly writer: StateWriter;
  private state: PersistedState = initialState();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string, writer: StateWriter = writeState) {
    this.filePath = filePath;
    this.writer = writer;
  }

  async load(): Promise<void> {
    try {
      this.state = parseState(await readFile(this.filePath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      await this.commit(() => undefined);
    }
  }

  listActive(): DeckItem[] {
    return this.state.items
      .filter((item) => item.status !== 'handled')
      .toSorted((left, right) => {
        if (left.status !== right.status) {
          return left.status === 'pending' ? -1 : 1;
        }
        return left.receivedAt.localeCompare(right.receivedAt);
      })
      .map((item) => structuredClone(item));
  }

  get(messageId: string): DeckItem | undefined {
    const item = this.state.items.find((candidate) => candidate.messageId === messageId);
    return item ? structuredClone(item) : undefined;
  }

  getGestures(): GestureConfig {
    return structuredClone(this.state.gestures);
  }

  async add(envelope: InboundEnvelope): Promise<{ item: DeckItem; created: boolean }> {
    return this.commit((state) => {
      const existing = state.items.find((item) => item.messageId === envelope.message.id);
      if (existing) {
        return { item: existing, created: false };
      }

      const item: DeckItem = {
        messageId: envelope.message.id,
        interactionId: envelope.interactionId,
        status: 'pending',
        attention: 'unread',
        receivedAt: new Date().toISOString(),
      };
      state.items.push(item);
      return { item, created: true };
    });
  }

  async update(
    messageId: string,
    update: {
      status?: DeckStatus;
      attention?: AttentionState;
      replyDelivery?: ReplyDelivery;
    },
  ): Promise<DeckItem> {
    return this.commit((state) => {
      const index = state.items.findIndex((item) => item.messageId === messageId);
      if (index < 0) {
        throw new Error('Deck item not found');
      }

      const current = state.items[index];
      if (!current) {
        throw new Error('Deck item not found');
      }
      const next = { ...current, ...structuredClone(update) };
      state.items[index] = next;
      return next;
    });
  }

  async setGestures(gestures: GestureConfig): Promise<GestureConfig> {
    return this.commit((state) => {
      state.gestures = structuredClone(gestures);
      return state.gestures;
    });
  }

  private async commit<Result>(mutate: (state: PersistedState) => Result): Promise<Result> {
    const operation = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        const next = structuredClone(this.state);
        const result = mutate(next);
        await this.writer(this.filePath, JSON.stringify(next, null, 2));
        this.state = next;
        return structuredClone(result);
      });
    this.writeQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}
