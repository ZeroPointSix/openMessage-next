import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GetInteractionService,
  GetMessageService,
  type InteractionDirectory,
  MessageReadError,
  type MessageReadStore,
  type PersistedMessage,
} from '../index.ts';

class StoreStub implements MessageReadStore {
  message: PersistedMessage | undefined;
  interaction: InteractionDirectory | undefined;
  findMessageCalls: string[] = [];
  findInteractionCalls: string[] = [];

  async findMessage(messageId: string): Promise<PersistedMessage | undefined> {
    this.findMessageCalls.push(messageId);
    return this.message?.id === messageId ? this.message : undefined;
  }

  async findInteraction(interactionId: string): Promise<InteractionDirectory | undefined> {
    this.findInteractionCalls.push(interactionId);
    return this.interaction?.id === interactionId ? this.interaction : undefined;
  }
}

test('returns the canonical message fields without delivery or interaction metadata', async () => {
  const store = new StoreStub();
  store.message = {
    id: 'message-1',
    origin: 'endpoint-a',
    destination: 'endpoint-b',
    content: 'hello',
    createdAt: new Date('2026-09-15T01:02:03.000Z'),
  };
  const service = new GetMessageService({ store });

  assert.deepEqual(await service.execute('message-1'), {
    id: 'message-1',
    origin: 'endpoint-a',
    destination: 'endpoint-b',
    content: 'hello',
    createdAt: '2026-09-15T01:02:03.000Z',
  });
  assert.deepEqual(Object.keys(await service.execute('message-1')).sort(), [
    'content',
    'createdAt',
    'destination',
    'id',
    'origin',
  ]);
});

test('returns a stable not-found error for a missing message', async () => {
  const store = new StoreStub();
  const service = new GetMessageService({ store });

  await assert.rejects(service.execute('missing-message'), (error: unknown) => {
    return error instanceof MessageReadError && error.code === 'MESSAGE_NOT_FOUND';
  });
});

test('rejects a blank message id before reading', async () => {
  const store = new StoreStub();
  const service = new GetMessageService({ store });

  await assert.rejects(service.execute('   '), (error: unknown) => {
    return error instanceof MessageReadError && error.code === 'INVALID_REQUEST';
  });
  assert.equal(store.findMessageCalls.length, 0);
});

test('returns an ordered interaction directory of message refs only', async () => {
  const store = new StoreStub();
  store.interaction = {
    id: 'interaction-1',
    messages: [
      { messageId: 'message-1', position: 0 },
      { messageId: 'message-2', position: 1 },
    ],
  };
  const service = new GetInteractionService({ store });

  assert.deepEqual(await service.execute('interaction-1'), {
    id: 'interaction-1',
    messages: [
      { messageId: 'message-1', position: 0 },
      { messageId: 'message-2', position: 1 },
    ],
  });
});

test('returns an empty directory for an interaction with no messages', async () => {
  const store = new StoreStub();
  store.interaction = {
    id: 'interaction-empty',
    messages: [],
  };
  const service = new GetInteractionService({ store });

  assert.deepEqual(await service.execute('interaction-empty'), {
    id: 'interaction-empty',
    messages: [],
  });
});

test('returns a stable not-found error for a missing interaction', async () => {
  const store = new StoreStub();
  const service = new GetInteractionService({ store });

  await assert.rejects(service.execute('missing-interaction'), (error: unknown) => {
    return error instanceof MessageReadError && error.code === 'INTERACTION_NOT_FOUND';
  });
});

test('rejects a blank interaction id before reading', async () => {
  const store = new StoreStub();
  const service = new GetInteractionService({ store });

  await assert.rejects(service.execute(''), (error: unknown) => {
    return error instanceof MessageReadError && error.code === 'INVALID_REQUEST';
  });
  assert.equal(store.findInteractionCalls.length, 0);
});
