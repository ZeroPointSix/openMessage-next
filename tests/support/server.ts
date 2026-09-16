import Fastify, { LogController } from 'fastify';

export const buildApp = async () => {
  configureTestEnvironment();
  const { default: server } = await import('../../src/server/index.ts');
  const app = Fastify({
    logger: {
      level: 'warn',
    },
    logController: new LogController({ disableRequestLogging: true }),
    routerOptions: {
      ignoreDuplicateSlashes: true,
    },
    ajv: {
      customOptions: {
        keywords: ['example'],
      },
    },
  });

  await server(app);
  return app;
};

function configureTestEnvironment() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL is required to run E2E tests');
  }

  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!databaseName) {
    throw new Error('TEST_DATABASE_URL must include a database name');
  }

  process.env.POSTGRES_URL = url.port ? `${url.hostname}:${url.port}` : url.hostname;
  process.env.POSTGRES_USER = decodeURIComponent(url.username);
  process.env.POSTGRES_PASSWORD = decodeURIComponent(url.password);
  process.env.POSTGRES_DB = databaseName;
  process.env.POSTGRES_SSL = url.searchParams.get('sslmode') === 'require' ? 'true' : 'false';
  process.env.LOG_LEVEL = 'warn';
  process.env.NODE_ENV = 'test';
  process.env.ENDPOINT_CONFIG_TOKEN = 'e2e-endpoint-token';
  process.env.MESSAGE_API_TOKEN = 'e2e-message-token';
}
