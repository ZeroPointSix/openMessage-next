import type {
  ActionInvocation,
  ActionResult,
  GestureConfig,
  HydratedDeckItem,
} from '../shared/contracts.ts';

interface DeckResponse {
  items: HydratedDeckItem[];
}
interface GestureResponse {
  gestures: GestureConfig;
}
interface ConfigResponse {
  clientId: string;
  coreUrl: string;
  enabled: boolean;
}

const request = async <Response>(path: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new Error(detail?.error ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as Response;
};

export const api = {
  deck: () => request<DeckResponse>('/api/deck'),
  gestures: () => request<GestureResponse>('/api/gestures'),
  config: () => request<ConfigResponse>('/api/config'),
  context: (messageId: string) =>
    request<{ interaction: unknown }>(`/api/items/${encodeURIComponent(messageId)}/context`),
  act: (messageId: string, action: ActionInvocation) =>
    request<ActionResult>(`/api/items/${encodeURIComponent(messageId)}/actions`, {
      method: 'POST',
      body: JSON.stringify(action),
    }),
  saveGestures: (gestures: GestureConfig) =>
    request<GestureResponse>('/api/gestures', {
      method: 'PUT',
      body: JSON.stringify(gestures),
    }),
};
