import type { CanonicalMessage } from '../shared/contracts.ts';
import type { UserWebConfig } from './config.ts';

interface SubmitMessageResponse {
  messageId: string;
  interactionId: string;
}

interface InteractionDirectory {
  id: string;
  messages: Array<{ messageId: string; position: string }>;
}

const requestJson = async <Response>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<Response> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...init?.headers,
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Core request failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as Response;
};

export class OpenMessageClient {
  private readonly config: UserWebConfig;

  constructor(config: UserWebConfig) {
    this.config = config;
  }

  async getMessage(messageId: string): Promise<CanonicalMessage> {
    return requestJson<CanonicalMessage>(
      `${this.config.coreUrl}/v1/messages/${encodeURIComponent(messageId)}`,
      this.config.messageApiToken,
    );
  }

  async getInteraction(interactionId: string): Promise<InteractionDirectory> {
    return requestJson<InteractionDirectory>(
      `${this.config.coreUrl}/v1/interactions/${encodeURIComponent(interactionId)}`,
      this.config.messageApiToken,
    );
  }

  async findReply(input: {
    interactionId: string;
    destination: string;
    content: string;
    preparedAt: string;
  }): Promise<CanonicalMessage | undefined> {
    const interaction = await this.getInteraction(input.interactionId);
    const messages = await Promise.all(
      interaction.messages.toReversed().map(({ messageId }) => this.getMessage(messageId)),
    );
    return messages.find(
      (message) =>
        message.origin === this.config.clientId &&
        message.destination === input.destination &&
        message.content === input.content &&
        message.createdAt >= input.preparedAt,
    );
  }

  async submitReply(input: {
    interactionId: string;
    destination: string;
    content: string;
  }): Promise<SubmitMessageResponse> {
    return requestJson<SubmitMessageResponse>(
      `${this.config.coreUrl}/v1/messages`,
      this.config.messageApiToken,
      {
        method: 'POST',
        body: JSON.stringify({
          interactionId: input.interactionId,
          message: {
            origin: this.config.clientId,
            destination: input.destination,
            content: input.content,
          },
        }),
      },
    );
  }

  async ensureEndpoint(): Promise<void> {
    const path = `${this.config.coreUrl}/v1/endpoints/${encodeURIComponent(this.config.clientId)}`;
    const current = await fetch(path, {
      headers: { authorization: `Bearer ${this.config.endpointConfigToken}` },
      signal: AbortSignal.timeout(8000),
    });
    const endpointHeaders = { 'x-openmessage-token': this.config.inboundToken };

    if (current.status === 404) {
      await requestJson(`${this.config.coreUrl}/v1/endpoints`, this.config.endpointConfigToken, {
        method: 'POST',
        body: JSON.stringify({
          id: this.config.clientId,
          egressAdapter: 'http',
          address: this.config.publicUrl,
          headers: endpointHeaders,
          enabled: this.config.enabled,
        }),
      });
      return;
    }

    if (!current.ok) {
      throw new Error(`Core endpoint lookup failed (${current.status}): ${await current.text()}`);
    }

    await requestJson(path, this.config.endpointConfigToken, {
      method: 'PATCH',
      body: JSON.stringify({
        address: this.config.publicUrl,
        headers: endpointHeaders,
        enabled: this.config.enabled,
      }),
    });
  }
}
