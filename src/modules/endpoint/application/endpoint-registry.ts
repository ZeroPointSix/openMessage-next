export interface EndpointRoute {
  endpointId: string;
  egressAdapter: string;
  address: string;
  enabled: boolean;
}

export interface CreateEndpointCommand {
  endpointId: string;
  egressAdapter: string;
  address: string;
  enabled: boolean;
}

export interface UpdateEndpointCommand {
  endpointId: string;
  egressAdapter: string;
  address: string;
  enabled: boolean;
}

export interface EndpointStore {
  create(endpoint: EndpointRoute): Promise<boolean>;
  findById(endpointId: string): Promise<EndpointRoute | undefined>;
  update(endpoint: EndpointRoute): Promise<boolean>;
}

export type EndpointRegistryErrorCode =
  | 'INVALID_REQUEST'
  | 'ENDPOINT_ALREADY_EXISTS'
  | 'ENDPOINT_NOT_FOUND'
  | 'ENDPOINT_DISABLED';

export class EndpointRegistryError extends Error {
  readonly code: EndpointRegistryErrorCode;

  constructor(code: EndpointRegistryErrorCode, message: string) {
    super(message);
    this.name = 'EndpointRegistryError';
    this.code = code;
  }
}

interface EndpointRegistryDependencies {
  store: EndpointStore;
}

export class CreateEndpointService {
  readonly #store: EndpointStore;

  constructor({ store }: EndpointRegistryDependencies) {
    this.#store = store;
  }

  async execute(command: CreateEndpointCommand): Promise<EndpointRoute> {
    validateEndpoint(command);
    const endpoint = toRoute(command);

    if (!(await this.#store.create(endpoint))) {
      throw new EndpointRegistryError(
        'ENDPOINT_ALREADY_EXISTS',
        `Endpoint ${command.endpointId} already exists`,
      );
    }

    return endpoint;
  }
}

export class GetEndpointService {
  readonly #store: EndpointStore;

  constructor({ store }: EndpointRegistryDependencies) {
    this.#store = store;
  }

  async execute(endpointId: string): Promise<EndpointRoute> {
    assertNonBlank(endpointId, 'endpointId');
    return this.#findRequired(endpointId);
  }

  async #findRequired(endpointId: string): Promise<EndpointRoute> {
    const endpoint = await this.#store.findById(endpointId);
    if (!endpoint) {
      throw endpointNotFound(endpointId);
    }
    return endpoint;
  }
}

export class UpdateEndpointService {
  readonly #store: EndpointStore;

  constructor({ store }: EndpointRegistryDependencies) {
    this.#store = store;
  }

  async execute(command: UpdateEndpointCommand): Promise<EndpointRoute> {
    validateEndpoint(command);
    const endpoint = toRoute(command);

    if (!(await this.#store.update(endpoint))) {
      throw endpointNotFound(command.endpointId);
    }

    return endpoint;
  }
}

export class ResolveEndpointService {
  readonly #store: EndpointStore;

  constructor({ store }: EndpointRegistryDependencies) {
    this.#store = store;
  }

  async execute(endpointId: string): Promise<EndpointRoute> {
    assertNonBlank(endpointId, 'endpointId');
    const endpoint = await this.#store.findById(endpointId);

    if (!endpoint) {
      throw endpointNotFound(endpointId);
    }
    if (!endpoint.enabled) {
      throw new EndpointRegistryError('ENDPOINT_DISABLED', `Endpoint ${endpointId} is disabled`);
    }

    return endpoint;
  }

  async resolveEndpoint(endpointId: string): Promise<EndpointRoute> {
    return this.execute(endpointId);
  }
}

function validateEndpoint(command: CreateEndpointCommand | UpdateEndpointCommand): void {
  assertNonBlank(command.endpointId, 'endpointId');
  assertNonBlank(command.egressAdapter, 'egressAdapter');
  assertNonBlank(command.address, 'address');
  if (typeof command.enabled !== 'boolean') {
    throw new EndpointRegistryError('INVALID_REQUEST', 'enabled must be a boolean');
  }
}

function assertNonBlank(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new EndpointRegistryError('INVALID_REQUEST', `${field} must be a non-empty string`);
  }
}

function endpointNotFound(endpointId: string): EndpointRegistryError {
  return new EndpointRegistryError('ENDPOINT_NOT_FOUND', `Endpoint ${endpointId} does not exist`);
}

function toRoute(command: CreateEndpointCommand | UpdateEndpointCommand): EndpointRoute {
  return {
    endpointId: command.endpointId,
    egressAdapter: command.egressAdapter,
    address: command.address,
    enabled: command.enabled,
  };
}
