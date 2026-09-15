import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import type {
  EgressAdapter,
  EgressEnvelope,
  EgressLogger,
  EndpointResolver,
  EndpointRoute,
} from '#src/modules/message/index.ts';
import { BestEffortDispatcher } from './best-effort-dispatcher.ts';

const envelope: EgressEnvelope = {
  interactionId: 'interaction-1',
  message: {
    id: 'message-1',
    origin: 'origin-1',
    destination: 'destination-1',
    content: 'hello',
    createdAt: '2026-09-15T00:00:00.000Z',
  },
};
const route: EndpointRoute = {
  endpointId: 'destination-1',
  egressAdapter: 'http',
  address: 'https://example.test/messages',
  enabled: true,
};

class ResolverStub implements EndpointResolver {
  route: EndpointRoute | undefined = route;
  calls: string[] = [];

  async resolveEndpoint(endpointId: string): Promise<EndpointRoute | undefined> {
    this.calls.push(endpointId);
    return this.route;
  }
}

class AdapterStub implements EgressAdapter {
  deliveries: Array<{ address: string; envelope: EgressEnvelope }> = [];
  error: Error | undefined;

  async deliver(address: string, deliveredEnvelope: EgressEnvelope): Promise<void> {
    this.deliveries.push({ address, envelope: deliveredEnvelope });
    if (this.error) {
      throw this.error;
    }
  }
}

class LoggerStub implements EgressLogger {
  errors: Array<{ bindings: Parameters<EgressLogger['error']>[0]; message: string }> = [];

  error(bindings: Parameters<EgressLogger['error']>[0], message: string): void {
    this.errors.push({ bindings, message });
  }
}

test('resolves the endpoint and delivers exactly once through its selected adapter', async () => {
  const resolver = new ResolverStub();
  const adapter = new AdapterStub();
  const logger = new LoggerStub();
  const dispatcher = new BestEffortDispatcher({
    endpointResolver: resolver,
    adapters: new Map([['http', adapter]]),
    logger,
  });

  dispatcher.dispatch(envelope);
  await flush();

  assert.deepEqual(resolver.calls, ['destination-1']);
  assert.deepEqual(adapter.deliveries, [{ address: 'https://example.test/messages', envelope }]);
  assert.equal(logger.errors.length, 0);
});

test('contains delivery rejection and emits structured metadata', async () => {
  const resolver = new ResolverStub();
  const adapter = new AdapterStub();
  adapter.error = new Error('connection failed');
  const logger = new LoggerStub();
  const dispatcher = new BestEffortDispatcher({
    endpointResolver: resolver,
    adapters: new Map([['http', adapter]]),
    logger,
  });

  assert.doesNotThrow(() => dispatcher.dispatch(envelope));
  await flush();

  assert.equal(logger.errors.length, 1);
  assert.deepEqual(logger.errors[0]?.bindings, {
    messageId: 'message-1',
    interactionId: 'interaction-1',
    destination: 'destination-1',
    adapter: 'http',
    error: adapter.error,
  });
  assert.equal(logger.errors[0]?.message, 'Best-effort egress delivery failed');
});

test('logs unsupported adapters without attempting delivery', async () => {
  const resolver = new ResolverStub();
  resolver.route = { ...route, egressAdapter: 'missing' };
  const logger = new LoggerStub();
  const dispatcher = new BestEffortDispatcher({
    endpointResolver: resolver,
    adapters: new Map(),
    logger,
  });

  dispatcher.dispatch(envelope);
  await flush();

  assert.equal(logger.errors[0]?.bindings.adapter, 'missing');
  assert.match(String(logger.errors[0]?.bindings.error), /Unsupported egress adapter/);
});
