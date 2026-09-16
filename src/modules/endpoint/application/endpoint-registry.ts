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
  egressAdapter?: string;
  address?: string;
  enabled?: boolean;
}

export interface EndpointStore {
  create(endpoint: EndpointRoute): Promise<boolean>;
  findById(endpointId: string): Promise<EndpointRoute | undefined>;
  update(command: UpdateEndpointCommand): Promise<EndpointRoute | undefined>;
}

export type EndpointRegistryErrorCode =
  | 'INVALID_REQUEST'
  | 'ENDPOINT_ALREADY_EXISTS'
  | 'ENDPOINT_NOT_FOUND';

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
    validateCreateEndpoint(command);
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
    validateUpdateEndpoint(command);
    const endpoint = await this.#store.update(command);

    if (!endpoint) {
      throw endpointNotFound(command.endpointId);
    }

    return endpoint;
  }
}

function validateCreateEndpoint(command: CreateEndpointCommand): void {
  assertNonBlank(command.endpointId, 'endpointId');
  assertNonBlank(command.egressAdapter, 'egressAdapter');
  assertEndpointAddress(command.address);
  if (typeof command.enabled !== 'boolean') {
    throw new EndpointRegistryError('INVALID_REQUEST', 'enabled must be a boolean');
  }
}

function validateUpdateEndpoint(command: UpdateEndpointCommand): void {
  assertNonBlank(command.endpointId, 'endpointId');
  if (
    command.egressAdapter === undefined &&
    command.address === undefined &&
    command.enabled === undefined
  ) {
    throw new EndpointRegistryError('INVALID_REQUEST', 'at least one endpoint field is required');
  }
  if (command.egressAdapter !== undefined) {
    assertNonBlank(command.egressAdapter, 'egressAdapter');
  }
  if (command.address !== undefined) {
    assertEndpointAddress(command.address);
  }
  if (command.enabled !== undefined && typeof command.enabled !== 'boolean') {
    throw new EndpointRegistryError('INVALID_REQUEST', 'enabled must be a boolean');
  }
}

function assertEndpointAddress(value: string): void {
  assertNonBlank(value, 'address');
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.length > 0
    ) {
      return;
    }
  } catch {
    // Report a stable validation error below.
  }
  throw new EndpointRegistryError(
    'INVALID_REQUEST',
    'address must be a valid HTTP(S) URL with a host',
  );
}

function assertNonBlank(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new EndpointRegistryError('INVALID_REQUEST', `${field} must be a non-empty string`);
  }
}

function endpointNotFound(endpointId: string): EndpointRegistryError {
  return new EndpointRegistryError('ENDPOINT_NOT_FOUND', `Endpoint ${endpointId} does not exist`);
}

function toRoute(command: CreateEndpointCommand): EndpointRoute {
  return {
    endpointId: command.endpointId,
    egressAdapter: command.egressAdapter,
    address: command.address,
    enabled: command.enabled,
  };
}
