import type {
  EgressAdapter,
  EgressEnvelope,
  EgressLogger,
  EndpointResolver,
  MessageDispatcher,
} from '#src/modules/message/index.ts';

interface BestEffortDispatcherDependencies {
  endpointResolver: EndpointResolver;
  adapters: ReadonlyMap<string, EgressAdapter>;
  logger: EgressLogger;
}

export class BestEffortDispatcher implements MessageDispatcher {
  readonly #endpointResolver: EndpointResolver;
  readonly #adapters: ReadonlyMap<string, EgressAdapter>;
  readonly #logger: EgressLogger;

  constructor({ endpointResolver, adapters, logger }: BestEffortDispatcherDependencies) {
    this.#endpointResolver = endpointResolver;
    this.#adapters = adapters;
    this.#logger = logger;
  }

  dispatch(envelope: EgressEnvelope): void {
    let adapterName = 'unresolved';

    void this.#deliver(envelope, (name) => {
      adapterName = name;
    }).catch((error: unknown) => {
      this.#logger.error(
        {
          messageId: envelope.message.id,
          interactionId: envelope.interactionId,
          destination: envelope.message.destination,
          adapter: adapterName,
          error,
        },
        'Best-effort egress delivery failed',
      );
    });
  }

  async #deliver(envelope: EgressEnvelope, onResolved: (adapter: string) => void): Promise<void> {
    const route = await this.#endpointResolver.resolveEndpoint(envelope.message.destination);
    if (!route) {
      throw new Error('Destination endpoint no longer exists');
    }
    if (!route.enabled) {
      throw new Error('Destination endpoint is disabled');
    }

    onResolved(route.egressAdapter);
    const adapter = this.#adapters.get(route.egressAdapter);
    if (!adapter) {
      throw new Error(`Unsupported egress adapter: ${route.egressAdapter}`);
    }

    await adapter.deliver(route.address, envelope);
  }
}
