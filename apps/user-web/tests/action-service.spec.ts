import { mkdtemp } from 'node:fs/promises';
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

describe('ActionService', () => {
  let store: DeckStore;
  let core: CoreActionPort;
  let service: ActionService;
  const getMessage = vi.fn(async () => message);
  const submitReply = vi.fn(async () => ({
    messageId: 'reply-1',
    interactionId: 'interaction-1',
  }));

  beforeEach(async () => {
    const directory = await mkdtemp(join(tmpdir(), 'user-web-test-'));
    store = new DeckStore(join(directory, 'deck.json'));
    await store.load();
    await store.add({ interactionId: 'interaction-1', message });
    getMessage.mockClear();
    submitReply.mockClear();
    core = { getMessage, submitReply };
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

  it('preserves the card when a reply fails', async () => {
    submitReply.mockRejectedValueOnce(new Error('Core unavailable'));

    await expect(
      service.execute('message-1', { type: 'send-fixed-message', value: 'Stop' }),
    ).rejects.toThrow('Core unavailable');
    expect(store.get('message-1')).toMatchObject({ status: 'pending' });
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
