import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  type ActionInvocation,
  actionTypes,
  type GestureAction,
  type GestureConfig,
  type GestureSlot,
  type InboundEnvelope,
} from '../shared/contracts.ts';
import { ActionService } from './action-service.ts';
import type { UserWebConfig } from './config.ts';
import { DeckStore } from './deck-store.ts';
import { OpenMessageClient } from './openmessage-client.ts';

const gestureSlots: GestureSlot[] = ['left', 'right', 'up', 'down', 'custom-input'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isAction = (value: unknown): value is ActionInvocation => {
  if (!isRecord(value) || !actionTypes.includes(value.type as ActionInvocation['type'])) {
    return false;
  }
  if (value.value !== undefined && typeof value.value !== 'string') {
    return false;
  }
  return value.type !== 'send-fixed-message' || Boolean(value.value?.trim());
};

const parseGestures = (value: unknown): GestureConfig | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const entries: Partial<Record<GestureSlot, GestureAction>> = {};
  for (const slot of gestureSlots) {
    const action = value[slot];
    if (!isAction(action)) {
      return undefined;
    }
    entries[slot] = action;
  }
  return entries as GestureConfig;
};

const parseEnvelope = (value: unknown): InboundEnvelope | undefined => {
  if (!isRecord(value) || typeof value.interactionId !== 'string' || !isRecord(value.message)) {
    return undefined;
  }
  const message = value.message;
  if (
    typeof message.id !== 'string' ||
    typeof message.origin !== 'string' ||
    typeof message.destination !== 'string' ||
    typeof message.content !== 'string' ||
    typeof message.createdAt !== 'string'
  ) {
    return undefined;
  }
  return {
    interactionId: value.interactionId,
    message: {
      id: message.id,
      origin: message.origin,
      destination: message.destination,
      content: message.content,
      createdAt: message.createdAt,
    },
  };
};

export const buildApp = async (config: UserWebConfig): Promise<FastifyInstance> => {
  const app = Fastify({ logger: true });
  const store = new DeckStore(config.dataFile);
  await store.load();
  const core = new OpenMessageClient(config);
  const actions = new ActionService(store, core);

  app.get('/health', async () => ({ status: 'ok', clientId: config.clientId }));

  app.post('/api/inbound', async (request, reply) => {
    if (config.inboundToken && request.headers['x-openmessage-token'] !== config.inboundToken) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const envelope = parseEnvelope(request.body);
    if (!envelope) {
      return reply.code(400).send({ error: 'Invalid openMessage envelope' });
    }
    if (envelope.message.destination !== config.clientId) {
      return reply.code(409).send({ error: 'Message destination does not match this client' });
    }
    const result = await store.add(envelope);
    return reply.code(result.created ? 201 : 200).send(result);
  });

  app.get('/api/deck', async (_request, reply) => {
    try {
      const items = await Promise.all(
        store.listActive().map(async (item) => ({
          ...item,
          message: await core.getMessage(item.messageId),
        })),
      );
      return { items };
    } catch (error) {
      return reply.code(502).send({ error: (error as Error).message });
    }
  });

  app.get<{ Params: { messageId: string } }>(
    '/api/items/:messageId/context',
    async (request, reply) => {
      const item = store.get(request.params.messageId);
      if (!item) {
        return reply.code(404).send({ error: 'Deck item not found' });
      }
      try {
        return { interaction: await core.getInteraction(item.interactionId) };
      } catch (error) {
        return reply.code(502).send({ error: (error as Error).message });
      }
    },
  );

  app.post<{ Params: { messageId: string } }>(
    '/api/items/:messageId/actions',
    async (request, reply) => {
      if (!isAction(request.body)) {
        return reply.code(400).send({ error: 'Invalid action' });
      }
      try {
        return await actions.execute(request.params.messageId, request.body);
      } catch (error) {
        const message = (error as Error).message;
        const status = message === 'Deck item not found' ? 404 : 409;
        return reply.code(status).send({ error: message });
      }
    },
  );

  app.get('/api/gestures', async () => ({ gestures: store.getGestures() }));

  app.put('/api/gestures', async (request, reply) => {
    const gestures = parseGestures(request.body);
    if (!gestures) {
      return reply.code(400).send({ error: 'Invalid gesture configuration' });
    }
    return { gestures: await store.setGestures(gestures) };
  });

  app.get('/api/config', async () => ({
    clientId: config.clientId,
    coreUrl: config.coreUrl,
    enabled: config.enabled,
  }));

  const staticRoot = resolve(import.meta.dirname, '../../dist');
  if (existsSync(staticRoot)) {
    await app.register(fastifyStatic, { root: staticRoot, wildcard: false });
    app.setNotFoundHandler((_request, reply) => reply.sendFile('index.html'));
  }

  return app;
};
