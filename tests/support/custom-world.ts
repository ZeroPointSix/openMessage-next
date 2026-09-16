import { type IWorldOptions, setWorldConstructor, World } from '@cucumber/cucumber';
import type * as messages from '@cucumber/messages';
import type { FastifyInstance } from 'fastify';

export interface TestContext {
  [key: string]: unknown;
}

export type AsyncCleanup = () => Promise<void>;

export interface ICustomWorld extends World {
  debug: boolean;
  feature?: messages.Pickle;
  testName?: string;
  startTime?: Date;
  server: FastifyInstance;
  context: TestContext;
  cleanups: AsyncCleanup[];
}

export class CustomWorld extends World implements ICustomWorld {
  constructor(options: IWorldOptions) {
    super(options);
  }

  debug = false;
  server = undefined as unknown as FastifyInstance;
  context: TestContext = {};
  cleanups: AsyncCleanup[] = [];
}

setWorldConstructor(CustomWorld);
