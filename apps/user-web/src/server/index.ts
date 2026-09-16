import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { OpenMessageClient } from './openmessage-client.ts';

const config = loadConfig();
const app = await buildApp(config);

try {
  await app.listen({ host: config.host, port: config.port });
  if (config.registerEndpoint) {
    await new OpenMessageClient(config).ensureEndpoint();
    app.log.info(
      { clientId: config.clientId, address: config.publicUrl },
      'Core endpoint registration ready',
    );
  }
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
