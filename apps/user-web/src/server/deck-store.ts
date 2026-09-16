import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  type AttentionState,
  type DeckItem,
  type DeckStatus,
  defaultGestures,
  type GestureConfig,
  type InboundEnvelope,
} from '../shared/contracts.ts';

interface PersistedState {
  version: 1;
  items: DeckItem[];
  gestures: GestureConfig;
}

const initialState = (): PersistedState => ({
  version: 1,
  items: [],
  gestures: structuredClone(defaultGestures),
});

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
    (item.attention === 'unread' || item.attention === 'read')
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
  private state: PersistedState = initialState();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load(): Promise<void> {
    try {
      this.state = parseState(await readFile(this.filePath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      await this.persist();
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
      .map((item) => ({ ...item }));
  }

  get(messageId: string): DeckItem | undefined {
    const item = this.state.items.find((candidate) => candidate.messageId === messageId);
    return item ? { ...item } : undefined;
  }

  getGestures(): GestureConfig {
    return structuredClone(this.state.gestures);
  }

  async add(envelope: InboundEnvelope): Promise<{ item: DeckItem; created: boolean }> {
    const existing = this.state.items.find((item) => item.messageId === envelope.message.id);
    if (existing) {
      return { item: { ...existing }, created: false };
    }

    const item: DeckItem = {
      messageId: envelope.message.id,
      interactionId: envelope.interactionId,
      status: 'pending',
      attention: 'unread',
      receivedAt: new Date().toISOString(),
    };
    this.state.items.push(item);
    await this.persist();
    return { item: { ...item }, created: true };
  }

  async update(
    messageId: string,
    update: { status?: DeckStatus; attention?: AttentionState },
  ): Promise<DeckItem> {
    const index = this.state.items.findIndex((item) => item.messageId === messageId);
    if (index < 0) {
      throw new Error('Deck item not found');
    }

    const current = this.state.items[index];
    if (!current) {
      throw new Error('Deck item not found');
    }
    const next = { ...current, ...update };
    this.state.items[index] = next;
    await this.persist();
    return { ...next };
  }

  async setGestures(gestures: GestureConfig): Promise<GestureConfig> {
    this.state.gestures = structuredClone(gestures);
    await this.persist();
    return this.getGestures();
  }

  private async persist(): Promise<void> {
    const snapshot = JSON.stringify(this.state, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.tmp`;
      await writeFile(temporary, snapshot, 'utf8');
      await rename(temporary, this.filePath);
    });
    await this.writeQueue;
  }
}
