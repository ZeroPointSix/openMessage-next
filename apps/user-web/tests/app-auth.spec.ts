import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app.ts';
import type { UserWebConfig } from '../src/server/config.ts';

describe('user-web authentication boundaries', () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  const makeApp = async () => {
    const directory = await mkdtemp(join(tmpdir(), 'user-web-auth-'));
    const config: UserWebConfig = {
      host: '127.0.0.1',
      port: 4173,
      clientId: 'user-web',
      publicUrl: 'http://127.0.0.1:4173/api/inbound',
      dataFile: join(directory, 'deck.json'),
      enabled: true,
      registerEndpoint: false,
      coreUrl: 'http://127.0.0.1:3000',
      messageApiToken: 'message-test-token',
      endpointConfigToken: 'endpoint-test-token',
      inboundToken: 'core-inbound-token',
      humanApiToken: 'human-session-token',
    };
    const app = await buildApp(config);
    apps.push(app);
    return app;
  };

  it('protects every Human API independently from Core inbound authentication', async () => {
    const app = await makeApp();
    const requests = [
      { method: 'GET', url: '/api/deck' },
      { method: 'GET', url: '/api/config' },
      { method: 'GET', url: '/api/gestures' },
      { method: 'GET', url: '/api/items/message-1/context' },
      { method: 'POST', url: '/api/items/message-1/actions', payload: { type: 'skip' } },
      { method: 'PUT', url: '/api/gestures', payload: {} },
    ] as const;
    for (const request of requests) {
      expect((await app.inject(request)).statusCode).toBe(401);
    }
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/config',
          headers: {
            authorization: 'Bearer human-session-token',
          },
        })
      ).statusCode,
    ).toBe(200);

    const envelope = {
      interactionId: 'interaction-1',
      message: {
        id: 'message-1',
        origin: 'client-a',
        destination: 'user-web',
        content: 'Hello',
        createdAt: '2026-09-16T00:00:00.000Z',
      },
    };
    expect(
      (await app.inject({ method: 'POST', url: '/api/inbound', payload: envelope })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/inbound',
          payload: envelope,
          headers: { 'x-openmessage-token': 'core-inbound-token' },
        })
      ).statusCode,
    ).toBe(201);
  });
});
