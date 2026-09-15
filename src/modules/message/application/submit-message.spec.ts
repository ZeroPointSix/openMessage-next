import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import { BestEffortDispatcher } from '#src/adapters/egress/best-effort-dispatcher.ts';
import {
  type CommitMessageInput,
  type EgressEnvelope,
  type EndpointResolver,
  type EndpointRoute,
  type MessageDispatcher,
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

class DispatcherStub implements MessageDispatcher {
  deliveries: EgressEnvelope[] = [];

  dispatch(envelope: EgressEnvelope): void {
    this.deliveries.push(envelope);
  }
}

class StoreStub implements SubmitMessageStore {
  commits: CommitMessageInput[] = [];
  startedCommits: CommitMessageInput[] = [];
  gate: Promise<void> | undefined;
  error: Error | undefined;

  async commit(input: CommitMessageInput): Promise<void> {
    this.startedCommits.push(input);
    if (this.error) {
      throw this.error;
    }
    await this.gate;
    this.commits.push(input);
  }
}

function createHarness(ids = ['interaction-generated', 'message-generated']) {
  const resolver = new ResolverStub();
  const store = new StoreStub();
  const dispatcher = new DispatcherStub();
  const remainingIds = [...ids];
  const service = new SubmitMessageService({
    endpointResolver: resolver,
    store,
    dispatcher,
    idFactory: () => {
      const id = remainingIds.shift();
      assert.ok(id);
      return id;
    },
    now: () => new Date('2026-09-15T00:00:00.000Z'),
  });
  return { dispatcher, resolver, service, store };
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
  const { dispatcher, service, store } = createHarness();

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
  assert.deepEqual(dispatcher.deliveries, [
    {
      interactionId: 'interaction-generated',
      message: {
        id: 'message-generated',
        origin: 'origin-1',
        destination: 'destination-1',
        content: 'hello',
        createdAt: '2026-09-15T00:00:00.000Z',
      },
    },
  ]);
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

test('dispatches only after commit and returns accepted without waiting for delivery', async () => {
  let releaseCommit: (() => void) | undefined;
  const commitGate = new Promise<void>((resolve) => {
    releaseCommit = resolve;
  });
  const resolver = new ResolverStub();
  const store = new StoreStub();
  store.gate = commitGate;
  let deliveryStarted = false;
  const dispatcher = new BestEffortDispatcher({
    endpointResolver: resolver,
    adapters: new Map([
      [
        'http',
        {
          async deliver(): Promise<void> {
            deliveryStarted = true;
            await new Promise<void>(() => undefined);
          },
        },
      ],
    ]),
    logger: {
      error: () => assert.fail('delivery must remain pending without logging an error'),
    },
  });
  const remainingIds = ['interaction-generated', 'message-generated'];
  const service = new SubmitMessageService({
    endpointResolver: resolver,
    store,
    dispatcher,
    idFactory: () => {
      const id = remainingIds.shift();
      assert.ok(id);
      return id;
    },
    now: () => new Date('2026-09-15T00:00:00.000Z'),
  });

  let acceptedSettled = false;
  const accepted = service.execute(command()).then((result) => {
    acceptedSettled = true;
    return result;
  });
  await flush();

  assert.equal(store.startedCommits.length, 1);
  assert.equal(acceptedSettled, false);
  assert.equal(deliveryStarted, false);

  releaseCommit?.();
  const result = await accepted;
  await flush();

  assert.deepEqual(result, {
    interactionId: 'interaction-generated',
    messageId: 'message-generated',
  });
  assert.equal(deliveryStarted, true);
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