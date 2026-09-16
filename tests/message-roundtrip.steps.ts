import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import { Given, Then, When } from '@cucumber/cucumber';
import type { ICustomWorld } from './support/custom-world.ts';

const endpointToken = 'e2e-endpoint-token';
const messageToken = 'e2e-message-token';

interface MessagePayload {
  origin: string;
  destination: string;
  content: string;
}

interface AcceptedMessage {
  messageId: string;
  interactionId: string;
}

interface StoredMessage extends MessagePayload {
  id: string;
  createdAt: string;
}

interface DispatchEnvelope {
  interactionId: string;
  message: StoredMessage;
}

interface Receiver {
  address: string;
  messages: DispatchEnvelope[];
  close: () => Promise<void>;
}

interface Endpoint {
  id: string;
  receiver: Receiver;
}

interface RoundtripState {
  baseUrl: string;
  endpointA: Endpoint;
  endpointB: Endpoint;
  first?: AcceptedMessage;
  firstContent?: string;
  second?: AcceptedMessage;
  secondContent?: string;
}

interface InteractionDirectory {
  id: string;
  messages: Array<{ messageId: string; position: string }>;
}

Given('two enabled HTTP endpoints A and B', async function (this: ICustomWorld) {
  const baseUrl = await this.server.listen({ host: '127.0.0.1', port: 0 });
  const [receiverA, receiverB] = await Promise.all([createReceiver(), createReceiver()]);
  this.cleanups.push(receiverA.close, receiverB.close);

  const suffix = randomUUID();
  const state: RoundtripState = {
    baseUrl,
    endpointA: { id: `e2e-a-${suffix}`, receiver: receiverA },
    endpointB: { id: `e2e-b-${suffix}`, receiver: receiverB },
  };
  this.context.roundtrip = state;

  await Promise.all([
    registerEndpoint(state.baseUrl, state.endpointA),
    registerEndpoint(state.baseUrl, state.endpointB),
  ]);
});

When('A sends {string} to B', async function (this: ICustomWorld, content: string) {
  const state = getState(this);
  state.firstContent = content;
  state.first = await submitMessage(state.baseUrl, {
    origin: state.endpointA.id,
    destination: state.endpointB.id,
    content,
  });
});

When(
  'B replies {string} to A in the same interaction',
  async function (this: ICustomWorld, content: string) {
    const state = getState(this);
    assert.ok(state.first, 'the first message must be submitted before the reply');
    state.secondContent = content;
    state.second = await submitMessage(
      state.baseUrl,
      {
        origin: state.endpointB.id,
        destination: state.endpointA.id,
        content,
      },
      state.first.interactionId,
    );
  },
);

Then(
  "B receives A's message and A receives B's reply over HTTP",
  async function (this: ICustomWorld) {
    const state = getCompleteState(this);
    const [receivedByB, receivedByA] = await Promise.all([
      waitForMessage(state.endpointB.receiver, state.first.messageId),
      waitForMessage(state.endpointA.receiver, state.second.messageId),
    ]);

    assert.equal(receivedByB.interactionId, state.first.interactionId);
    assertMessage(receivedByB.message, {
      id: state.first.messageId,
      origin: state.endpointA.id,
      destination: state.endpointB.id,
      content: state.firstContent,
    });
    assert.equal(receivedByA.interactionId, state.first.interactionId);
    assertMessage(receivedByA.message, {
      id: state.second.messageId,
      origin: state.endpointB.id,
      destination: state.endpointA.id,
      content: state.secondContent,
    });
  },
);

Then('the interaction lists both messages in order', async function (this: ICustomWorld) {
  const state = getCompleteState(this);
  const directory = await requestJson<InteractionDirectory>(
    `${state.baseUrl}/v1/interactions/${state.first.interactionId}`,
    { headers: messageHeaders() },
    200,
  );

  assert.equal(directory.id, state.first.interactionId);
  const [firstEntry, secondEntry] = directory.messages;
  assert.ok(firstEntry);
  assert.ok(secondEntry);
  assert.equal(directory.messages.length, 2);
  assert.equal(firstEntry.messageId, state.first.messageId);
  assert.equal(secondEntry.messageId, state.second.messageId);
  assert.ok(BigInt(firstEntry.position) < BigInt(secondEntry.position));
});

Then(
  'both messages can be read back with their exact content',
  async function (this: ICustomWorld) {
    const state = getCompleteState(this);
    const [first, second] = await Promise.all([
      readMessage(state.baseUrl, state.first.messageId),
      readMessage(state.baseUrl, state.second.messageId),
    ]);

    assertMessage(first, {
      id: state.first.messageId,
      origin: state.endpointA.id,
      destination: state.endpointB.id,
      content: state.firstContent,
    });
    assertMessage(second, {
      id: state.second.messageId,
      origin: state.endpointB.id,
      destination: state.endpointA.id,
      content: state.secondContent,
    });
  },
);

async function createReceiver(): Promise<Receiver> {
  const messages: DispatchEnvelope[] = [];
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/messages') {
      response.writeHead(404).end();
      return;
    }

    try {
      messages.push(await readEnvelope(request));
      response.writeHead(204).end();
    } catch {
      response.writeHead(400).end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  return {
    address: `http://127.0.0.1:${address.port}/messages`,
    messages,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function readEnvelope(request: IncomingMessage): Promise<DispatchEnvelope> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as DispatchEnvelope;
}

async function registerEndpoint(baseUrl: string, endpoint: Endpoint): Promise<void> {
  await requestJson<unknown>(
    `${baseUrl}/v1/endpoints`,
    {
      method: 'POST',
      headers: endpointHeaders(),
      body: JSON.stringify({
        id: endpoint.id,
        egressAdapter: 'http',
        address: endpoint.receiver.address,
        enabled: true,
      }),
    },
    201,
  );
}

async function submitMessage(
  baseUrl: string,
  message: MessagePayload,
  interactionId?: string,
): Promise<AcceptedMessage> {
  return requestJson<AcceptedMessage>(
    `${baseUrl}/v1/messages`,
    {
      method: 'POST',
      headers: messageHeaders(),
      body: JSON.stringify(interactionId ? { interactionId, message } : { message }),
    },
    201,
  );
}

async function readMessage(baseUrl: string, messageId: string): Promise<StoredMessage> {
  return requestJson<StoredMessage>(
    `${baseUrl}/v1/messages/${messageId}`,
    { headers: messageHeaders() },
    200,
  );
}

async function requestJson<T>(url: string, init: RequestInit, expectedStatus: number): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  assert.equal(response.status, expectedStatus, text);
  return JSON.parse(text) as T;
}

async function waitForMessage(receiver: Receiver, messageId: string): Promise<DispatchEnvelope> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const message = receiver.messages.find((item) => item.message.id === messageId);
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`receiver did not receive message ${messageId}`);
}

function endpointHeaders() {
  return {
    authorization: `Bearer ${endpointToken}`,
    'content-type': 'application/json',
  };
}

function messageHeaders() {
  return {
    authorization: `Bearer ${messageToken}`,
    'content-type': 'application/json',
  };
}

function getState(world: ICustomWorld): RoundtripState {
  const state = world.context.roundtrip as RoundtripState | undefined;
  assert.ok(state, 'the round-trip state has not been initialized');
  return state;
}

function getCompleteState(world: ICustomWorld) {
  const state = getState(world);
  assert.ok(state.first);
  assert.ok(state.firstContent);
  assert.ok(state.second);
  assert.ok(state.secondContent);
  return {
    ...state,
    first: state.first,
    firstContent: state.firstContent,
    second: state.second,
    secondContent: state.secondContent,
  };
}

function assertMessage(
  actual: StoredMessage,
  expected: Pick<StoredMessage, 'id' | 'origin' | 'destination' | 'content'>,
) {
  assert.equal(actual.id, expected.id);
  assert.equal(actual.origin, expected.origin);
  assert.equal(actual.destination, expected.destination);
  assert.equal(actual.content, expected.content);
  assert.ok(!Number.isNaN(Date.parse(actual.createdAt)));
}
