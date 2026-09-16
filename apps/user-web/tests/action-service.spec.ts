import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionService, type CoreActionPort } from '../src/server/action-service.ts';
import { DeckStore } from '../src/server/deck-store.ts';

const message = {
  id: 'message-1',
  origin: 'client-a',
  destination: 'user-web',
  content: 'Proceed?',
  createdAt: '2026-09-16T00:00:00.000Z',
};
const canonicalReply = {
  id: 'reply-1',
  origin: 'user-web',
  destination: 'client-a',
  content: 'Continue',
  createdAt: '2026-09-16T00:01:00.000Z',
};

describe('ActionService', () => {
  let store: DeckStore;
  let core: CoreActionPort;
  let service: ActionService;
  const getMessage = vi.fn(async () => message);
  const findReply = vi.fn<CoreActionPort['findReply']>(async () => undefined);
  const submitReply = vi.fn(async () => ({ messageId: 'reply-1', interactionId: 'interaction-1' }));

  beforeEach(async () => {
    const directory = await mkdtemp(join(tmpdir(), 'user-web-test-'));
    store = new DeckStore(join(directory, 'deck.json'));
    await store.load();
    await store.add({ interactionId: 'interaction-1', message });
    getMessage.mockClear();
    findReply.mockReset().mockResolvedValue(undefined);
    submitReply
      .mockReset()
      .mockResolvedValue({ messageId: 'reply-1', interactionId: 'interaction-1' });
    core = { getMessage, findReply, submitReply };
    service = new ActionService(store, core);
  });

  it('replies to the original sender in the same interaction then marks handled', async () => {
    const result = await service.execute('message-1', {
      type: 'send-custom-message',
      value: '  Continue  ',
    });
    expect(getMessage).toHaveBeenCalledWith('message-1');
    expect(submitReply).toHaveBeenCalledWith({
      interactionId: 'interaction-1',
      destination: 'client-a',
      content: 'Continue',
    });
    expect(result).toMatchObject({
      advance: true,
      replyMessageId: 'reply-1',
      item: { status: 'handled' },
    });
  });

  it('persists a recoverable delivery before calling Core', async () => {
    submitReply.mockRejectedValueOnce(new Error('Core unavailable'));
    await expect(
      service.execute('message-1', { type: 'send-fixed-message', value: 'Stop' }),
    ).rejects.toThrow('Core unavailable');
    expect(store.get('message-1')).toMatchObject({
      status: 'pending',
      replyDelivery: { destination: 'client-a', content: 'Stop' },
    });
  });

  it('does not send twice when persistence fails after Core accepts the reply', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'user-web-failure-'));
    const filePath = join(directory, 'deck.json');
    let writes = 0;
    const failingWriter = vi.fn(async (path: string, snapshot: string) => {
      writes += 1;
      if (writes === 4) throw new Error('disk full');
      await writeFile(path, snapshot, 'utf8');
    });
    const failingStore = new DeckStore(filePath, failingWriter);
    await failingStore.load();
    await failingStore.add({ interactionId: 'interaction-1', message });
    const firstService = new ActionService(failingStore, core);

    const result = await firstService.execute('message-1', {
      type: 'send-custom-message',
      value: 'Continue',
    });
    expect(result).toMatchObject({ item: { status: 'handled' }, replyMessageId: 'reply-1' });
    await expect(
      firstService.execute('message-1', { type: 'send-custom-message', value: 'Continue' }),
    ).rejects.toThrow('Deck item is already handled');
    expect(submitReply).toHaveBeenCalledTimes(1);

    const recoveredStore = new DeckStore(filePath);
    await recoveredStore.load();
    findReply.mockResolvedValueOnce(canonicalReply);
    const recoveredService = new ActionService(recoveredStore, core);
    const recovered = await recoveredService.execute('message-1', {
      type: 'send-custom-message',
      value: 'Continue',
    });
    expect(recovered).toMatchObject({ item: { status: 'handled' }, replyMessageId: 'reply-1' });
    expect(submitReply).toHaveBeenCalledTimes(1);
  });

  it('implements local state actions', async () => {
    expect((await service.execute('message-1', { type: 'mark-read' })).item.attention).toBe('read');
    expect((await service.execute('message-1', { type: 'mark-unread' })).item.attention).toBe(
      'unread',
    );
    expect((await service.execute('message-1', { type: 'later' })).item.status).toBe('later');
    expect((await service.execute('message-1', { type: 'handled' })).item.status).toBe('handled');
  });

  it('keeps skip and no-op non-persistent with distinct advance behavior', async () => {
    const before = store.get('message-1');
    expect((await service.execute('message-1', { type: 'skip' })).advance).toBe(true);
    expect((await service.execute('message-1', { type: 'no-op' })).advance).toBe(false);
    expect(store.get('message-1')).toEqual(before);
  });

  it('rejects empty fixed and custom replies', async () => {
    await expect(
      service.execute('message-1', { type: 'send-fixed-message', value: '  ' }),
    ).rejects.toThrow('Fixed message must not be empty');
    await expect(
      service.execute('message-1', { type: 'send-custom-message', value: '' }),
    ).rejects.toThrow('Custom message must not be empty');
  });
});
