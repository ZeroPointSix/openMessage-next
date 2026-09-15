import type { EgressAdapter, EgressEnvelope } from '#src/modules/message/index.ts';

type Fetch = (input: string | URL | globalThis.Request, init?: RequestInit) => Promise<Response>;

interface HttpEgressAdapterDependencies {
  timeoutMs: number;
  fetch?: Fetch;
}

export class HttpEgressAdapter implements EgressAdapter {
  readonly #timeoutMs: number;
  readonly #fetch: Fetch;

  constructor({
    timeoutMs,
    fetch: fetchImplementation = globalThis.fetch,
  }: HttpEgressAdapterDependencies) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error('HTTP egress timeout must be a positive integer');
    }
    this.#timeoutMs = timeoutMs;
    this.#fetch = fetchImplementation;
  }

  async deliver(address: string, envelope: EgressEnvelope): Promise<void> {
    const response = await this.#fetch(address, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`HTTP egress returned status ${response.status}`);
    }
  }
}