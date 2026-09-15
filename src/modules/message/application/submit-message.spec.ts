import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type CommitMessageInput,
  type EndpointResolver,
  type EndpointRoute,
  SubmitMessageError,
  SubmitMessageService,
  type SubmitMessageStore,
} from '../index.ts';

const enabledRoute: EndpointRoute = {
  endpointId: 'destination-1',
  egressAdapter: 'http',
  address: 'https://example.test/messages',
  enabled: true,
};

class ResolverStub implements EndpointResolver {
  calls: string[] = [];
  route: EndpointRoute | undefined = enabledRoute;

  async resolveEndpoint(endpointId: string): Promise<EndpointRoute | undefined> {
    this.calls.push(endpointId);
    return this.route;
  }
}

class StoreStub implements SubmitMessageStore {
  commits: CommitMessageInput[] = [];
  error: Error | undefined;

  async commit(input: CommitMessageInput): Promise<void> {
    if (this.error) {
      throw this.error;
    }
    this.commits.push(input);
  }
}

function createHarness(ids = ['interaction-generated', 'message-generated']) {
  const resolver = new ResolverStub();
  const store = new StoreStub();
  const remainingIds = [...ids];
  const service = new SubmitMessageService({
    endpointResolver: resolver,
    store,
    idFactory: () => {
      const id = remainingIds.shift();
      assert.ok(id);
      return id;
    },
    now: () => new Date('2026-09-15T00:00:00.000Z'),
  });
  return { resolver, service, store };
}

function command(interactionId?: string) {
  return {
    interactionId,
    message: {
      origin: 'origin-1',
      destination: 'destination-1',
      content: 'hello',
    },
  };
}

test('creates a new interaction and persists its first message', async () => {
  const { service, store } = createHarness();

  const result = await service.execute(command());

  assert.deepEqual(result, {
    interactionId: 'interaction-generated',
    messageId: 'message-generated',
  });
  assert.equal(store.commits.length, 1);
  assert.deepEqual(store.commits[0], {
    interactionId: 'interaction-generated',
    messageId: 'message-generated',
    createInteraction: true,
    origin: 'origin-1',
    destination: 'destination-1',
    content: 'hello',
    createdAt: new Date('2026-09-15T00:00:00.000Z'),
  });
});

test('appends to an existing interaction', async () => {
  const { service, store } = createHarness(['message-generated']);

  const result = await service.execute(command('interaction-existing'));

  assert.deepEqual(result, {
    interactionId: 'interaction-existing',
    messageId: 'message-generated',
  });
  assert.equal(store.commits[0]?.createInteraction, false);
});

test('rejects an unknown endpoint without starting persistence', async () => {
  const { resolver, service, store } = createHarness();
  resolver.route = undefined;

  await assert.rejects(service.execute(command()), (error: unknown) => {
    return error instanceof SubmitMessageError && error.code === 'ENDPOINT_NOT_FOUND';
  });
  assert.equal(store.commits.length, 0);
});

test('rejects a disabled endpoint without starting persistence', async () => {
  const { resolver, service, store } = createHarness();
  resolver.route = { ...enabledRoute, enabled: false };

  await assert.rejects(service.execute(command()), (error: unknown) => {
    return error instanceof SubmitMessageError && error.code === 'ENDPOINT_DISABLED';
  });
  assert.equal(store.commits.length, 0);
});

test('validates the request before resolving the endpoint', async () => {
  const { resolver, service, store } = createHarness();
  const invalidCommand = command();
  invalidCommand.message.content = '   ';

  await assert.rejects(service.execute(invalidCommand), (error: unknown) => {
    return error instanceof SubmitMessageError && error.code === 'INVALID_REQUEST';
  });
  assert.equal(resolver.calls.length, 0);
  assert.equal(store.commits.length, 0);
});

test('does not return accepted when persistence fails', async () => {
  const { service, store } = createHarness();
  const failure = new Error('database unavailable');
  store.error = failure;

  await assert.rejects(service.execute(command()), (error: unknown) => error === failure);
});

test('creates distinct message ids for duplicate submissions', async () => {
  const { service, store } = createHarness(['message-1', 'message-2']);

  const first = await service.execute(command('interaction-existing'));
  const second = await service.execute(command('interaction-existing'));

  assert.notEqual(first.messageId, second.messageId);
  assert.deepEqual(
    store.commits.map(({ messageId }) => messageId),
    ['message-1', 'message-2'],
  );
});
