import { randomUUID } from 'node:crypto';

export interface SubmitMessageCommand {
  interactionId?: string;
  message: {
    origin: string;
    destination: string;
    content: string;
  };
}

export interface SubmitMessageResult {
  messageId: string;
  interactionId: string;
}

export interface EndpointRoute {
  endpointId: string;
  egressAdapter: string;
  address: string;
  enabled: boolean;
}

export interface EndpointResolver {
  resolveEndpoint(endpointId: string): Promise<EndpointRoute | undefined>;
}

export interface CommitMessageInput {
  messageId: string;
  interactionId: string;
  createInteraction: boolean;
  origin: string;
  destination: string;
  content: string;
  createdAt: Date;
}

export interface SubmitMessageStore {
  commit(input: CommitMessageInput): Promise<void>;
}

export type SubmitMessageErrorCode =
  | 'INVALID_REQUEST'
  | 'ENDPOINT_NOT_FOUND'
  | 'ENDPOINT_DISABLED'
  | 'INTERACTION_NOT_FOUND';

export class SubmitMessageError extends Error {
  readonly code: SubmitMessageErrorCode;

  constructor(code: SubmitMessageErrorCode, message: string) {
    super(message);
    this.name = 'SubmitMessageError';
    this.code = code;
  }
}

interface SubmitMessageDependencies {
  endpointResolver: EndpointResolver;
  store: SubmitMessageStore;
  idFactory?: () => string;
  now?: () => Date;
}

export class SubmitMessageService {
  readonly #endpointResolver: EndpointResolver;
  readonly #store: SubmitMessageStore;
  readonly #idFactory: () => string;
  readonly #now: () => Date;

  constructor({
    endpointResolver,
    store,
    idFactory = randomUUID,
    now = () => new Date(),
  }: SubmitMessageDependencies) {
    this.#endpointResolver = endpointResolver;
    this.#store = store;
    this.#idFactory = idFactory;
    this.#now = now;
  }

  async execute(command: SubmitMessageCommand): Promise<SubmitMessageResult> {
    validateCommand(command);

    const route = await this.#endpointResolver.resolveEndpoint(command.message.destination);
    if (!route) {
      throw new SubmitMessageError(
        'ENDPOINT_NOT_FOUND',
        `Endpoint ${command.message.destination} does not exist`,
      );
    }
    if (!route.enabled) {
      throw new SubmitMessageError(
        'ENDPOINT_DISABLED',
        `Endpoint ${command.message.destination} is disabled`,
      );
    }

    const createInteraction = command.interactionId === undefined;
    const interactionId = command.interactionId ?? this.#idFactory();
    const messageId = this.#idFactory();

    await this.#store.commit({
      messageId,
      interactionId,
      createInteraction,
      origin: command.message.origin,
      destination: command.message.destination,
      content: command.message.content,
      createdAt: this.#now(),
    });

    return { messageId, interactionId };
  }
}

function validateCommand(command: SubmitMessageCommand): void {
  assertNonBlank(command.interactionId, 'interactionId', true);
  assertNonBlank(command.message?.origin, 'message.origin');
  assertNonBlank(command.message?.destination, 'message.destination');
  assertNonBlank(command.message?.content, 'message.content');
}

function assertNonBlank(value: string | undefined, field: string, optional = false): void {
  if (optional && value === undefined) {
    return;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SubmitMessageError('INVALID_REQUEST', `${field} must be a non-empty string`);
  }
}
