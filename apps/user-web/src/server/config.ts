import { resolve } from 'node:path';

export interface UserWebConfig {
  host: string;
  port: number;
  clientId: string;
  publicUrl: string;
  dataFile: string;
  enabled: boolean;
  registerEndpoint: boolean;
  coreUrl: string;
  messageApiToken: string;
  endpointConfigToken: string;
  inboundToken: string;
  humanApiToken: string;
}

const readBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }
  return value === 'true';
};

const readPort = (value: string | undefined): number => {
  const port = Number(value ?? '4173');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('USER_WEB_PORT must be an integer between 1 and 65535');
  }
  return port;
};

const requireValue = (name: string, value: string | undefined): string => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  return normalized;
};

export const loadConfig = (environment = process.env): UserWebConfig => {
  const port = readPort(environment.USER_WEB_PORT);
  const host = environment.USER_WEB_HOST?.trim() || '0.0.0.0';
  const clientId = environment.USER_WEB_CLIENT_ID?.trim() || 'user-web';
  const coreUrl = environment.OPENMESSAGE_CORE_URL?.trim() || 'http://127.0.0.1:3000';

  return {
    host,
    port,
    clientId,
    publicUrl: environment.USER_WEB_PUBLIC_URL?.trim() || `http://127.0.0.1:${port}/api/inbound`,
    dataFile: resolve(environment.USER_WEB_DATA_FILE?.trim() || '.data/deck.json'),
    enabled: readBoolean(environment.USER_WEB_ENABLED, true),
    registerEndpoint: readBoolean(environment.USER_WEB_REGISTER_ENDPOINT, true),
    coreUrl: coreUrl.replace(/\/$/, ''),
    messageApiToken: requireValue(
      'OPENMESSAGE_MESSAGE_API_TOKEN',
      environment.OPENMESSAGE_MESSAGE_API_TOKEN,
    ),
    endpointConfigToken: requireValue(
      'OPENMESSAGE_ENDPOINT_CONFIG_TOKEN',
      environment.OPENMESSAGE_ENDPOINT_CONFIG_TOKEN,
    ),
    inboundToken: requireValue('USER_WEB_INBOUND_TOKEN', environment.USER_WEB_INBOUND_TOKEN),
    humanApiToken: requireValue('USER_WEB_HUMAN_API_TOKEN', environment.USER_WEB_HUMAN_API_TOKEN),
  };
};
